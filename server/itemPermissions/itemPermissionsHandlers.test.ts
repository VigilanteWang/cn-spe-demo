import { describe, expect, it, vi } from "vitest";
import type {
  IPermissionGraphClient,
  IPermissionGraphRequest,
} from "../permissionsCore/permissionGraphContracts";
import {
  fetchMapItemPermissionsFromGraphToResponse,
  listItemPermissionsFromGraph,
} from "./itemPermissionsHandlers";
import { withErrorHandling } from "../common/errorResponse";
import {
  createGraphClient,
  getGraphOBOToken,
  requireContainerManageRequest,
} from "../auth";
import { mapGraphItemPermissionsToResponse } from "./itemPermissionsCommonAdapters";

vi.mock("../auth", () => ({
  createGraphClient: vi.fn(),
  getGraphOBOToken: vi.fn(),
  requireContainerManageRequest: vi.fn(),
}));

vi.mock("./itemPermissionsCommonAdapters", async () => {
  const actual = await vi.importActual<
    typeof import("./itemPermissionsCommonAdapters")
  >("./itemPermissionsCommonAdapters");

  return {
    ...actual,
    mapGraphItemPermissionsToResponse: vi.fn(
      actual.mapGraphItemPermissionsToResponse,
    ),
  };
});

describe("fetchMapItemPermissionsFromGraphToResponse", () => {
  it("should skip parent permission lookup when parentReference points to drive root", async () => {
    const currentPermissionsPath = "/drives/drive-1/items/item-top/permissions";
    const itemParentReferencePath =
      "/drives/drive-1/items/item-top?$select=parentReference";
    const rootItemPermissionsPath =
      "/drives/drive-1/items/root-item/permissions";
    const requestedPaths: string[] = [];

    const graphClient = createMockGraphClient(
      {
        [currentPermissionsPath]: {
          value: [
            {
              id: "perm-top",
              roles: ["read"],
              grantedToV2: {
                user: {
                  id: "user-1",
                  displayName: "Adele Vance",
                  userPrincipalName: "adele@contoso.com",
                },
              },
            },
          ],
        },
        [itemParentReferencePath]: {
          parentReference: {
            id: "root-item",
            path: "/drives/drive-1/root:",
          },
        },
      },
      requestedPaths,
    );

    const response = await fetchMapItemPermissionsFromGraphToResponse(
      graphClient,
      "drive-1",
      "item-top",
    );

    expect(response.entries).toHaveLength(1);
    expect(response.entries[0]).toMatchObject({
      permissionId: "perm-top",
      isInherited: false,
      isEditable: true,
      isRemovable: true,
    });
    expect(requestedPaths).toEqual([
      currentPermissionsPath,
      itemParentReferencePath,
    ]);
    expect(requestedPaths).not.toContain(rootItemPermissionsPath);
  });

  it("should still read parent permissions for non-root parent items", async () => {
    const currentPermissionsPath =
      "/drives/drive-1/items/item-child/permissions";
    const itemParentReferencePath =
      "/drives/drive-1/items/item-child?$select=parentReference";
    const parentPermissionsPath =
      "/drives/drive-1/items/folder-parent/permissions";
    const requestedPaths: string[] = [];

    const graphClient = createMockGraphClient(
      {
        [currentPermissionsPath]: {
          value: [
            {
              id: "perm-shared",
              roles: ["read"],
              grantedToV2: {
                group: {
                  id: "group-1",
                  displayName: "Retail Members",
                  email: "retail@contoso.com",
                },
              },
            },
          ],
        },
        [itemParentReferencePath]: {
          parentReference: {
            id: "folder-parent",
            path: "/drives/drive-1/root:/Projects",
          },
        },
        [parentPermissionsPath]: {
          value: [
            {
              id: "perm-shared",
              roles: ["read"],
              grantedToV2: {
                group: {
                  id: "group-1",
                  displayName: "Retail Members",
                  email: "retail@contoso.com",
                },
              },
            },
          ],
        },
      },
      requestedPaths,
    );

    const response = await fetchMapItemPermissionsFromGraphToResponse(
      graphClient,
      "drive-1",
      "item-child",
    );

    expect(response.entries[0]).toMatchObject({
      permissionId: "perm-shared",
      isInherited: true,
      isEditable: false,
      isRemovable: false,
    });
    expect(requestedPaths).toEqual([
      currentPermissionsPath,
      itemParentReferencePath,
      parentPermissionsPath,
    ]);
  });
});

