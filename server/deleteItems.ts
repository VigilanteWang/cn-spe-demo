import { Request, Response } from "restify";
import {
  createGraphClient,
  getGraphToken,
  requireContainerManageRequest,
} from "./auth";
import {
  BackendValidationError,
  toBackendUpstreamError,
} from "./common/errors";

interface IDeleteItemsRequestBody {
  containerId?: unknown;
  itemIds?: unknown;
}

/**
 * 批量删除容器中的多个项目。
 *
 * 这里保留“部分成功、部分失败”的返回语义，
 * 但把请求级错误统一交给服务端错误模型处理。
 */
export const deleteItems = async (req: Request, res: Response) => {
  const authResult = await requireContainerManageRequest(req);
  const body = (req.body ?? {}) as IDeleteItemsRequestBody;
  const containerId = readNonEmptyString(body.containerId);
  const itemIds = readStringArray(body.itemIds);

  if (!containerId || itemIds.length === 0) {
    throw new BackendValidationError(
      "containerId and a non-empty itemIds array are required.",
    );
  }

  try {
    const graphToken = await getGraphToken(authResult.token);
    const graphClient = createGraphClient(graphToken);

    const successful: string[] = [];
    const failed: Array<{ id: string; reason: string }> = [];

    // 顺序删除能减少瞬时并发，降低 Graph 节流概率。
    for (const itemId of itemIds) {
      try {
        await graphClient.api(`/drives/${containerId}/items/${itemId}`).delete();
        successful.push(itemId);
      } catch (error: unknown) {
        failed.push({
          id: itemId,
          reason: getSafeDeleteFailureReason(error),
        });
      }
    }

    res.send(200, { successful, failed });
  } catch (error: unknown) {
    throw toBackendUpstreamError(error, {
      defaultMessage: "Unable to delete the selected items.",
      throttledMessage:
        "Microsoft Graph throttled the delete-items request after retries were exhausted.",
      serviceUnavailableMessage:
        "Microsoft Graph is temporarily unavailable for the delete-items request.",
      graphFailureMessage: "Unable to delete the selected items.",
    });
  }
};

const readNonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
};

const getSafeDeleteFailureReason = (error: unknown): string =>
  error instanceof Error && error.message
    ? error.message
    : "Delete request failed for this item.";
