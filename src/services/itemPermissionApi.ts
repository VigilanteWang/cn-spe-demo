import { sendAuthorizedRequest } from "./apiClient";
import type {
  IItemPermissionChangeSetFromUI,
  IItemPermissionsResponseFromApi,
} from "../../common/contracts/itemPermissionCommonContracts";
import { mapApiErrorResponseToAppError } from "../common/apiErrorMapper";
import type { IItemPermissionEntriesLoadResult } from "../components/permissions/models/itemPermissionModels";
import { mapPermissionEntriesToTabs } from "./permissionApiShared";

/**
 * 加载指定 item 的当前权限列表。
 *
 * 这个函数只负责前端请求编排和响应整形，不在这里做权限语义判断；
 * 后端返回的 entry 会统一交给共享映射器按 `people/groups` 分组。
 *
 * @param driveId 当前 item 所属 drive 的标识。
 * @param itemId 当前 item 的标识。
 * @returns 供权限对话框直接消费的分组选项结果。
 * @throws 当后端返回非成功状态时抛出 `AppError`。
 */
export const listItemPermissions = async (
  driveId: string,
  itemId: string,
): Promise<IItemPermissionEntriesLoadResult> => {
  const response = await sendAuthorizedRequest(
    // 路径参数先做 URL 编码，避免 driveId 或 itemId 中的特殊字符破坏路由。
    `/api/itemPermissions/${encodeURIComponent(driveId)}/${encodeURIComponent(itemId)}`,
    {
      method: "GET",
    },
  );

  // 非 2xx 时统一走共享错误映射，保留 retry-after 等稳定上下文。
  if (!response.ok) {
    throw await mapApiErrorResponseToAppError(response, {
      operationLabel: "Item permission request",
    });
  }

  // 响应体先还原成共享合同，再按权限页签需要的结构重新分组。
  const payload = (await response.json()) as IItemPermissionsResponseFromApi;
  return {
    entriesByTab: mapPermissionEntriesToTabs(payload.entries),
  };
};

/**
 * 把 item 权限草稿差异提交给后端，并返回服务端确认后的最新权限列表。
 *
 * 这里不会在前端重新计算或修正变更内容，而是直接把上游差异结果原样提交，
 * 让后端作为最终写回边界执行校验和 Graph 调用。
 *
 * @param driveId 当前 item 所属 drive 的标识。
 * @param itemId 当前 item 的标识。
 * @param changes 前端差异计算阶段产出的 create/update/remove 变更集合。
 * @returns 服务端应用变更后返回的最新权限分组结果。
 * @throws 当 apply 请求失败时抛出 `AppError`。
 */
export const applyItemPermissionChanges = async (
  driveId: string,
  itemId: string,
  changes: IItemPermissionChangeSetFromUI,
): Promise<IItemPermissionEntriesLoadResult> => {
  const response = await sendAuthorizedRequest(
    // `/apply` 端点表示由后端统一执行新增、更新、删除三类写回。
    `/api/itemPermissions/${encodeURIComponent(driveId)}/${encodeURIComponent(itemId)}/apply`,
    {
      method: "POST",
      headers: {
        // 明确声明 JSON 请求体，避免后端按默认文本流解析。
        "Content-Type": "application/json",
      },
      // 直接提交差异对象，让后端保持为唯一的写回裁决边界。
      body: JSON.stringify(changes),
    },
  );

  // apply 失败时沿用共享错误模型，保证列表请求和写回请求的错误体验一致。
  if (!response.ok) {
    throw await mapApiErrorResponseToAppError(response, {
      operationLabel: "Item permission apply request",
    });
  }

  // 成功后以后端确认结果为准，避免前端继续依赖旧草稿状态。
  const payload = (await response.json()) as IItemPermissionsResponseFromApi;
  return {
    entriesByTab: mapPermissionEntriesToTabs(payload.entries),
  };
};
