import { describe, expect, it } from "vitest";
import type { Client } from "@microsoft/microsoft-graph-client";
import {
  deleteItemHistoryVersions,
  deleteItemVersion,
  getCurrentItemVersion,
  getItemVersion,
  getItemVersionDownload,
  listItemVersions,
  restoreItemVersion,
} from "./itemVersionService";

describe("itemVersionService", () => {
  it("should keep Graph order when mapping version list", async () => {
    const operations: RecordedOperation[] = [];
    const graphClient = createMockGraphClient(
      {
        "/drives/drive-1/items/item-1/versions": {
          value: [
            {
              id: "3.0",
              lastModifiedDateTime: "2026-07-01T07:00:00Z",
              lastModifiedBy: {
                user: {
                  displayName: "Adele Vance",
                },
              },
              size: 300,
            },
            {
              id: "2.0",
              lastModifiedDateTime: "2026-06-30T07:00:00Z",
              lastModifiedBy: {
                user: {
                  displayName: "Megan Bowen",
                },
              },
              size: 200,
            },
          ],
        },
      },
      operations,
    );

    const response = await listItemVersions(
      graphClient as unknown as Client,
      "drive-1",
      "item-1",
    );

    expect(response).toEqual({
      entries: [
        {
          id: "3.0",
          lastModifiedDateTime: "2026-07-01T07:00:00Z",
          lastModifiedByDisplayName: "Adele Vance",
          size: 300,
        },
        {
          id: "2.0",
          lastModifiedDateTime: "2026-06-30T07:00:00Z",
          lastModifiedByDisplayName: "Megan Bowen",
          size: 200,
        },
      ],
    });
    expect(operations).toEqual([
      {
        path: "/drives/drive-1/items/item-1/versions",
        method: "get",
        version: "v1.0",
      },
    ]);
  });

  it("should read single-version metadata from the version endpoint", async () => {
    const operations: RecordedOperation[] = [];
    const graphClient = createMockGraphClient(
      {
        "/drives/drive-1/items/item-1/versions/2.0": {
          id: "2.0",
          lastModifiedDateTime: "2026-06-30T07:00:00Z",
          lastModifiedBy: {
            application: {
              displayName: "Contoso Sync",
            },
          },
          size: 200,
        },
      },
      operations,
    );

    const response = await getItemVersion(
      graphClient as unknown as Client,
      "drive-1",
      "item-1",
      "2.0",
    );

    expect(response).toEqual({
      entry: {
        id: "2.0",
        lastModifiedDateTime: "2026-06-30T07:00:00Z",
        lastModifiedByDisplayName: "Contoso Sync",
        size: 200,
      },
    });
    expect(operations).toEqual([
      {
        path: "/drives/drive-1/items/item-1/versions/2.0",
        method: "get",
        version: "v1.0",
      },
    ]);
  });

  it("should read current-version metadata from the current endpoint", async () => {
    const operations: RecordedOperation[] = [];
    const graphClient = createMockGraphClient(
      {
        "/drives/drive-1/items/item-1/versions/current": {
          id: "3.0",
          lastModifiedDateTime: "2026-07-01T07:00:00Z",
          lastModifiedBy: {
            user: {
              displayName: "Adele Vance",
            },
          },
          size: 300,
        },
      },
      operations,
    );

    const response = await getCurrentItemVersion(
      graphClient as unknown as Client,
      "drive-1",
      "item-1",
    );

    expect(response).toEqual({
      entry: {
        id: "3.0",
        lastModifiedDateTime: "2026-07-01T07:00:00Z",
        lastModifiedByDisplayName: "Adele Vance",
        size: 300,
      },
    });
    expect(operations).toEqual([
      {
        path: "/drives/drive-1/items/item-1/versions/current",
        method: "get",
        version: "v1.0",
      },
    ]);
  });

  it("should prefer @microsoft.graph.downloadUrl when available", async () => {
    const operations: RecordedOperation[] = [];
    const graphClient = createMockGraphClient(
      {
        "/drives/drive-1/items/item-1/versions/2.0": {
          id: "2.0",
          "@microsoft.graph.downloadUrl": "https://download.contoso.com/v2",
        },
      },
      operations,
    );

    const response = await getItemVersionDownload(
      graphClient as unknown as Client,
      "drive-1",
      "item-1",
      "2.0",
    );

    expect(response).toEqual({
      downloadUrl: "https://download.contoso.com/v2",
    });
    expect(operations).toEqual([
      {
        path: "/drives/drive-1/items/item-1/versions/2.0",
        method: "get",
        version: "v1.0",
      },
    ]);
  });

  it("should read 302 location when version metadata lacks downloadUrl", async () => {
    const operations: RecordedOperation[] = [];
    const graphClient = createMockGraphClient(
      {
        "/drives/drive-1/items/item-1/versions/2.0": {
          id: "2.0",
        },
        "/drives/drive-1/items/item-1/versions/2.0/content": {
          status: 302,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === "location"
                ? "https://download.contoso.com/v2-fallback"
                : null,
          },
        },
      },
      operations,
    );

    const response = await getItemVersionDownload(
      graphClient as unknown as Client,
      "drive-1",
      "item-1",
      "2.0",
    );

    expect(response).toEqual({
      downloadUrl: "https://download.contoso.com/v2-fallback",
    });
    expect(operations).toEqual([
      {
        path: "/drives/drive-1/items/item-1/versions/2.0",
        method: "get",
        version: "v1.0",
      },
      {
        path: "/drives/drive-1/items/item-1/versions/2.0/content",
        method: "get",
      },
    ]);
  });

  it("should keep missing location as DownloadUrlNotFoundError", async () => {
    const graphClient = createMockGraphClient({
      "/drives/drive-1/items/item-1/versions/2.0": {
        id: "2.0",
      },
      "/drives/drive-1/items/item-1/versions/2.0/content": {
        status: 302,
        headers: {
          get: () => null,
        },
      },
    });

    await expect(
      getItemVersionDownload(
        graphClient as unknown as Client,
        "drive-1",
        "item-1",
        "2.0",
      ),
    ).rejects.toMatchObject({
      name: "DownloadUrlNotFoundError",
      statusCode: 302,
    });
  });

  it("should post restoreVersion and delete single version on the expected paths", async () => {
    const operations: RecordedOperation[] = [];
    const graphClient = createMockGraphClient({}, operations);

    await restoreItemVersion(
      graphClient as unknown as Client,
      "drive-1",
      "item-1",
      "2.0",
    );
    await deleteItemVersion(
      graphClient as unknown as Client,
      "drive-1",
      "item-1",
      "2.0",
    );

    expect(operations).toEqual([
      {
        path: "/drives/drive-1/items/item-1/versions/2.0/restoreVersion",
        method: "post",
        version: "v1.0",
        body: null,
      },
      {
        path: "/drives/drive-1/items/item-1/versions/2.0",
        method: "delete",
        version: "v1.0",
      },
    ]);
  });

  it("should skip the latest version when deleting history versions", async () => {
    const operations: RecordedOperation[] = [];
    const graphClient = createMockGraphClient(
      {
        "/drives/drive-1/items/item-1/versions": {
          value: [{ id: "3.0" }, { id: "2.0" }, { id: "1.0" }],
        },
      },
      operations,
    );

    await deleteItemHistoryVersions(
      graphClient as unknown as Client,
      "drive-1",
      "item-1",
    );

    expect(operations).toEqual([
      {
        path: "/drives/drive-1/items/item-1/versions",
        method: "get",
        version: "v1.0",
      },
      {
        path: "/drives/drive-1/items/item-1/versions/2.0",
        method: "delete",
        version: "v1.0",
      },
      {
        path: "/drives/drive-1/items/item-1/versions/1.0",
        method: "delete",
        version: "v1.0",
      },
    ]);
  });
});

