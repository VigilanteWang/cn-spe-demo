import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DirectoryPrincipalSearchError,
  IDirectorySearchGraphClient,
  clearDirectoryPrincipalSearchCache,
  searchDirectoryPrincipals,
} from "./directoryPrincipalSearch";

interface IRecordedGraphRequest {
  path: string;
  selects: string[];
  tops: number[];
  filters: string[];
  searches: string[];
  queries: Array<string | Record<string, string | number>>;
  headers: Array<{ name: string; value: string }>;
}

class FakeGraphRequest {
  private readonly recordedRequest: IRecordedGraphRequest;

  constructor(
    path: string,
    private readonly resolveResponse: (path: string) => Promise<unknown>,
  ) {
    this.recordedRequest = {
      path,
      selects: [],
      tops: [],
      filters: [],
      searches: [],
      queries: [],
      headers: [],
    };
  }

  get request(): IRecordedGraphRequest {
    return this.recordedRequest;
  }

  select(properties: string): FakeGraphRequest {
    this.recordedRequest.selects.push(properties);
    return this;
  }

  top(count: number): FakeGraphRequest {
    this.recordedRequest.tops.push(count);
    return this;
  }

  filter(filter: string): FakeGraphRequest {
    this.recordedRequest.filters.push(filter);
    return this;
  }

  search(search: string): FakeGraphRequest {
    this.recordedRequest.searches.push(search);
    return this;
  }

  query(
    parameters: string | Record<string, string | number>,
  ): FakeGraphRequest {
    this.recordedRequest.queries.push(parameters);
    return this;
  }

  header(name: string, value: string): FakeGraphRequest {
    this.recordedRequest.headers.push({ name, value });
    return this;
  }

  get(): Promise<unknown> {
    return this.resolveResponse(this.recordedRequest.path);
  }
}

class FakeGraphClient implements IDirectorySearchGraphClient {
  readonly requests: IRecordedGraphRequest[] = [];

  private readonly getMock = vi.fn<(path: string) => Promise<unknown>>();

  constructor(
    private readonly responseByPath: Map<string, unknown> = new Map(),
  ) {
    this.getMock.mockImplementation((path) => {
      const response = this.responseByPath.get(path);

      if (response instanceof Error) {
        return Promise.reject(response);
      }

      return Promise.resolve(
        response ?? {
          value: [],
        },
      );
    });
  }

  get callCount(): number {
    return this.getMock.mock.calls.length;
  }

  api(path: string): FakeGraphRequest {
    const request = new FakeGraphRequest(path, this.getMock);
    this.requests.push(request.request);
    return request;
  }
}

const tenantId = "tenant-a";
const accountId = "account-a";

const userResponse = {
  id: "user-1",
  displayName: "Adele Vance",
  mail: "adele.vance@contoso.com",
  userPrincipalName: "adele.vance@contoso.com",
};

const groupResponse = {
  id: "group-1",
  displayName: "Project Owners",
  mail: "project.owners@contoso.com",
  groupTypes: ["Unified"],
  mailEnabled: true,
  securityEnabled: false,
};

const search = (
  graphClient: IDirectorySearchGraphClient,
  query: string,
  principalKind: "people" | "groups" = "people",
) =>
  searchDirectoryPrincipals({
    graphClient,
    tenantId,
    accountId,
    principalKind,
    query,
  });

const getSingleRequest = (
  graphClient: FakeGraphClient,
): IRecordedGraphRequest => {
  expect(graphClient.requests).toHaveLength(1);
  return graphClient.requests[0];
};

