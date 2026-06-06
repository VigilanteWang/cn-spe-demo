import { AppError } from "../../common/appError";
import type { IPermissionEntryBaseForUI } from "../../common/contracts/permissionCommonContracts";
import type { PermissionEntriesByTab } from "../components/permissions/models/permissionSharedModels";
import { readApiErrorResponseSummary } from "../common/apiErrorMapper";

/**
 * 把权限数组重新按 `people/groups` 页签结构分组。
 *
 * 这里保持一个共享映射入口，避免 container 和 item 权限接口
 * 分别维护重复的前端分组逻辑。
 *
 * @param entries 后端返回或前端流程中流转的扁平权限数组。
 * @returns 供权限对话框直接消费的按页签分组结果。
 */
export const mapPermissionEntriesToTabs = <
  TEntry extends IPermissionEntryBaseForUI,
>(
  entries: TEntry[],
): PermissionEntriesByTab<TEntry> => {
  const nextEntries: PermissionEntriesByTab<TEntry> = {
    people: [],
    groups: [],
  };

  for (const entry of entries) {
    // `principalType` 已经在共享合同层收窄为 people/groups，可直接路由到对应页签。
    nextEntries[entry.principalType].push(entry);
  }

  return nextEntries;
};

/**
 * 把权限接口的失败响应转换成统一的 `PermissionApiError`。
 *
 * 这个函数优先复用后端返回的稳定错误体；如果响应体缺失、不是 JSON，
 * 或字段不完整，则回退到前端可兜底的默认错误码和消息。
 *
 * @param response 权限接口返回的失败响应对象。
 * @param operationLabel 当前操作的人类可读标签，用于生成兜底错误消息。
 * @returns 带状态码、请求 ID、重试秒数等上下文的统一错误对象。
 */
export const buildPermissionApiError = async (
  response: Response,
  operationLabel: string,
): Promise<AppError> => {
  return readApiErrorResponseSummary(response, {
    operationLabel,
  });
};