type RecordedOperation = {
  path: string;
  method: string;
  version?: string;
  body?: unknown;
};

type MockGraphClient = {
  api: (path: string) => MockGraphRequest;
};

interface MockGraphRequest {
  version: (value: string) => MockGraphRequest;
  responseType: (_value: unknown) => MockGraphRequest;
  middlewareOptions: (_value: unknown[]) => MockGraphRequest;
  get: () => Promise<unknown>;
  post: (body?: unknown) => Promise<unknown>;
  delete: () => Promise<unknown>;
}

const createMockGraphClient = (
  responsesByPath: Record<string, unknown> = {},
  operations: RecordedOperation[] = [],
): MockGraphClient => ({
  api: (path: string): MockGraphRequest => {
    let currentVersion: string | undefined;

    const request: MockGraphRequest = {
      version: (value: string) => {
        currentVersion = value;
        return request;
      },
      responseType: () => request,
      middlewareOptions: () => request,
      get: async () => {
        operations.push({
          path,
          method: "get",
          version: currentVersion,
        });
        return readMockResponse(responsesByPath, path);
      },
      post: async (body?: unknown) => {
        operations.push({
          path,
          method: "post",
          version: currentVersion,
          body,
        });
        return readMockResponse(responsesByPath, path, undefined);
      },
      delete: async () => {
        operations.push({
          path,
          method: "delete",
          version: currentVersion,
        });
        return readMockResponse(responsesByPath, path, undefined);
      },
    };

    return request;
  },
});

const readMockResponse = (
  responsesByPath: Record<string, unknown>,
  path: string,
  fallback: unknown = {},
) => {
  if (path in responsesByPath) {
    return responsesByPath[path];
  }

  return fallback;
};