describe("directoryPrincipalSearch", () => {
  beforeEach(() => {
    clearDirectoryPrincipalSearchCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T00:00:00.000Z"));
  });

  afterEach(() => {
    clearDirectoryPrincipalSearchCache();
    vi.useRealTimers();
  });

  it("should use direct get for GUID input", async () => {
    const guid = "11111111-1111-4111-8111-111111111111";
    const graphClient = new FakeGraphClient(
      new Map([[`/users/${guid}`, userResponse]]),
    );

    await search(graphClient, guid);

    const request = getSingleRequest(graphClient);
    expect(request.path).toBe(`/users/${guid}`);
    expect(request.selects).toEqual(["id,displayName,mail,userPrincipalName"]);
    expect(request.tops).toEqual([]);
    expect(request.headers).toEqual([]);
    expect(request.queries).toEqual([]);
  });

  it("should use exact encoded path for complete UPN or email input", async () => {
    const upn = "adele.vance#EXT#@contoso.com";
    const graphClient = new FakeGraphClient(
      new Map([[`/users/${encodeURIComponent(upn)}`, userResponse]]),
    );

    await search(graphClient, upn);

    const request = getSingleRequest(graphClient);
    expect(request.path).toBe("/users/adele.vance%23EXT%23%40contoso.com");
    expect(request.filters).toEqual([]);
  });

  it("should use startswith filter for identifier prefix input", async () => {
    const graphClient = new FakeGraphClient(
      new Map<string, unknown>([
        [
          "/users",
          {
            value: [userResponse],
          },
        ],
      ]),
    );

    await search(graphClient, "adele.v");

    const request = getSingleRequest(graphClient);
    expect(request.path).toBe("/users");
    expect(request.filters).toEqual([
      "startswith(userPrincipalName,'adele.v') or startswith(mail,'adele.v')",
    ]);
    expect(request.headers).toEqual([
      { name: "ConsistencyLevel", value: "eventual" },
    ]);
    expect(request.queries).toEqual([{ $count: "true" }]);
  });

  it("should use displayName search for ordinary display name input", async () => {
    const graphClient = new FakeGraphClient(
      new Map<string, unknown>([
        [
          "/users",
          {
            value: [userResponse],
          },
        ],
      ]),
    );

    await search(graphClient, "Adele");

    const request = getSingleRequest(graphClient);
    expect(request.searches).toEqual(['"displayName:Adele"']);
    expect(request.headers).toEqual([
      { name: "ConsistencyLevel", value: "eventual" },
    ]);
    expect(request.queries).toEqual([{ $count: "true" }]);
  });

  it("should encode exact UPN path and escape fallback OData mail literal", async () => {
    const upn = "adele o'vance#EXT#@contoso.com";
    const notFound = new Error("not found");
    Object.assign(notFound, { statusCode: 404 });
    const graphClient = new FakeGraphClient(
      new Map<string, unknown>([
        [`/users/${encodeURIComponent(upn)}`, notFound],
        [
          "/users",
          {
            value: [],
          },
        ],
      ]),
    );

    await search(graphClient, upn);

    expect(graphClient.requests[0].path).toBe(
      "/users/adele%20o'vance%23EXT%23%40contoso.com",
    );
    expect(graphClient.requests[1].filters).toEqual([
      "mail eq 'adele o''vance#EXT#@contoso.com'",
    ]);
    expect(graphClient.requests[1].headers).toEqual([]);
    expect(graphClient.requests[1].queries).toEqual([]);
  });

  it("should reject unsafe search text before building a broken $search query", async () => {
    const graphClient = new FakeGraphClient();

    await expect(search(graphClient, 'Adele "Vance"')).rejects.toMatchObject({
      code: "invalidSearchSyntax",
    });
    await expect(search(graphClient, "Adele\\Vance")).rejects.toMatchObject({
      code: "invalidSearchSyntax",
    });
    expect(graphClient.callCount).toBe(0);
  });

  it("should use search header and count for groups display name or description search", async () => {
    const graphClient = new FakeGraphClient(
      new Map([
        [
          "/groups",
          {
            value: [groupResponse],
          },
        ],
      ]),
    );

    await search(graphClient, "Project", "groups");

    const request = getSingleRequest(graphClient);
    expect(request.searches).toEqual([
      '"displayName:Project" OR "description:Project"',
    ]);
    expect(request.headers).toEqual([
      { name: "ConsistencyLevel", value: "eventual" },
    ]);
    expect(request.queries).toEqual([{ $count: "true" }]);
  });

  it("should not add advanced query options to exact eq mail filter", async () => {
    const graphClient = new FakeGraphClient(
      new Map([
        [
          "/groups",
          {
            value: [groupResponse],
          },
        ],
      ]),
    );

    await search(graphClient, "project.owners@contoso.com", "groups");

    const request = getSingleRequest(graphClient);
    expect(request.filters).toEqual(["mail eq 'project.owners@contoso.com'"]);
    expect(request.headers).toEqual([]);
    expect(request.queries).toEqual([]);
  });

  it("should use minimal select and top 10 for collection queries", async () => {
    const graphClient = new FakeGraphClient();

    await search(graphClient, "project-", "groups");

    const request = getSingleRequest(graphClient);
    expect(request.selects).toEqual([
      "id,displayName,description,mail,mailNickname,groupTypes,mailEnabled,securityEnabled",
    ]);
    expect(request.tops).toEqual([10]);
  });

  it("should return cached search result without repeating Graph request", async () => {
    const graphClient = new FakeGraphClient(
      new Map([
        [
          "/users",
          {
            value: [userResponse],
          },
        ],
      ]),
    );

    await search(graphClient, "Adele");
    await search(graphClient, " adele ");

    expect(graphClient.callCount).toBe(1);
  });

  it("should request Graph again after TTL expires", async () => {
    const graphClient = new FakeGraphClient(
      new Map([
        [
          "/users",
          {
            value: [userResponse],
          },
        ],
      ]),
    );

    await search(graphClient, "Adele");
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await search(graphClient, "Adele");

    expect(graphClient.callCount).toBe(2);
  });

  it("should clear related cache on 401 or 403", async () => {
    const firstClient = new FakeGraphClient(
      new Map([
        [
          "/users",
          {
            value: [userResponse],
          },
        ],
      ]),
    );
    await search(firstClient, "Adele");

    const unauthorized = new Error("token expired");
    Object.assign(unauthorized, { statusCode: 401 });
    const failingClient = new FakeGraphClient(
      new Map([["/users", unauthorized]]),
    );

    await expect(search(failingClient, "Megan")).rejects.toMatchObject({
      code: "unauthorized",
    });

    const secondClient = new FakeGraphClient(
      new Map([
        [
          "/users",
          {
            value: [userResponse],
          },
        ],
      ]),
    );
    await search(secondClient, "Adele");

    expect(secondClient.callCount).toBe(1);
  });

  it("should map SDK retry exhausted failures to clear search errors", async () => {
    const failure = new Error("Retry attempts exhausted");
    Object.assign(failure, { statusCode: 503 });
    const graphClient = new FakeGraphClient(new Map([["/users", failure]]));

    await expect(search(graphClient, "Adele")).rejects.toMatchObject({
      code: "graphFailure",
      statusCode: 503,
      message: expect.stringContaining("Retry attempts exhausted"),
    });
  });

  it("should map Graph failures to clear search errors", async () => {
    const failure = new Error("Bad request");
    Object.assign(failure, { statusCode: 400 });
    const graphClient = new FakeGraphClient(new Map([["/users", failure]]));

    await expect(search(graphClient, "Adele")).rejects.toBeInstanceOf(
      DirectoryPrincipalSearchError,
    );
    await expect(search(graphClient, "Adele")).rejects.toMatchObject({
      code: "graphFailure",
      statusCode: 400,
    });
  });
});
