import { describe, expect, it } from "vitest";
import {
  buildGraphInviteRecipient,
  mapGraphPermissionCandidate,
  mapGraphItemPermissionsToResponse,
} from "./itemPermissionsCommonAdapters";

describe("mapGraphItemPermissionsToResponse", () => {
  it("should classify matching parent permissionId entries as inherited", () => {
    const response = mapGraphItemPermissionsToResponse({
      currentPermissions: [
        {
          id: "perm-child",
          roles: ["read"],
          grantedToV2: {
            group: {
              id: "group-1",
              displayName: "Retail Members",
              mail: "retail@contoso.com",
            },
          },
        },
        {
          id: "perm-explicit",
          roles: ["write"],
          grantedToV2: {
            user: {
              id: "user-1",
              displayName: "Adele Vance",
              userPrincipalName: "adele@contoso.com",
            },
          },
        },
      ],
      parentPermissions: [
        {
          id: "perm-child",
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
    });

    expect(response.entries).toHaveLength(2);
    expect(response.entries[0]).toMatchObject({
      permissionId: "perm-child",
      principalType: "groups",
      isInherited: true,
      isEditable: false,
      isRemovable: false,
      inheritanceSource: "parent",
    });
    expect(response.entries[1]).toMatchObject({
      permissionId: "perm-explicit",
      principalType: "people",
      isInherited: false,
      isEditable: true,
      isRemovable: true,
    });
  });

  it("should keep entries explicit when permission ids differ", () => {
    const response = mapGraphItemPermissionsToResponse({
      currentPermissions: [
        {
          id: "perm-child-a",
          roles: ["read"],
          grantedToV2: {
            user: {
              displayName: "No Object Id",
              userPrincipalName: "same@contoso.com",
            },
          },
        },
      ],
      parentPermissions: [
        {
          id: "perm-parent-a",
          roles: ["read"],
          grantedToV2: {
            user: {
              displayName: "No Object Id",
              userPrincipalName: "same@contoso.com",
            },
          },
        },
      ],
    });

    expect(response.entries[0].isInherited).toBe(false);
  });

  it("should skip unsupported permissions from editable entries", () => {
    const response = mapGraphItemPermissionsToResponse({
      currentPermissions: [
        {
          id: "perm-link",
          roles: ["read"],
          link: {
            scope: "users",
          },
        },
        {
          id: "perm-group",
          roles: ["write"],
          grantedToV2: {
            group: {
              id: "group-1",
              displayName: "Retail Members",
              email: "retail@contoso.com",
            },
          },
        },
      ],
    });

    expect(response.entries).toHaveLength(1);
    expect(response.entries[0].principalType).toBe("groups");
  });

  it("should skip deprecated grantedTo-only permissions", () => {
    const response = mapGraphItemPermissionsToResponse({
      currentPermissions: [
        {
          id: "perm-legacy",
          roles: ["read"],
          grantedTo: {
            user: {
              id: "legacy-user-1",
              displayName: "Legacy Adele",
              userPrincipalName: "legacy@contoso.com",
            },
          },
        },
      ],
    });

    expect(response.entries).toHaveLength(0);
  });
});

describe("mapGraphPermissionCandidate", () => {
  it("should return null for site-only permissions", () => {
    expect(
      mapGraphPermissionCandidate({
        id: "perm-site-user",
        roles: ["read"],
        grantedToV2: {
          siteUser: {
            id: "20",
            displayName: "Site User",
            loginName: "i:0#.f|membership|site.user@contoso.com",
          },
        },
      }),
    ).toBeNull();

    expect(
      mapGraphPermissionCandidate({
        id: "perm-site-group",
        roles: ["read"],
        grantedToV2: {
          siteGroup: {
            id: "7",
            displayName: "Site Members",
          },
        },
      }),
    ).toBeNull();
  });
});

describe("buildGraphInviteRecipient", () => {
  it("should prefer objectId before email and alias", () => {
    expect(
      buildGraphInviteRecipient({
        recipientObjectId: "group-1",
        recipientEmail: "group@contoso.com",
        recipientAlias: "group",
      }),
    ).toEqual({ objectId: "group-1" });
  });

  it("should fall back to email and then alias", () => {
    expect(
      buildGraphInviteRecipient({
        recipientEmail: "group@contoso.com",
      }),
    ).toEqual({ email: "group@contoso.com" });

    expect(
      buildGraphInviteRecipient({
        recipientAlias: "group",
      }),
    ).toEqual({ alias: "group" });
  });
});
