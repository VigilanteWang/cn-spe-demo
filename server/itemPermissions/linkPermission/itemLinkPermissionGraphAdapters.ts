import type {
  IItemLinkPermissionEntryForUI,
  IItemLinkPermissionGrantedIdentityForUI,
  IItemPermissionRecipientForUI,
  ItemLinkPermissionRoleLabelForUI,
  ItemLinkPermissionScope,
  ItemLinkPermissionType,
} from "../../../common/contracts/itemPermissionCommonContracts";
import {
  normalizeGraphPermissionIdentity,
  resolveGraphPermissionIdentity,
} from "../../permissionsCore/permissionIdentityAdapters";
import {
  readGraphToRecord,
  readOptionalString,
} from "../../permissionsCore/permissionGraphReaders";
import { buildGraphInviteRecipient } from "../itemPermissionsGraphAdapters";

/**
 * 把单条 Graph link permission 映射成前端 link model。
 */
export const mapGraphItemLinkPermission = (
  permission: unknown,
): IItemLinkPermissionEntryForUI | null => {
  const permissionRecord = readGraphToRecord(permission);
  const permissionId = readOptionalString(permissionRecord.id);
  const shareId = readOptionalString(permissionRecord.shareId);
  const linkRecord = readGraphToRecord(permissionRecord.link);
  const webUrl = readOptionalString(linkRecord.webUrl);
  const scope = readLinkPermissionScope(linkRecord.scope);
  const rawType = readOptionalString(linkRecord.type);
  // 这里直接信任 Graph 返回的 `type`，只接受当前 UI 支持的三种枚举值。
  const type =
    rawType === "view" || rawType === "edit" || rawType === "blocksDownload"
      ? rawType
      : undefined;

  if (!permissionId || !webUrl || !scope || !type) {
    return null;
  }

  const grantedToIdentities = readGrantedToIdentities(permissionRecord);
  const roleLabel = mapLinkPermissionTypeToRoleLabel(type);
  const hasShareId = Boolean(shareId);

  return {
    id: `item-link-permission:${permissionId}`,
    permissionId,
    shareId,
    webUrl,
    scope,
    type,
    roleLabel,
    preventsDownload: type === "blocksDownload",
    grantedToIdentities,
    grantedToCount: grantedToIdentities.length,
    capabilities: {
      canGrantRecipients: scope === "users" && hasShareId,
      canRevokeRecipients: scope === "users" && hasShareId,
      canDeleteLink: true,
    },
  };
};

/**
 * 批量筛选并映射 Graph 返回的 link permissions。
 */
export const mapGraphItemLinkPermissions = (
  permissions: unknown[],
): IItemLinkPermissionEntryForUI[] =>
  permissions
    .map(mapGraphItemLinkPermission)
    .filter((entry): entry is IItemLinkPermissionEntryForUI => entry !== null);

/**
 * 读取 link scope。
 */
export const readLinkPermissionScope = (
  value: unknown,
): ItemLinkPermissionScope | undefined => {
  if (value === "anonymous" || value === "organization" || value === "users") {
    return value;
  }

  return undefined;
};

/**
 * 把 link type 转成前端只读标签。
 */
export const mapLinkPermissionTypeToRoleLabel = (
  type: ItemLinkPermissionType,
): ItemLinkPermissionRoleLabelForUI => {
  if (type === "edit") {
    return "Edit";
  }

  if (type === "blocksDownload") {
    return "Block download";
  }

  return "View";
};

/**
 * 把 link type 映射成 grant 需要的 Graph role。
 */
export const mapItemLinkPermissionTypeToGrantRole = (
  type: ItemLinkPermissionType,
): "read" | "write" => (type === "edit" ? "write" : "read");

/**
 * 构造 permission/grant 的 Graph 请求体。
 */
export const newGraphGrantLinkPermissionBody = (change: {
  type: ItemLinkPermissionType;
  recipients: IItemPermissionRecipientForUI[];
}): {
  roles: Array<"read" | "write">;
  recipients: Array<{
    objectId?: string;
    email?: string;
    alias?: string;
  }>;
} => ({
  roles: [mapItemLinkPermissionTypeToGrantRole(change.type)],
  recipients: change.recipients.map(buildGraphInviteRecipient),
});

/**
 * 构造 permission/revokeGrants 的 Graph 请求体。
 */
export const newGraphRevokeLinkPermissionBody = (change: {
  recipients: IItemPermissionRecipientForUI[];
}): {
  grantees: Array<{
    objectId?: string;
    email?: string;
    alias?: string;
  }>;
} => ({
  grantees: change.recipients.map(buildGraphInviteRecipient),
});

const readGrantedToIdentities = (
  permissionRecord: Record<string, unknown>,
): IItemLinkPermissionGrantedIdentityForUI[] => {
  // link permission 只读取 share facet 自己的 `grantedToIdentitiesV2` 集合，
  // 不再兼容 deprecated 的 `grantedToIdentities`，也不消费 user permission 专用字段。
  const identityCandidates = readGrantedToIdentitiesFromCollection(
    permissionRecord.grantedToIdentitiesV2,
  );

  const seen = new Set<string>();

  return identityCandidates
    .map<IItemLinkPermissionGrantedIdentityForUI | null>((identity) => {
      const dedupeKey =
        identity.graphId ??
        identity.userPrincipalName ??
        identity.mail ??
        identity.displayName;

      if (!dedupeKey || seen.has(dedupeKey)) {
        return null;
      }

      seen.add(dedupeKey);

      return {
        id: `item-link-recipient:${dedupeKey}`,
        principalId: identity.graphId ?? dedupeKey,
        principalName: identity.displayName,
        principalType: identity.principalType,
        description: identity.description,
        ...(identity.graphId ? { principalObjectId: identity.graphId } : {}),
        ...(identity.userPrincipalName
          ? { principalUserPrincipalName: identity.userPrincipalName }
          : {}),
        ...(identity.mail ? { principalMail: identity.mail } : {}),
      };
    })
    .filter(
      (identity): identity is IItemLinkPermissionGrantedIdentityForUI =>
        identity !== null,
    );
};

const readGrantedToIdentitiesFromCollection = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const record = readGraphToRecord(entry);
      const groupIdentity = normalizeGraphPermissionIdentity(record.group);
      if (groupIdentity) {
        return {
          principalType: "groups" as const,
          ...groupIdentity,
        };
      }

      const userIdentity = normalizeGraphPermissionIdentity(record.user);
      if (userIdentity) {
        return {
          principalType: "people" as const,
          ...userIdentity,
        };
      }

      const grantedToV2Identity = resolveGraphPermissionIdentity({
        grantedToV2: record,
      });

      return grantedToV2Identity;
    })
    .filter((identity) => identity !== null);
};
