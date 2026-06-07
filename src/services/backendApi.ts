/**
 * 容器后端 API 模块
 *
 * 本模块负责容器的增删查操作，是前端与后端容器相关端点的通信层。
 *
 * 依赖 apiClient 模块统一处理 token 获取和授权请求；
 * 本模块只关注各端点的业务逻辑和领域错误处理。
 *
 * 后端 API 端点：
 * - GET  /api/listContainers   - 列出容器
 * - POST /api/createContainer  - 创建容器
 * - POST /api/deleteItems      - 批量删除文件/文件夹
 */

import { sendAuthorizedRequest } from "./apiClient";
import { IContainer } from "../common/types";
import { readApiErrorResponseSummary } from "../common/apiErrorMapper";

/**
 * 批量删除操作的返回结果。
 *
 * 删除操作支持部分成功：即使某些文件删除失败，已成功的不会回滚。
 */
export interface IDeleteItemsResult {
  successful: string[]; // 成功删除的文件 ID 列表
  failed: Array<{ id: string; reason: string }>; // 失败的文件 ID 及原因
}

/**
 * 列出当前用户可访问的所有容器。
 *
 * @returns 容器数组
 * @throws 未登录或请求失败时抛出错误
 *
 * 调用流程：
 * 1. 通过 apiClient.sendAuthorizedRequest 获取 token 并发送请求
 * 2. 后端验证 token → OBO 换取 Graph token → 查询 Graph API
 * 3. 返回按 containerTypeId 过滤后的容器列表
 */
export async function listContainers(): Promise<IContainer[]> {
  const response = await sendAuthorizedRequest("/api/listContainers", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (response.ok) {
    const body = await response.json();
    // Graph API 把集合包在 value 数组里返回；空集合时返回空数组而非 undefined
    return (body.value as IContainer[]) ?? [];
  }
  throw await readApiErrorResponseSummary(response, {
    operationLabel: "listContainers",
  });
}

/**
 * 创建新的存储容器。
 *
 * @param containerName        容器显示名称（必填）
 * @param containerDescription 容器描述（可选，默认为空字符串）
 * @returns 创建成功的容器对象
 * @throws 未登录或请求失败时抛出错误
 *
 * 调用流程：
 * 1. 通过 apiClient.sendAuthorizedRequest 发送 POST 请求
 * 2. 后端验证 token → OBO 换取 Graph token → 调用 Graph API 创建容器
 * 3. 返回新容器的完整信息（包括 id、createdDateTime 等）
 */
export async function createContainer(
  containerName: string,
  containerDescription: string = "",
): Promise<IContainer> {
  const response = await sendAuthorizedRequest("/api/createContainer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      displayName: containerName,
      description: containerDescription,
    }),
  });

  if (response.ok) {
    return (await response.json()) as IContainer;
  }
  throw await readApiErrorResponseSummary(response, {
    operationLabel: "createContainer",
  });
}

/**
 * 批量删除容器内的文件或文件夹。
 *
 * @param containerId 容器 ID（即 Drive ID）
 * @param itemIds     要删除的文件/文件夹 ID 数组
 * @returns 删除结果，包含成功和失败的 ID 列表
 * @throws 未登录或请求失败时抛出错误
 *
 * 注意：删除支持部分成功，result.failed 数组记录失败的项目及原因。
 */
export async function deleteItems(
  containerId: string,
  itemIds: string[],
): Promise<IDeleteItemsResult> {
  const response = await sendAuthorizedRequest("/api/deleteItems", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ containerId, itemIds }),
  });

  if (response.ok) {
    return (await response.json()) as IDeleteItemsResult;
  }
  throw await readApiErrorResponseSummary(response, {
    operationLabel: "deleteItems",
  });
}
