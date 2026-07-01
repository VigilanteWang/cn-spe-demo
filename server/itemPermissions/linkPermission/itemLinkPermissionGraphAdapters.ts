import {
  getItemLinkPermissionRoleLabel,
  isItemLinkPermissionScope,
  isItemLinkPermissionType,
} from "../../../common/helper/itemLinkPermissionCommonHelper";
import type {
  IItemLinkPermissionEntryForUI,
  IItemUserPermissionRecipientForUI,
  ItemLinkPermissionType,
} from "../../../common/contracts/itemPermissionCommonContracts";
import { ITEM_LINK_PERMISSION_SCOPES } from "../../../common/contracts/itemPermissionCommonContracts";
import type { IGraphPermissionIdentity } from "../../../common/contracts/permissionCommonContracts";
import { resolveGrantedToIdentitiesV2 } from "../../permissionsCore/permissionIdentityAdapters";
import {
  readGraphToRecord,
  readOptionalString,
} from "../../common/graphReaders";
import { buildGraphInviteRecipient } from "../itemPermissionsGraphAdapters";

/**
 * 把单条 Graph link permission 映射成前端可直接消费的 link model。
 *
 * 这里的职责只处理“读取和翻译”：
 * - 从 Graph permission 中识别 link 核心字段
 * - 过滤掉当前 UI 不支持的 scope/type
 * - 把已授予主体列表整理成统一 identity 模型
 *
 * @param permission 单条 Graph permission 原始对象。
 * @returns 成功映射后的 link entry；如果不是当前支持的 link permission，则返回 `null`。
 */
export const mapGraphItemLinkPermission = (
  permission: unknown,
): IItemLinkPermissionEntryForUI | null => {
  const permissionRecord = readGraphToRecord(permission);
  // `permissionId` 和 `webUrl` 都是前端后续渲染与操作的硬依赖，缺一不可。
  const permissionId = readOptionalString(permissionRecord.id);
  const shareId = readOptionalString(permissionRecord.shareId);
  const linkRecord = readGraphToRecord(permissionRecord.link);
  const webUrl = readOptionalString(linkRecord.webUrl);
  const scope = isItemLinkPermissionScope(linkRecord.scope)
    ? linkRecord.scope
    : undefined;
  const type = isItemLinkPermissionType(linkRecord.type)
    ? linkRecord.type
    : undefined;

  if (!permissionId || !webUrl || !scope || !type) {
    // 当前前端只接收“字段完整且 scope/type 在支持范围内”的 link permission。
    return null;
  }

  const grantedToIdentities = readGrantedToIdentities(permissionRecord);
  const roleLabel = getItemLinkPermissionRoleLabel(type);
  const hasShareId = Boolean(shareId);

  return {
    id: `item-link-permission:${permissionId}`,
    permissionId,
    shareId,
    webUrl,
    scope,
    type,
    roleLabel,
    // `blocksDownload` 在产品语义上是独立类型，因此显式保留这个布尔值给 UI 使用。
    preventsDownload: type === "blocksDownload",
    grantedToIdentities,
    // `grantedToCount` 直接基于整理后的 identity 列表长度计算，避免前端重复推导。
    grantedToCount: grantedToIdentities.length,
    capabilities: {
      // 只有 `specific` link 且拿到 `shareId` 时，后续 grant / revoke 才有合法目标。
      canGrantRecipients:
        scope === ITEM_LINK_PERMISSION_SCOPES.specific && hasShareId,
      canRevokeRecipients:
        scope === ITEM_LINK_PERMISSION_SCOPES.specific && hasShareId,
      canDeleteLink: true,
    },
  };
};

/**
 * 批量筛选并映射 Graph 返回的 link permissions。
 *
 * @param permissions Graph 返回的 permission 数组。
 * @returns 过滤掉不支持项后的 link permission 列表。
 */
