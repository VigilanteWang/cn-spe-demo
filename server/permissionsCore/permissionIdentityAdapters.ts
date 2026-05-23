import type { IGraphPermissionIdentity } from "./permissionGraphContracts";
import {
  readGraphToRecord,
  readOptionalString,
} from "./permissionGraphReaders";

export interface IResolvedGraphPermissionIdentity
  extends IGraphPermissionIdentity {
  principalType: "people" | "groups";
}

/**
 * 从单个 Graph identity 对象里提取权限模块真正关心的稳定字段。
 */
export const normalizeGraphPermissionIdentity = (
  identity: unknown,
): IGraphPermissionIdentity | null => {
  if (!identity) {
    return null;
  }

  const record = readGraphToRecord(identity);
  const graphId = readOptionalString(record.id);
  const mail =
    readOptionalString(record.mail) ?? readOptionalString(record.email);
  const userPrincipalName = readOptionalString(record.userPrincipalName);
  const displayName =
    readOptionalString(record.displayName) ??
    readOptionalString(record.email) ??
    userPrincipalName ??
    mail ??
    readOptionalString(record.loginName) ??
    graphId ??
    "Unknown principal";
  const description =
    readOptionalString(record.email) ??
    userPrincipalName ??
    mail ??
    readOptionalString(record.loginName) ??
    "";

  return {
    graphId,
    displayName,
    description,
    mail,
    userPrincipalName,
  };
};

/**
 * 从 item/container permission 的 `grantedToV2` 里提取“当前项目支持管理”的 identity。
 *
 * 说明：
 * - 当前项目只把 AAD user / group 当作正式可管理对象。
 * - Microsoft Graph 已将 `grantedTo` 标记为 deprecated，这里只继续读取 `grantedToV2`，
 *   避免新服务路径里继续扩散旧字段兼容逻辑。
 * - `siteUser` / `siteGroup` 属于 SharePoint-specific identity，当前实现故意忽略，因为
 * 对于SPE而言，SharePoint user/group 不一定容易管理，未有文档提到 User Profile service，
 * 但的确有 graph api 提到可以建 sharepoint group，暂时忽略。
 *   如果某条权限只暴露这两类身份，就把它视为未纳管权限。
 */
export const resolveGraphPermissionIdentity = (
  permission: unknown,
): IResolvedGraphPermissionIdentity | null => {
  const permissionRecord = readGraphToRecord(permission);
  const grantedToV2 = readGraphToRecord(permissionRecord.grantedToV2);

  const facets = [
    { principalType: "groups", value: grantedToV2.group },
    { principalType: "people", value: grantedToV2.user },
  ] as const;

  const normalizedFacets = facets
    .map((facet) => {
      const normalized = normalizeGraphPermissionIdentity(facet.value);
      if (!normalized) {
        return null;
      }

      return {
        principalType: facet.principalType,
        ...normalized,
      };
    })
    .filter(
      (
        facet,
      ): facet is {
        principalType: "people" | "groups";
        graphId?: string;
        displayName: string;
        description: string;
        mail?: string;
        userPrincipalName?: string;
      } => Boolean(facet),
    );

  if (normalizedFacets.length === 0) {
    return null;
  }

  const resolvedPrincipalType = normalizedFacets.some(
    (facet) => facet.principalType === "groups",
  )
    ? "groups"
    : "people";
  const principalTypeFacets = normalizedFacets.filter(
    (facet) => facet.principalType === resolvedPrincipalType,
  );
  const primaryFacet = principalTypeFacets[0];

  return {
    principalType: resolvedPrincipalType,
    graphId:
      primaryFacet.graphId ??
      principalTypeFacets.find((facet) => facet.graphId)?.graphId,
    displayName:
      primaryFacet.displayName ??
      principalTypeFacets.find((facet) => facet.displayName)?.displayName ??
      "Unknown principal",
    description:
      primaryFacet.description ??
      principalTypeFacets.find((facet) => facet.description)?.description ??
      "",
    mail:
      primaryFacet.mail ??
      principalTypeFacets.find((facet) => facet.mail)?.mail,
    userPrincipalName:
      primaryFacet.userPrincipalName ??
      principalTypeFacets.find((facet) => facet.userPrincipalName)
        ?.userPrincipalName,
  };
};