describe("listItemPermissionsFromGraph", () => {
  it("should keep validation errors as ValidationError", async () => {
    vi.mocked(requireContainerManageRequest).mockResolvedValue({
      token: "access-token",
    } as Awaited<ReturnType<typeof requireContainerManageRequest>>);

    const req = { params: {} } as unknown as Parameters<
      typeof listItemPermissionsFromGraph
    >[0];
    const res = createMockResponse();

    await withErrorHandling(listItemPermissionsFromGraph)(req, res);

    expect(res.send).toHaveBeenCalledWith(
      400,
      expect.objectContaining({
        error: expect.objectContaining({
          name: "ValidationError",
          code: "invalidRequest",
        }),
      }),
    );
  });

  it("should keep local mapping failures out of GraphError", async () => {
    const currentPermissionsPath = "/drives/drive-1/items/item-1/permissions";
    const itemParentReferencePath =
      "/drives/drive-1/items/item-1?$select=parentReference";
    const graphClient = createMockGraphClient({
      [currentPermissionsPath]: { value: [] },
      [itemParentReferencePath]: {
        parentReference: {
          id: "root-item",
          path: "/drives/drive-1/root:",
        },
      },
    });

    vi.mocked(requireContainerManageRequest).mockResolvedValue({
      token: "access-token",
    } as Awaited<ReturnType<typeof requireContainerManageRequest>>);
    vi.mocked(getGraphOBOToken).mockResolvedValue("graph-token");
    vi.mocked(createGraphClient).mockReturnValue(
      graphClient as ReturnType<typeof createGraphClient>,
    );
    vi.mocked(mapGraphItemPermissionsToResponse).mockImplementationOnce(() => {
      throw new Error("local mapping failed");
    });

    const req = {
      params: {
        driveId: "drive-1",
        itemId: "item-1",
      },
    } as unknown as Parameters<typeof listItemPermissionsFromGraph>[0];
    const res = createMockResponse();

    await withErrorHandling(listItemPermissionsFromGraph)(req, res);

    expect(res.send).toHaveBeenCalledWith(
      500,
      expect.objectContaining({
        error: expect.objectContaining({
          name: "Error",
          message: "local mapping failed",
        }),
      }),
    );
    expect(res.header).not.toHaveBeenCalledWith("Retry-After", expect.anything());
  });

  it("should still map real Graph failures to GraphError", async () => {
    const graphClient = createMockGraphClient({
      "/drives/drive-1/items/item-1/permissions": new Error("unused"),
    });

    graphClient.api = (): IPermissionGraphRequest => {
      const request: IPermissionGraphRequest = {
        version: () => request,
        header: () => request,
        get: async () => {
          throw Object.assign(new Error("Retry attempts exhausted"), {
            statusCode: 429,
            headers: new Headers({
              "Retry-After": "11",
              "request-id": "item-graph-429",
            }),
          });
        },
        post: async () => undefined,
        patch: async () => undefined,
        delete: async () => undefined,
      };

      return request;
    };

    vi.mocked(requireContainerManageRequest).mockResolvedValue({
      token: "access-token",
    } as Awaited<ReturnType<typeof requireContainerManageRequest>>);
    vi.mocked(getGraphOBOToken).mockResolvedValue("graph-token");
    vi.mocked(createGraphClient).mockReturnValue(
      graphClient as ReturnType<typeof createGraphClient>,
    );

    const req = {
      params: {
        driveId: "drive-1",
        itemId: "item-1",
      },
    } as unknown as Parameters<typeof listItemPermissionsFromGraph>[0];
    const res = createMockResponse();

    await withErrorHandling(listItemPermissionsFromGraph)(req, res);

    expect(res.header).toHaveBeenCalledWith("Retry-After", "11");
    expect(res.send).toHaveBeenCalledWith(
      429,
      expect.objectContaining({
        error: expect.objectContaining({
          name: "GraphError",
          message: "Retry attempts exhausted",
        }),
      }),
    );
  });
});

const createMockGraphClient = (
  responsesByPath: Record<string, unknown>,
  requestedPaths: string[] = [],
): IPermissionGraphClient => ({
  api: (path: string): IPermissionGraphRequest => {
    requestedPaths.push(path);

    const request: IPermissionGraphRequest = {
      version: () => request,
      header: () => request,
      get: async () => {
        if (!(path in responsesByPath)) {
          throw new Error(`Missing mock response for path: ${path}`);
        }

        return responsesByPath[path];
      },
      post: async () => {
        throw new Error("post is not implemented in this mock");
      },
      patch: async () => {
        throw new Error("patch is not implemented in this mock");
      },
      delete: async () => {
        throw new Error("delete is not implemented in this mock");
      },
    };

    return request;
  },
});

const createMockResponse = () => ({
  header: vi.fn(),
  send: vi.fn(),
});
