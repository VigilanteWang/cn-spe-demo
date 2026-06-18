import { describe, expect, it } from "vitest";
import { parseItemLinkPermissionChangeSet } from "./itemLinkPermissionRequestParser";

describe("parseItemLinkPermissionChangeSet", () => {
  it("should parse create, deleteLinks, grantRecipients and revokeRecipients", () => {
    const parsed = parseItemLinkPermissionChangeSet({
      create: [
        {
          scope: "users",
          type: "edit",
          recipients: [
            {
              recipientObjectId: "user-1",
            },
          ],
        },
      ],
      deleteLinks: [{ permissionId: "perm-delete-1" }],
      grantRecipients: [
        {
          permissionId: "perm-grant-1",
          shareId: "u!share-id-1",
          type: "view",
          recipients: [
            {
              recipientEmail: "adele@contoso.com",
            },
          ],
        },
      ],
      revokeRecipients: [
        {
          permissionId: "perm-revoke-1",
          shareId: "u!share-id-2",
          recipients: [
            {
              recipientAlias: "retail-members",
            },
          ],
        },
      ],
    });

    expect(parsed).toEqual({
      create: [
        {
          scope: "users",
          type: "edit",
          recipients: [{ recipientObjectId: "user-1" }],
        },
      ],
      deleteLinks: [{ permissionId: "perm-delete-1" }],
      grantRecipients: [
        {
          permissionId: "perm-grant-1",
          shareId: "u!share-id-1",
          type: "view",
          recipients: [{ recipientEmail: "adele@contoso.com" }],
        },
      ],
      revokeRecipients: [
        {
          permissionId: "perm-revoke-1",
          shareId: "u!share-id-2",
          recipients: [{ recipientAlias: "retail-members" }],
        },
      ],
    });
  });

  it("should reject unsupported scope, type and empty recipients", () => {
    expect(() =>
      parseItemLinkPermissionChangeSet({
        create: [
          {
            scope: "external",
            type: "view",
          },
        ],
        deleteLinks: [],
        grantRecipients: [],
        revokeRecipients: [],
      }),
    ).toThrow("Unsupported item link permission scope");

    expect(() =>
      parseItemLinkPermissionChangeSet({
        create: [],
        deleteLinks: [],
        grantRecipients: [
          {
            permissionId: "perm-grant-1",
            shareId: "u!share-id-1",
            type: "owner",
            recipients: [{ recipientObjectId: "user-1" }],
          },
        ],
        revokeRecipients: [],
      }),
    ).toThrow("Unsupported item link permission type");

    expect(() =>
      parseItemLinkPermissionChangeSet({
        create: [],
        deleteLinks: [],
        grantRecipients: [],
        revokeRecipients: [
          {
            permissionId: "perm-revoke-1",
            shareId: "u!share-id-2",
            recipients: [],
          },
        ],
      }),
    ).toThrow("must be a non-empty array");
  });
});
