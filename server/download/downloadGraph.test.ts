import { beforeEach, describe, expect, it, vi } from "vitest";
import { flattenDriveItems, resolveDownloadUrl } from "./downloadGraph";

interface IMockGraphResponseMap {
  [path: string]:
    | unknown
    | (() => unknown)
    | {
        select?: unknown;
        default?: unknown;
      };
}

const createMockGraphClient = (responses: IMockGraphResponseMap) => ({
  api(path: string) {
    const pathResponse = responses[path];

    return {
      select() {
        return {
          get: async () => resolveMockResponse(pathResponse, "select"),
        };
      },
      responseType() {
        return {
          middlewareOptions() {
            return {
              get: async () => resolveMockResponse(pathResponse, "default"),
            };
          },
        };
      },
      get: async () => resolveMockResponse(pathResponse, "default"),
    };
  },
});

const resolveMockResponse = (
  response: IMockGraphResponseMap[string],
  mode: "select" | "default",
) => {
  if (
    typeof response === "object" &&
    response !== null &&
    ("select" in response || "default" in response)
  ) {
    const typedResponse = response as { select?: unknown; default?: unknown };
    return resolveLeafValue(typedResponse[mode]);
  }

  return resolveLeafValue(response);
};

const resolveLeafValue = (value: unknown) => {
  if (typeof value === "function") {
    return (value as () => unknown)();
  }

  return value;
};

describe("downloadGraph GraphError boundary", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("should map resolveDownloadUrl item lookups to GraphError", async () => {
    const graphClient = createMockGraphClient({
      "/drives/drive-1/items/item-1": {
        default: () => {
          throw new Error("resolve failed");
        },
      },
    });

    await expect(
      resolveDownloadUrl(graphClient as never, "graph-token", "drive-1", "item-1"),
    ).rejects.toMatchObject({
      name: "GraphError",
      message: "resolve failed",
    });
  });

  it("should map content redirect fallback failures to GraphError", async () => {
    const graphClient = createMockGraphClient({
      "/drives/drive-1/items/item-1": {
        default: {},
      },
      "/drives/drive-1/items/item-1/content": {
        default: () => {
          throw new Error("content failed");
        },
      },
    });

    await expect(
      resolveDownloadUrl(graphClient as never, "graph-token", "drive-1", "item-1"),
    ).rejects.toMatchObject({
      name: "GraphError",
      message: "content failed",
    });
  });

  it("should keep missing location as DownloadUrlNotFoundError", async () => {
    const graphClient = createMockGraphClient({
      "/drives/drive-1/items/item-1": {
        default: {},
      },
      "/drives/drive-1/items/item-1/content": {
        default: {
          status: 302,
          headers: {
            get: () => null,
          },
        },
      },
    });

    await expect(
      resolveDownloadUrl(graphClient as never, "graph-token", "drive-1", "item-1"),
    ).rejects.toMatchObject({
      name: "DownloadUrlNotFoundError",
      message: "Unable to resolve the download url for item item-1.",
      statusCode: 302,
    });
  });

  it("should map expandItem lookup failures to GraphError", async () => {
    const graphClient = createMockGraphClient({
      "/drives/drive-1/items/item-1": {
        select: () => {
          throw new Error("expand failed");
        },
      },
    });

    await expect(
      flattenDriveItems(graphClient as never, "drive-1", ["item-1"]),
    ).rejects.toMatchObject({
      name: "GraphError",
      message: "expand failed",
    });
  });

  it("should map folder paging failures to GraphError", async () => {
    const graphClient = createMockGraphClient({
      "/drives/drive-1/items/folder-1": {
        select: {
          id: "folder-1",
          name: "folder-1",
          folder: { childCount: 1 },
        },
      },
      "/drives/drive-1/items/folder-1/children": {
        select: () => {
          throw new Error("page failed");
        },
      },
    });

    await expect(
      flattenDriveItems(graphClient as never, "drive-1", ["folder-1"]),
    ).rejects.toMatchObject({
      name: "GraphError",
      message: "page failed",
    });
  });
});
