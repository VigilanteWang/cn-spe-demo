import { describe, expect, it } from "vitest";
import type { Client } from "@microsoft/microsoft-graph-client";
import { ITEM_LINK_PERMISSION_SCOPES } from "../../../common/contracts/itemPermissionCommonContracts";
import { isSupportedItemLinkPermissionTarget } from "../../../common/helper/itemLinkPermissionCommonHelper";
import {
  applyItemLinkPermissionChangeSet,
  fetchMapItemLinkPermissionsFromGraphToResponse,
} from "./itemLinkPermissionService";

describe("isSupportedItemLinkPermissionTarget", () => {
  it("should accept supported Office mime types and fallback extensions", () => {
    expect(
      isSupportedItemLinkPermissionTarget({
        name: "Quarterly Report.txt",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        isFolder: false,
      }),
    ).toBe(true);

    expect(
      isSupportedItemLinkPermissionTarget({
        name: "Deck.PPSX",
        isFolder: false,
      }),
    ).toBe(true);
  });

  it("should reject folders and unsupported files", () => {
    expect(
      isSupportedItemLinkPermissionTarget({
        name: "Folder",
        isFolder: true,
      }),
    ).toBe(false);

    expect(
      isSupportedItemLinkPermissionTarget({
        name: "notes.txt",
        mimeType: "text/plain",
        isFolder: false,
      }),
    ).toBe(false);
  });
});

describe("fetchMapItemLinkPermissionsFromGraphToResponse", () => {
  it("should return only mapped link permissions without target support validation", async () => {
    const operations: Array<{
      path: string;
      method: string;
      version?: string;
      body?: unknown;
    }> = [];

    const graphClient = createMockGraphClient(
      {
        "/drives/drive-1/items/item-1/permissions": {
          value: [
            {
              id: "perm-link-1",
              shareId: "u!share-id-1",
              link: {
                scope: "organization",
                type: "view",
                webUrl: "https://contoso.sharepoint.com/link-1",
              },
            },
            {
              id: "perm-people-1",
              grantedToV2: {
                user: {
                  id: "user-1",
                  displayName: "Adele Vance",
                },
              },
              roles: ["read"],
            },
          ],
        },
      },
      operations,
    );

    const response = await fetchMapItemLinkPermissionsFromGraphToResponse(
      graphClient as Client,
      "drive-1",
      "item-1",
    );

    expect(response.entries).toHaveLength(1);
    expect(response.entries[0]).toMatchObject({
      permissionId: "perm-link-1",
      scope: "organization",
    });
    expect(operations).toEqual([
      {
        path: "/drives/drive-1/items/item-1/permissions",
        method: "get",
        version: "v1.0",
      },
    ]);
  });
});

describe("applyItemLinkPermissionChangeSet", () => {
  it("should apply delete, create, grant and revoke in order", async () => {
    const operations: Array<{
      path: string;
      method: string;
      version?: string;
      body?: unknown;
    }> = [];

    const graphClient = createMockGraphClient(
      {
        "/drives/drive-1/items/item-1?$select=name,file,folder": {
          name: "Workbook.xlsx",
          file: {
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        },
        "/drives/drive-1/items/item-1/createLink": {
          id: "perm-create-1",
          shareId: "u!share-created-1",
          link: {
            scope: ITEM_LINK_PERMISSION_SCOPES.specific,
            type: "review",
            webUrl: "https://contoso.sharepoint.com/link-created",
          },
        },
        "/drives/drive-1/items/item-1/permissions": {
          value: [
            {
              id: "perm-create-1",
              shareId: "u!share-created-1",
              link: {
                scope: ITEM_LINK_PERMISSION_SCOPES.specific,
                type: "review",
                webUrl: "https://contoso.sharepoint.com/link-created",
              },
            },
          ],
        },
      },
      operations,
    );

    const response = await applyItemLinkPermissionChangeSet(
      graphClient as Client,
      "drive-1",
      "item-1",
      {
        create: [
          {
            scope: ITEM_LINK_PERMISSION_SCOPES.specific,
            type: "review",
            recipients: [{ recipientObjectId: "user-created-1" }],
          },
        ],
        deleteLinks: [{ permissionId: "perm-delete-1" }],
        grantRecipients: [
          {
            permissionId: "perm-grant-1",
            shareId: "u!share-grant-1",
            type: "blocksDownload",
            recipients: [{ recipientEmail: "adele@contoso.com" }],
          },
        ],
        revokeRecipients: [
          {
            permissionId: "perm-revoke-1",
            shareId: "u!share-revoke-1",
            recipients: [{ recipientObjectId: "user-revoke-1" }],
          },
        ],
      },
    );

    expect(response.entries).toHaveLength(1);
    expect(operations).toEqual([
      {
        path: "/drives/drive-1/items/item-1?$select=name,file,folder",
        method: "get",
        version: "v1.0",
      },
      {
        path: "/drives/drive-1/items/item-1/permissions/perm-delete-1",
        method: "delete",
        version: "v1.0",
      },
      {
        path: "/drives/drive-1/items/item-1/createLink",
        method: "post",
        version: "v1.0",
        body: {
          scope: ITEM_LINK_PERMISSION_SCOPES.specific,
          type: "review",
        },
      },
      {
        path: "/shares/u!share-created-1/permission/grant",
        method: "post",
        version: "v1.0",
        body: {
          roles: ["read"],
          recipients: [{ objectId: "user-created-1" }],
        },
      },
      {
        path: "/shares/u!share-grant-1/permission/grant",
        method: "post",
        version: "v1.0",
        body: {
          roles: ["read"],
          recipients: [{ email: "adele@contoso.com" }],
        },
      },
      {
        path: "/shares/u!share-revoke-1/permission/revokeGrants",
        method: "post",
        version: "beta",
        body: {
          grantees: [{ objectId: "user-revoke-1" }],
        },
      },
      {
        path: "/drives/drive-1/items/item-1/permissions",
        method: "get",
        version: "v1.0",
      },
    ]);
  });
});

/**
 * 测试里的 Graph client 只需要覆盖当前服务真正调用到的最小方法集合。
 */
type PermissionGraphClient = {
  api: (path: string) => PermissionGraphRequest;
};

/**
 * 这里使用测试专用的最小 request 接口，并让链式方法返回自己，
 * 避免把 SDK `GraphRequest` 上的大量内部字段一并拖进类型检查。
 */
interface PermissionGraphRequest {
  version: (value: string) => PermissionGraphRequest;
  header: (..._args: unknown[]) => PermissionGraphRequest;
  get: () => Promise<unknown>;
  post: (body: unknown) => Promise<unknown>;
  patch: (body?: unknown) => Promise<unknown>;
  delete: () => Promise<unknown>;
}

const createMockGraphClient = (
  responsesByPath: Record<string, unknown>,
  operations: Array<{
    path: string;
    method: string;
    version?: string;
    body?: unknown;
  }> = [],
): PermissionGraphClient => ({
  api: (path: string): PermissionGraphRequest => {
    let currentVersion: string | undefined;

    const request: PermissionGraphRequest = {
      version: (value: string) => {
        currentVersion = value;
        return request;
      },
      header: () => request,
      get: async () => {
        operations.push({
          path,
          method: "get",
          version: currentVersion,
        });
        return readMockResponse(responsesByPath, path);
      },
      post: async (body: unknown) => {
        operations.push({
          path,
          method: "post",
          version: currentVersion,
          body,
        });
        return readMockResponse(responsesByPath, path);
      },
      patch: async () => {
        throw new Error("patch is not implemented in this mock");
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
