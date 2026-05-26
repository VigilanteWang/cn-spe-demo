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

interface ISupportedItemPermissionCandidate {
  entry: IItemPermissionEntryForUI;
  permissionId: string;
}

export interface IItemPermissionListContext {
  currentPermissions: unknown[];
  parentPermissions?: unknown[];
}

/**
 * 把当前 item 和父 folder 的 effective permissions 转成前端响应。
 *
 * 继承判断不依赖 `inheritedFrom`，而是改用父子两层的 `permissionId` 对比。
 * 只要当前项里的 `permissionId` 也出现在父 folder 里，就把它视为 inherited。
 *
 * @param context 当前 item 权限与可选的父 folder 权限。
 * @returns 返回前端可以直接消费的 item 权限列表。
 */
export const mapGraphItemPermissionsToResponse = (
  context: IItemPermissionListContext,
): IItemPermissionsResponseFromApi => {
  // 先把当前 item 的每条 Graph permission 转成统一候选结构。
  const currentCandidates = context.currentPermissions.map(
    mapGraphPermissionCandidate,
  );
  // 父 folder 权限也做同样转换；没有父 folder 时就使用空数组。
  const parentCandidates =
    context.parentPermissions?.map(mapGraphPermissionCandidate) ?? [];

  // 过滤掉当前 UI 不支持展示和编辑的权限条目。
  const currentSupportedCandidates = currentCandidates.filter(
    (candidate): candidate is ISupportedItemPermissionCandidate =>
      Boolean(candidate),
  );
  // 父 folder 也做一次同样过滤，避免把 `null` 误当成有效权限。
  const parentSupportedCandidates = parentCandidates.filter(
    (candidate): candidate is ISupportedItemPermissionCandidate =>
      Boolean(candidate),
  );
  // 提前收集父 folder 的 `permissionId`，便于后面快速判断继承关系。
  const parentPermissionIds = new Set(
    parentSupportedCandidates.map((candidate) => candidate.permissionId),
  );

  return {
    // 把当前项候选结构映射成最终返回给前端的权限行。
    entries: currentSupportedCandidates.map((candidate) => {
      // 当前 `permissionId` 也存在于父 folder 时，说明它是继承权限。
      const isInherited = parentPermissionIds.has(candidate.permissionId);

      return {
        // 保留候选结构里已经准备好的主体、角色等基础字段。
        ...candidate.entry,
        // 把继承判断结果写回前端模型。
        isInherited,
        // 继承权限不允许在当前 item 上直接编辑。
        isEditable: !isInherited,
        // 继承权限也不允许在当前 item 上直接删除。
        isRemovable: !isInherited,
      };
    }),
  };
};

/**
 * 把单条 Graph permission 转成内部候选结构。
 *
 * supported permission 指的是：
 * - permission 中存在 `grantedToV2.user` 或 `grantedToV2.group`
 * - 并且当前代码能把它解析成 `people` 或 `groups`
 *
 * 如果这条 permission 不属于当前支持范围，例如只有 `siteUser`、`siteGroup`、
 * 旧 `grantedTo` 或 link permission，就返回 `null`。
 *
 * @param permission 单条 Graph permission 原始对象。
 * @returns 支持的权限候选结构；不支持时返回 `null`。
 */
export const mapGraphPermissionCandidate = (
  permission: unknown,
): ISupportedItemPermissionCandidate | null => {
  // 先把原始 permission 读成统一的 record 结构，便于安全取字段。
  const permissionRecord = readGraphToRecord(permission);
  // `id` 是后续继承判断和更新/删除写回都要依赖的稳定主键。
  const permissionId = readRequiredString(permissionRecord.id, "permission id");
  // Graph roles 是数组；当前 UI 只取第一项作为主角色。
  const roles = readStringArray(permissionRecord.roles);
  // 只解析当前产品支持的 AAD user/group 身份。
  const principal = resolveGraphPermissionIdentity(permission);

  // 没有可支持的身份时，直接交给上层忽略这条 permission。
  if (!principal) {
    return null;
  }

  // Graph 没有返回角色时，保守回退到 `read`。
  const primaryRole = roles[0] ?? "read";
  const entry: IItemPermissionEntryForUI = {
    // 前端列表项本地 id 统一用 `permissionId` 派生。
    id: `permission:${permissionId}`,
    permissionId,
    principalId:
      // 优先使用 Graph 返回的对象 id；没有时再生成前端本地回退 id。
      principal.graphId ??
      createFallbackPrincipalId(principal.principalType, permissionId),
    principalObjectId: principal.graphId,
    principalUserPrincipalName:
      // 只有 `people` 类型才有 `userPrincipalName` 的业务意义。
      principal.principalType === "people"
        ? principal.userPrincipalName
        : undefined,
    principalMail: principal.mail,
    principalName: principal.displayName,
    principalType: principal.principalType,
    description: principal.description,
    // 初始先按显式权限处理，继承标记由上层统一覆盖。
    isInherited: false,
    isEditable: true,
    isRemovable: true,
    // 把 Graph 角色映射成前端统一角色名。
    role: mapGraphItemPermissionRoleToUi(primaryRole),
  };

  return {
    // 返回给上层的候选结构同时保留 `entry` 和 `permissionId`。
    entry,
    permissionId,
  };
};

/**
 * 构造 item invite 请求体。
 *
 * recipient 标识的选择优先级与验证结论保持一致：`objectId -> email -> alias`。
 *
 * @param createChange 前端提交的一条新增权限变更。
 * @returns 可直接发送给 Graph `/invite` 的最小请求体。
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
  // Graph recipients 需要数组，这里当前始终只构造一位收件人。
  recipients: [buildGraphInviteRecipient(createChange)],
  // 当前产品只支持需要登录的正式分享对象。
  requireSignIn: true,
  // 当前流程只写权限，不让 Graph 发送邀请邮件。
  sendInvitation: false,
  // 把 UI 角色名称映射成 Graph 接受的角色值。
  roles: [mapUiItemPermissionRoleToGraph(createChange.role)],
});

/**
 * 从前端 change 中挑出 Graph invite 需要的 recipient 标识。
 *
 * 这三个字段在类型上都是可选的，但运行时必须至少提供一个；
 * 否则后端无法构造合法的 Graph `driveRecipient`。
 *
 * @param change 只包含 recipient 候选标识的对象。
 * @returns Graph invite 可用的单个 recipient 对象。
 * @throws 当三个 recipient 标识都缺失时抛错。
 */
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
  // `objectId` 最稳定，优先拿来作为 Graph recipient。
  if (change.recipientObjectId) {
    return { objectId: change.recipientObjectId };
  }

  // 没有 `objectId` 时，再退回到 `email`。
  if (change.recipientEmail) {
    return { email: change.recipientEmail };
  }

  // 最后才使用 `alias`，避免比前两种更模糊的标识先命中。
  if (change.recipientAlias) {
    return { alias: change.recipientAlias };
  }

  // 三种标识都没有时，当前请求不可能构造成合法 invite。
  throw new Error(
    "Item invite recipient is missing all supported identifiers.",
  );
};

/**
 * 在 `people` 没有返回 object id 时，生成仅供前端本地识别的回退 id。
 *
 * 这个回退 id 不参与 Graph 写回，只用于让前端列表里每条权限都有稳定主体标识。
 *
 * @param principalType 当前主体类型。
 * @param permissionId 当前权限 id。
 * @returns 仅供前端本地识别的主体 id。
 */
export const createFallbackPrincipalId = (
  principalType: "people" | "groups",
  permissionId: string,
): string => `${principalType}:permission:${permissionId}`;
