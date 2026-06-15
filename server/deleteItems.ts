import { Request, Response } from "restify";
import { sendGraphRequest } from "../common/graphError";
import {
  createGraphClient,
  getGraphOBOToken,
  requireContainerManageRequest,
} from "./auth";
import { createValidationError } from "./common/appErrorHelpers";

interface IDeleteItemsRequestBody {
  containerId?: unknown;
  itemIds?: unknown;
}

/**
 * 批量删除容器中的多个项目。
 *
 * 这里保留“部分成功、部分失败”的返回语义，
 * 但把请求级错误统一交给服务端错误模型处理。
 *
 * @param req Restify 请求对象。
 * @param res Restify 响应对象。
 */
export const deleteItems = async (req: Request, res: Response) => {
  const authResult = await requireContainerManageRequest(req);
  const body = (req.body ?? {}) as IDeleteItemsRequestBody;
  const containerId = readNonEmptyString(body.containerId);
  const itemIds = readStringArray(body.itemIds);

  if (!containerId || itemIds.length === 0) {
    throw createValidationError(
      "containerId and a non-empty itemIds array are required.",
    );
  }

  const graphToken = await getGraphOBOToken(authResult.token);
  const graphClient = createGraphClient(graphToken);
  const successful: string[] = [];
  const failed: Array<{ id: string; reason: string }> = [];

  // 顺序删除可以降低瞬时并发，减少 Graph 节流和竞争失败的概率。
  for (const itemId of itemIds) {
    try {
      const deleteRequest = graphClient.api(
        `/drives/${containerId}/items/${itemId}`,
      );
      await sendGraphRequest(
        () => deleteRequest.delete(),
        "Unable to delete the selected items.",
      );
      successful.push(itemId);
    } catch (error: unknown) {
      failed.push({
        id: itemId,
        reason: getSafeDeleteFailureReason(error),
      });
    }
  }

  res.send(200, { successful, failed });
};

/**
 * 把未知值解析为去首尾空白后的非空字符串。
 *
 * @param value 待解析值。
 * @returns 合法字符串；否则返回 `undefined`。
 */
const readNonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/**
 * 从未知值中过滤出非空字符串数组。
 *
 * @param value 待解析值。
 * @returns 过滤后的字符串数组。
 */
const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
};

/**
 * 提取适合返回给前端的删除失败原因。
 *
 * @param error 原始异常对象。
 * @returns 稳定的失败文案。
 */
const getSafeDeleteFailureReason = (error: unknown): string =>
  error instanceof Error && error.message
    ? error.message
    : "Delete request failed for this item.";
