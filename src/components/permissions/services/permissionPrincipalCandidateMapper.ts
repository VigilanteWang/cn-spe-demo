import {
  IPermissionPrincipalCandidate,
  PermissionTabValue,
} from "../models/permissionModels";
import { IDirectoryPrincipalSearchResult } from "./directoryPrincipalSearch/directoryPrincipalSearch";

/**
 * 把目录搜索结果映射成权限弹窗可直接消费的候选项模型。
 *
 * 这样 Hook 可以专注于请求节流和状态管理，
 * Dialog 也只需要渲染统一后的候选项结构。
 */
export const mapDirectorySearchResultToCandidate = (
  result: IDirectoryPrincipalSearchResult,
  tab: PermissionTabValue,
): IPermissionPrincipalCandidate => ({
  id: result.id,
  name: result.displayName,
  type: tab,
  secondaryText: result.secondaryText,
  initials: getInitials(result.displayName),
  lookupKey: normalizeLookupKey(
    result.userPrincipalName ?? result.mail ?? result.secondaryText,
  ),
  userPrincipalName: result.userPrincipalName,
});

/**
 * 从显示名称中提取最多两个首字母，供 Avatar 使用。
 */
const getInitials = (name: string): string => {
  const segments = name
    .trim()
    .split(/\s+/)
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return "?";
  }

  if (segments.length === 1) {
    return segments[0].slice(0, 2).toUpperCase();
  }

  return `${segments[0][0]}${segments[1][0]}`.toUpperCase();
};

/**
 * 规范化辅助查找键，供本地重复判断复用。
 */
const normalizeLookupKey = (value: string): string | undefined => {
  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
};
