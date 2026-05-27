import { readErrorMessage } from "../../../common/errors.ts";
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
export const createEmptyPermissionEntriesByTab = <TEntry,>() => ({
  people: [] as TEntry[],
  groups: [] as TEntry[],
});

interface IPermissionRequestErrorShape {
  message: string;
  code?: string;
  retryAfterSeconds?: number;
  requestId?: string;
}

/**
 * 判断错误对象是否已经具备权限请求错误的关键字段。
 */
const isPermissionRequestError = (
  error: unknown,
): error is IPermissionRequestErrorShape => {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    ("code" in error || "requestId" in error || "retryAfterSeconds" in error)
  );
};

/**
 * 把权限请求错误转换成适合 UI 直接展示的文案。
 */
export const formatPermissionRequestErrorMessage = (
  error: unknown,
  fallbackMessage: string,
): string => {
  if (isPermissionRequestError(error)) {
    if (error.code === "throttled" && error.retryAfterSeconds) {
      return `${error.message} Retry after ${error.retryAfterSeconds} seconds.`;
    }

    if (error.requestId) {
      return `${error.message} Request ID: ${error.requestId}.`;
    }

    return error.message;
  }

  return readErrorMessage(error, fallbackMessage);
};

/**
 * 统一构造顶部状态区展示的错误消息数组。
 */
export const buildPermissionStatusMessages = (
  permissionRequestErrorMessage: string | null,
  searchError: unknown,
) =>
  [
    permissionRequestErrorMessage
      ? `Api Error: ${permissionRequestErrorMessage}`
      : null,
    searchError
      ? `Search Error: ${readErrorMessage(
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
