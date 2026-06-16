import { describe, expect, it } from "vitest";
import { resolveGraphPermissionIdentity } from "./permissionIdentityAdapters";

/**
 * 验证共享 identity 解析器只接收当前产品支持的 AAD user/group 身份。
 */
describe("resolveGraphPermissionIdentity", () => {
  it("should resolve aad user and group identities from grantedToV2", () => {
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
        grantedToV2: {
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
        grantedToV2: {
          siteGroup: {
            id: "7",
            displayName: "Site Members",
          },
        },
      }),
    ).toBeNull();
  });

  it("should ignore deprecated grantedTo-only permissions", () => {
    expect(
      resolveGraphPermissionIdentity({
        // 新代码路径故意不再回退读取 deprecated grantedTo。
        grantedTo: {
          user: {
            id: "legacy-user-1",
            displayName: "Legacy Adele",
            userPrincipalName: "legacy@contoso.com",
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
      // 当 AAD 身份和 site-only 身份并存时，应优先返回可管理的 AAD group。
      principalType: "groups",
      graphId: "group-1",
      displayName: "Retail Members",
      mail: "retail@contoso.com",
    });
  });
});
