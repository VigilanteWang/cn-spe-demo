import { formatAppErrorMessageForUI } from "../../../common/errors.ts";
import type { IPermissionEntryBaseForUI } from "../../../../common/contracts/permissionCommonContracts";
import type {
  IPermissionPrincipalCandidate,
  PermissionTabValue,
} from "../models/permissionSharedModels";

export type PermissionApplyFeedbackStatus = "success" | "error" | null;

/**
 * 根据当前页签返回界面显示用的标题文案。
 */
export const getPermissionTabTitle = (tab: PermissionTabValue) =>
  tab === "people" ? "People" : "Groups";

/**
 * 创建一份空的 `people/groups` 权限分组结构。
 */
export const createEmptyPermissionEntriesByTab = <TEntry>() => ({
  people: [] as TEntry[],
  groups: [] as TEntry[],
});

/**
 * 统一构造顶部状态区展示的错误消息数组。
 */
export const buildPermissionErrorMessages = (
  permissionRequestErrorMessage: string | null,
  searchError: unknown,
) =>
  [
    permissionRequestErrorMessage
      ? `Api Error: ${permissionRequestErrorMessage}`
      : null,
    searchError
      ? `Search Error: ${formatAppErrorMessageForUI(
          searchError,
          "Directory search failed. Please try again later.",
        )}`
      : null,
  ].filter((message): message is string => Boolean(message));

/**
 * 把目录搜索候选项转换成共享的权限草稿基础字段。
 */
export const createBasePermissionEntryFromCandidate = (
  candidate: IPermissionPrincipalCandidate,
): IPermissionEntryBaseForUI => ({
  id: `${candidate.type}:${candidate.id}`,
  principalId: candidate.id,
  principalObjectId: candidate.objectId,
  principalUserPrincipalName: candidate.userPrincipalName,
  principalMail: candidate.mail,
  principalName: candidate.name,
  principalType: candidate.type,
  description: candidate.secondaryText,
  isInherited: false,
  isEditable: true,
  isRemovable: true,
});
