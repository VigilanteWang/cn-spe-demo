import { describe, expect, it } from "vitest";
import { resolveGraphPermissionIdentity } from "./permissionIdentityAdapters";

describe("resolveGraphPermissionIdentity", () => {
  it("should resolve aad user and group identities from grantedTo and grantedToV2", () => {
    expect(
      resolveGraphPermissionIdentity({
        grantedToV2: {
          user: {
            id: "user-1",
            displayName: "Adele Vance",
            userPrincipalName: "adele@contoso.com",
          },
        },
      }),
    ).toMatchObject({
      principalType: "people",
      graphId: "user-1",
      displayName: "Adele Vance",
      userPrincipalName: "adele@contoso.com",
    });

    expect(
      resolveGraphPermissionIdentity({
        grantedTo: {
          group: {
            id: "group-1",
            displayName: "Retail Members",
            email: "retail@contoso.com",
          },
        },
      }),
    ).toMatchObject({
      principalType: "groups",
      graphId: "group-1",
      displayName: "Retail Members",
      mail: "retail@contoso.com",
    });
  });

  it("should ignore site-only identities", () => {
    expect(
      resolveGraphPermissionIdentity({
        grantedToV2: {
          siteUser: {
            id: "20",
            displayName: "Site User",
          },
        },
      }),
    ).toBeNull();

    expect(
      resolveGraphPermissionIdentity({
        grantedTo: {
          siteGroup: {
            id: "7",
            displayName: "Site Members",
          },
        },
      }),
    ).toBeNull();
  });

  it("should prefer aad identities when site identities also exist", () => {
    expect(
      resolveGraphPermissionIdentity({
        grantedToV2: {
          user: {
            id: "user-1",
            displayName: "Adele Vance",
            userPrincipalName: "adele@contoso.com",
          },
          siteUser: {
            id: "20",
            displayName: "Site Adele",
            loginName: "i:0#.f|membership|adele@contoso.com",
          },
        },
      }),
    ).toMatchObject({
      principalType: "people",
      graphId: "user-1",
      displayName: "Adele Vance",
      userPrincipalName: "adele@contoso.com",
    });

    expect(
      resolveGraphPermissionIdentity({
        grantedToV2: {
          siteGroup: {
            id: "7",
            displayName: "Site Members",
          },
          group: {
            id: "group-1",
            displayName: "Retail Members",
            mail: "retail@contoso.com",
          },
        },
      }),
    ).toMatchObject({
      principalType: "groups",
      graphId: "group-1",
      displayName: "Retail Members",
      mail: "retail@contoso.com",
    });
  });
});
