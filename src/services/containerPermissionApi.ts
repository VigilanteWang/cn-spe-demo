import { sendAuthorizedRequest } from "./apiClient";
import type {
  IContainerPermissionChangeSetFromUI,
  IContainerPermissionEntryForUI,
  IContainerPermissionsResponseFromApi,
} from "../../common/contracts/containerPermissionCommonContracts";
import { mapApiErrorResponseToAppError } from "../common/apiErrorMapper";
import type { PermissionEntriesByTab } from "../components/permissions/models/permissionSharedModels";
import { mapPermissionEntriesToTabs } from "./permissionApiShared";

/**
 * 加载指定容器的当前权限列表。
 *
 * 这个函数只负责前端请求编排和响应整形，不在这里做权限语义判断；
 * 后端返回的 entry 会统一交给共享映射器按 `people/groups` 分组。
 *
 * @param containerId 当前容器的标识。
 * @returns 供容器权限对话框直接消费的分组结果。
 * @throws 当后端返回非成功状态时抛出 `AppError`。
 */
export const listContainerPermissions = async (
  containerId: string,
): Promise<PermissionEntriesByTab<IContainerPermissionEntryForUI>> => {
  const response = await sendAuthorizedRequest(
    // 路径参数先做 URL 编码，避免容器 ID 中的特殊字符破坏路由。
    `/api/containerPermissions/${encodeURIComponent(containerId)}`,
    {
      method: "GET",
    },
  );

  // 非 2xx 时统一走共享错误映射，保证和 item 权限接口一致的错误形状。
  if (!response.ok) {
    throw await mapApiErrorResponseToAppError(response, {
      operationLabel: "Container permission request",
    });
  }

  // 成功后把后端扁平 entries 映射成前端 tab 需要的分组结构。
  const payload =
    (await response.json()) as IContainerPermissionsResponseFromApi;
  return mapPermissionEntriesToTabs(payload.entries);
};

/**
 * 把当前草稿差异提交给后端，并返回服务端确认后的最新权限列表。
 *
 * 这里不会在前端重新修正变更内容，而是把差异结果原样提交给后端，
 * 让后端继续作为容器权限写回和错误归一化的唯一边界。
 *
 * @param containerId 当前容器的标识。
 * @param changes 前端差异计算阶段产出的 create/update/remove 变更集合。
 * @returns 服务端应用变更后返回的最新权限分组结果。
 * @throws 当 apply 请求失败时抛出 `AppError`。
 */
export const applyContainerPermissionChanges = async (
  containerId: string,
  changes: IContainerPermissionChangeSetFromUI,
): Promise<PermissionEntriesByTab<IContainerPermissionEntryForUI>> => {
  const response = await sendAuthorizedRequest(
    // `/apply` 端点表示由后端统一执行新增、更新、删除三类写回。
    `/api/containerPermissions/${encodeURIComponent(containerId)}/apply`,
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
      operationLabel: "Container permission apply request",
    });
  }

  // 成功后以后端确认结果为准，避免前端继续依赖旧草稿状态。
  const payload =
    (await response.json()) as IContainerPermissionsResponseFromApi;
  return mapPermissionEntriesToTabs(payload.entries);
};
