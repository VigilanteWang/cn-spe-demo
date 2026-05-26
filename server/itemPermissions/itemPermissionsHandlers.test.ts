import { describe, expect, it, vi } from "vitest";
import type {
  IPermissionGraphClient,
  IPermissionGraphRequest,
} from "../permissionsCore/permissionGraphContracts";
import { fetchMapItemPermissionsFromGraphToResponse } from "./itemPermissionsHandlers";

vi.mock("../auth", () => ({
  createGraphClient: vi.fn(),
  getGraphOBOToken: vi.fn(),
  requireContainerManageRequest: vi.fn(),
}));

describe("fetchMapItemPermissionsFromGraphToResponse", () => {
  it("should skip parent permission lookup when parentReference points to drive root", async () => {
    const currentPermissionsPath =
      "/drives/drive-1/items/item-top/permissions";
    const itemParentReferencePath =
      "/drives/drive-1/items/item-top?$select=parentReference";
    const rootItemPermissionsPath =
      "/drives/drive-1/items/root-item/permissions";
    const requestedPaths: string[] = [];

    const graphClient = createMockGraphClient({
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
    }, requestedPaths);

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

    const graphClient = createMockGraphClient({
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
    }, requestedPaths);

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

const createMockGraphClient = (
  responsesByPath: Record<string, unknown>,
  requestedPaths: string[],
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
