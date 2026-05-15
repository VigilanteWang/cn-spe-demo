import { describe, expect, it } from "vitest";
import { mapGraphPermissionToEntry } from "./containerPermissionsCommonAdapters";

describe("mapGraphPermissionToEntry", () => {
  it.each([
    [
      "user",
      {
        id: "perm-user",
        roles: ["writer"],
        grantedToV2: {
          user: {
            id: "user-1",
            displayName: "Adele Vance",
            userPrincipalName: "adele@contoso.com",
          },
        },
      },
      "people",
    ],
    [
      "siteUser",
      {
        id: "perm-site-user",
        roles: ["reader"],
        grantedToV2: {
          siteUser: {
            displayName: "Site User",
            email: "site.user@contoso.com",
          },
        },
      },
      "people",
    ],
    [
      "group",
      {
        id: "perm-group",
        roles: ["manager"],
        grantedToV2: {
          group: {
            id: "group-1",
            displayName: "Project Owners",
            mail: "owners@contoso.com",
          },
        },
      },
      "groups",
    ],
    [
      "siteGroup",
      {
        id: "perm-site-group",
        roles: ["owner"],
        grantedToV2: {
          siteGroup: {
            id: "site-group-1",
            loginName: "Site Members",
          },
        },
      },
      "groups",
    ],
  ])("should map %s identities into common entries", (_kind, permission, expectedTab) => {
    const entry = mapGraphPermissionToEntry(permission);

    expect(entry.principalType).toBe(expectedTab);
    expect(entry.permissionId).toBe(permission.id);
    expect(entry.id).toBe(`permission:${permission.id}`);
  });

  it("should generate fallback principal ids when people identities lack graph id", () => {
    const entry = mapGraphPermissionToEntry({
      id: "perm-no-user-id",
      roles: ["reader"],
      grantedToV2: {
        user: {
          displayName: "No Id User",
          userPrincipalName: "no.id@contoso.com",
        },
      },
    });

    expect(entry.principalId).toBe("people:permission:perm-no-user-id");
    expect(entry.principalUserPrincipalName).toBe("no.id@contoso.com");
  });

  it("should fold principalOwner into Owner", () => {
    const entry = mapGraphPermissionToEntry({
      id: "perm-principal-owner",
      roles: ["principalOwner"],
      grantedToV2: {
        group: {
          id: "group-owner",
          displayName: "Owners",
        },
      },
    });

    expect(entry.role).toBe("Owner");
  });

  it("should throw when grantedToV2 identity is missing", () => {
    expect(() =>
      mapGraphPermissionToEntry({
        id: "perm-missing-identity",
        roles: ["reader"],
        grantedToV2: {},
      }),
    ).toThrow("missing grantedToV2 identity");
  });
});