export const mapGraphItemLinkPermissions = (
  permissions: unknown[],
): IItemLinkPermissionEntryForUI[] =>
  permissions
    .map(mapGraphItemLinkPermission)
    .filter((entry): entry is IItemLinkPermissionEntryForUI => entry !== null);

/**
 * 把 link type 映射成 `permission/grant` 需要的 Graph role。
 *
 * `blocksDownload` 虽然 UI 上是独立类型，但底层仍属于 read-only link，
 * 因此 grant 时继续映射到 `read`。
 *
 * @param type 后端统一使用的 link type。
 * @returns Graph `permission/grant` 接口接受的角色值。
 */
export const mapItemLinkPermissionTypeToGrantRole = (
  type: ItemLinkPermissionType,
): "read" | "write" => (type === "edit" ? "write" : "read");

/**
 * 构造 `permission/grant` 的 Graph 请求体。
 *
 * @param change 包含 link type 与 recipients 的最小输入。
 * @returns 可直接发送给 Graph 的 grant body。
 */
export const newGraphGrantLinkPermissionBody = (change: {
  type: ItemLinkPermissionType;
  recipients: IItemUserPermissionRecipientForUI[];
}): {
  roles: Array<"read" | "write">;
  recipients: Array<{
    objectId?: string;
    email?: string;
    alias?: string;
  }>;
} => ({
  // grant 的 role 必须与 link 自身权限对齐，避免 Graph 返回 role mismatch。
  roles: [mapItemLinkPermissionTypeToGrantRole(change.type)],
  // recipient 标识的优先级沿用 item permission 共享逻辑，避免这里再维护一套分支。
  recipients: change.recipients.map(buildGraphInviteRecipient),
});

/**
 * 构造 `permission/revokeGrants` 的 Graph 请求体。
 *
 * @param change 只包含待移除 recipients 的最小输入。
 * @returns 可直接发送给 Graph 的 revoke body。
 */
export const newGraphRevokeLinkPermissionBody = (change: {
  recipients: IItemUserPermissionRecipientForUI[];
}): {
  grantees: Array<{
    objectId?: string;
    email?: string;
    alias?: string;
  }>;
} => ({
  // revoke 与 grant 复用同一套 recipient 构造规则，保证 objectId/email/alias 优先级一致。
  grantees: change.recipients.map(buildGraphInviteRecipient),
});

/**
 * 读取 link permission 的 `grantedToIdentitiesV2`，并整理成统一 identity 列表。
 *
 * 这里额外做一次去重，目的是让前端展示与 `grantedToCount` 计算更稳定，
 * 避免同一主体因 Graph 返回重复项而在 UI 中出现多行。
 *
 * @param permissionRecord 已经读成 record 的单条 Graph permission。
 * @returns 去重后的 granted identities。
 */
const readGrantedToIdentities = (
  permissionRecord: Record<string, unknown>,
): IGraphPermissionIdentity[] => {
  // link permission 只读取 share facet 自己的 `grantedToIdentitiesV2` 集合，
  // 不再兼容 deprecated 的 `grantedToIdentities`，也不消费 user permission 专用字段。
  const identityCandidates = resolveGrantedToIdentitiesV2(
    permissionRecord.grantedToIdentitiesV2,
  );

  const seen = new Set<string>();

  return identityCandidates
    .map<IGraphPermissionIdentity | null>((identity) => {
      // 按“越稳定越优先”的顺序挑一个比较键，用于识别这是不是同一个主体。
      const dedupeKey =
        identity.graphId ??
        identity.userPrincipalName ??
        identity.mail ??
        identity.displayName;

      if (!dedupeKey || seen.has(dedupeKey)) {
        // 缺少可比较主键，或已经收过相同主体时，直接跳过这一项。
        return null;
      }

      // 记录已经收过的主体，供后续重复项快速过滤。
      seen.add(dedupeKey);

      return identity;
    })
    .filter(
      (identity): identity is IGraphPermissionIdentity => identity !== null,
    );
};
