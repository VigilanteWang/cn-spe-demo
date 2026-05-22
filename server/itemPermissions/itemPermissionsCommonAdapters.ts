import type {
  IItemPermissionCreateChange,
  IItemPermissionEntryForUI,
  IItemPermissionsResponseFromApi,
} from "../../common/contracts/itemPermissionCommonContracts";
import { resolveGraphPermissionIdentity } from "../permissionsCore/permissionIdentityAdapters";
import {
  readGraphToRecord,
  readRequiredString,
  readStringArray,
} from "../permissionsCore/permissionGraphReaders";
import {
  mapGraphItemPermissionRoleToUi,
  mapUiItemPermissionRoleToGraph,
} from "./itemPermissionRoleMapper";

interface IManagedItemPermissionCandidate {
  entry: IItemPermissionEntryForUI;
  permissionId: string;
}

export interface IItemPermissionListContext {
  currentPermissions: unknown[];
  parentPermissions?: unknown[];
}

/**
 * 把当前 item 与父项的 effective permissions 映射成前端共同契约。
 *
 * 继承分类规则说明：
 * - 当前项目不把 `inheritedFrom` 作为正式判定依据，因为实测里它经常只是空对象 `{}`，
 *   不能稳定表达权限来源。
 * - 因此这里采用“即时父项 effective permission 集合比对”：
 *   1. 先把当前项和父项里可管理的 identity permission 规范化；
 *   2. 再只用 `permissionId` 判断当前行是否也存在于父项集合中；
 *   3. 任何不确定情况都保守地当作 explicit，避免误把可编辑权限禁用掉。
 */
export const mapGraphItemPermissionsToResponse = (
  context: IItemPermissionListContext,
): IItemPermissionsResponseFromApi => {
  const currentCandidates = context.currentPermissions.map(mapGraphPermissionCandidate);
  const parentCandidates = context.parentPermissions?.map(mapGraphPermissionCandidate) ?? [];

  const currentManagedCandidates = currentCandidates.filter(
    (candidate): candidate is IManagedItemPermissionCandidate => Boolean(candidate),
  );
  const parentManagedCandidates = parentCandidates.filter(
    (candidate): candidate is IManagedItemPermissionCandidate => Boolean(candidate),
  );
  const parentPermissionIds = new Set(
    parentManagedCandidates.map((candidate) => candidate.permissionId),
  );

  return {
    entries: currentManagedCandidates.map((candidate) => {
      const isInherited = parentPermissionIds.has(candidate.permissionId);

      return {
        ...candidate.entry,
        isInherited,
        isEditable: !isInherited,
        isRemovable: !isInherited,
        inheritanceSource: isInherited ? "parent" : undefined,
      };
    }),
  };
};

/**
 * 把单条 Graph permission 转成内部候选对象。
 *
 * 如果它不是当前对话框支持管理的 identity permission，
 * 就返回 null，并由上层静默跳过。
 */
export const mapGraphPermissionCandidate = (
  permission: unknown,
): IManagedItemPermissionCandidate | null => {
  const permissionRecord = readGraphToRecord(permission);
  const permissionId = readRequiredString(permissionRecord.id, "permission id");
  const roles = readStringArray(permissionRecord.roles);
  const principal = resolveGraphPermissionIdentity(permission);

  if (!principal) {
    return null;
  }

  const primaryRole = roles[0] ?? "read";
  const entry: IItemPermissionEntryForUI = {
    id: `permission:${permissionId}`,
    permissionId,
    principalId:
      principal.graphId ??
      createFallbackPrincipalId(principal.principalType, permissionId),
    principalObjectId: principal.graphId,
    principalUserPrincipalName:
      principal.principalType === "people"
        ? principal.userPrincipalName
        : undefined,
    principalMail: principal.mail,
    principalName: principal.displayName,
    principalType: principal.principalType,
    description: principal.description,
    isInherited: false,
    isEditable: true,
    isRemovable: true,
    role: mapGraphItemPermissionRoleToUi(primaryRole),
  };

  return {
    entry,
    permissionId,
  };
};

/**
 * 构造 item invite 请求体。
 *
 * recipient 选择优先级与验证结论保持一致：objectId -> email -> alias。
 */
export const newGraphInvitePermissionBody = (
  createChange: IItemPermissionCreateChange,
): {
  recipients: Array<{
    objectId?: string;
    email?: string;
    alias?: string;
  }>;
  requireSignIn: true;
  sendInvitation: false;
  roles: string[];
} => ({
  recipients: [buildGraphInviteRecipient(createChange)],
  requireSignIn: true,
  sendInvitation: false,
  roles: [mapUiItemPermissionRoleToGraph(createChange.role)],
});

export const buildGraphInviteRecipient = (
  change: Pick<
    IItemPermissionCreateChange,
    "recipientObjectId" | "recipientEmail" | "recipientAlias"
  >,
): {
  objectId?: string;
  email?: string;
  alias?: string;
} => {
  if (change.recipientObjectId) {
    return { objectId: change.recipientObjectId };
  }

  if (change.recipientEmail) {
    return { email: change.recipientEmail };
  }

  if (change.recipientAlias) {
    return { alias: change.recipientAlias };
  }

  throw new Error("Item invite recipient is missing all supported identifiers.");
};

/**
 * people 没有返回 object id 时，生成仅供前端本地识别的回退 id。
 */
export const createFallbackPrincipalId = (
  principalType: "people" | "groups",
  permissionId: string,
): string => `${principalType}:permission:${permissionId}`;
