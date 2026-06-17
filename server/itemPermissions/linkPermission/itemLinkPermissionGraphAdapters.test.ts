import { describe, expect, it } from "vitest";
import {
  mapGraphItemLinkPermission,
  mapItemLinkPermissionTypeToGrantRole,
  newGraphGrantLinkPermissionBody,
  newGraphRevokeLinkPermissionBody,
} from "./itemLinkPermissionGraphAdapters";

describe("mapGraphItemLinkPermission", () => {
  it("should keep blocksDownload links as a dedicated type", () => {
    const entry = mapGraphItemLinkPermission({
      id: "perm-link-1",
      shareId: "u!share-id-1",
      link: {
        scope: "organization",
        type: "blocksDownload",
        webUrl: "https://contoso.sharepoint.com/link-1",
        preventsDownload: true,
      },
      grantedToIdentitiesV2: [],
    });

    expect(entry).toMatchObject({
      permissionId: "perm-link-1",
      shareId: "u!share-id-1",
      scope: "organization",
      type: "blocksDownload",
      roleLabel: "Block download",
      preventsDownload: true,
      grantedToCount: 0,
      capabilities: {
        canGrantRecipients: false,
        canRevokeRecipients: false,
        canDeleteLink: true,
      },
    });
  });

  it("should allow organization links to have empty grantedTo lists", () => {
    const entry = mapGraphItemLinkPermission({
      id: "perm-link-2",
      shareId: "u!share-id-2",
      link: {
        scope: "organization",
        type: "view",
        webUrl: "https://contoso.sharepoint.com/link-2",
      },
    });

    expect(entry?.grantedToIdentities).toEqual([]);
    expect(entry?.grantedToCount).toBe(0);
  });

  it("should map users link identities and grant capabilities", () => {
    const entry = mapGraphItemLinkPermission({
      id: "perm-link-3",
      shareId: "u!share-id-3",
      link: {
        scope: "users",
        type: "edit",
        webUrl: "https://contoso.sharepoint.com/link-3",
      },
      grantedToIdentitiesV2: [
        {
          user: {
            id: "user-1",
            displayName: "Adele Vance",
            userPrincipalName: "adele@contoso.com",
          },
        },
        {
          group: {
            id: "group-1",
            displayName: "Retail Members",
            email: "retail@contoso.com",
          },
        },
      ],
    });

    expect(entry).toMatchObject({
      scope: "users",
      type: "edit",
      roleLabel: "Edit",
      grantedToCount: 2,
      capabilities: {
        canGrantRecipients: true,
        canRevokeRecipients: true,
        canDeleteLink: true,
      },
    });
    expect(entry?.grantedToIdentities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: "Adele Vance",
          principalType: "people",
          graphId: "user-1",
        }),
        expect.objectContaining({
          displayName: "Retail Members",
          principalType: "groups",
          graphId: "group-1",
        }),
      ]),
    );
  });

  it("should ignore deprecated and user-permission-only granted fields", () => {
    const entry = mapGraphItemLinkPermission({
      id: "perm-link-4",
      shareId: "u!share-id-4",
      link: {
        scope: "users",
        type: "view",
        webUrl: "https://contoso.sharepoint.com/link-4",
      },
      grantedToIdentitiesV2: [
        {
          user: {
            id: "user-v2-1",
            displayName: "V2 User",
            email: "v2-user@contoso.com",
          },
        },
      ],
      grantedToIdentities: [
        {
          user: {
            id: "legacy-user-1",
            displayName: "Legacy User",
            email: "legacy-user@contoso.com",
          },
        },
      ],
      grantedToV2: {
        user: {
          id: "single-user-v2-1",
          displayName: "Single User V2",
          email: "single-v2@contoso.com",
        },
      },
      grantedTo: {
        user: {
          id: "single-user-legacy-1",
          displayName: "Single User Legacy",
          email: "single-legacy@contoso.com",
        },
      },
    });

    expect(entry?.grantedToCount).toBe(1);
    expect(entry?.grantedToIdentities).toEqual([
      expect.objectContaining({
        graphId: "user-v2-1",
        displayName: "V2 User",
      }),
    ]);
  });
});

describe("link permission Graph payload builders", () => {
  it("should keep grant role mapping stable", () => {
    expect(mapItemLinkPermissionTypeToGrantRole("view")).toBe("read");
    expect(mapItemLinkPermissionTypeToGrantRole("blocksDownload")).toBe("read");
    expect(mapItemLinkPermissionTypeToGrantRole("edit")).toBe("write");
  });

  it("should build grant and revoke bodies from recipient identifiers", () => {
    expect(
      newGraphGrantLinkPermissionBody({
        type: "edit",
        recipients: [
          {
            recipientObjectId: "user-1",
          },
        ],
      }),
    ).toEqual({
      roles: ["write"],
      recipients: [{ objectId: "user-1" }],
    });

    expect(
      newGraphRevokeLinkPermissionBody({
        recipients: [
          {
            recipientEmail: "adele@contoso.com",
          },
        ],
      }),
    ).toEqual({
      grantees: [{ email: "adele@contoso.com" }],
    });
  });
});
