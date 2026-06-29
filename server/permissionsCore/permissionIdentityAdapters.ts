import type { IGraphPermissionIdentity } from "../../common/contracts/permissionCommonContracts";
import {
  readGraphToRecord,
  readOptionalString,
} from "./permissionGraphReaders";

/**
 * 从单个 Graph identity 对象里提取权限模块真正关心的稳定字段。
 */
export const normalizeGraphPermissionIdentity = (
  identity: unknown,
  principalType: IGraphPermissionIdentity["principalType"],
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
    principalType,
    graphId,
    displayName,
    description,
    mail,
    userPrincipalName,
  };
};

/**
 * 从 item/container permission 的 `grantedToV2` 里提取当前项目真正支持管理的主体。
 *
 * 说明：
 * - 当前实现只读取 `grantedToV2.group` 和 `grantedToV2.user`。
 * - Microsoft Graph 已将 `grantedTo` 标记为 deprecated，这里不再回退读取旧字段，
 *   避免在新代码路径里继续扩散旧兼容逻辑。
 * - `siteUser` / `siteGroup` 这类 SharePoint-specific identity 当前故意忽略。
 *   如果一条权限没有 `group`，只有 `user`，就按 `people` 返回。
 *   如果 `group` 和 `user` 同时存在，就优先按 `groups` 返回，避免把组权限误判成 people。
 *   如果这条权限只暴露 `siteUser` / `siteGroup` 等未纳管身份，就返回 `null`。
 */
export const resolveGrantedToV2 = (
  permission: unknown,
): IGraphPermissionIdentity | null => {
  const permissionRecord = readGraphToRecord(permission);
  const grantedToV2 = readGraphToRecord(permissionRecord.grantedToV2);
  // 当前只支持 AAD group / user 两种正式可管理主体。
  // 如果两者同时存在，优先使用 group，避免把组权限误当成 people。
  const groupIdentity = normalizeGraphPermissionIdentity(
    grantedToV2.group,
    "groups",
  );
  if (groupIdentity) {
    return groupIdentity;
  }

  const userIdentity = normalizeGraphPermissionIdentity(
    grantedToV2.user,
    "people",
  );
  if (userIdentity) {
    return userIdentity;
  }

  return null;
};

/**
 * 从 link permission 的 `grantedToIdentitiesV2` 集合里提取当前项目真正支持管理的主体。
 *
 * 说明：
 * - 当前实现只读取每个元素里的 `group` 和 `user`。
 * - deprecated 的 `grantedToIdentities` 不在这里回退读取。
 * - `siteUser` / `siteGroup` 等 SharePoint-specific facet 当前故意忽略。
 */
export const resolveGrantedToIdentitiesV2 = (
  value: unknown,
): IGraphPermissionIdentity[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  // Graph 原始集合在进入 adapter 时仍然是不可信输入，这里显式保留 `unknown[]`，
  // 避免 `Array.isArray` 收窄后把每个元素推成 `any`。
  const entries = value as unknown[];

  return entries.flatMap((entry: unknown) => {
    const record = readGraphToRecord(entry);
    const groupIdentity = normalizeGraphPermissionIdentity(
      record.group,
      "groups",
    );
    if (groupIdentity) {
      return [groupIdentity];
    }

    const userIdentity = normalizeGraphPermissionIdentity(
      record.user,
      "people",
    );
    if (userIdentity) {
      return [userIdentity];
    }

    return [];
  });
};
