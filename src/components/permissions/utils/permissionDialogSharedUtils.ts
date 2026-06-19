import { formatAppErrorMessageForUI } from "../../../../common/appError";
import type { PermissionTabValue } from "../models/permissionSharedModels";

export type PermissionApplyFeedbackStatus = "success" | "error" | null;

/**
 * 根据当前 tab 返回界面显示用的标题文案。
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
