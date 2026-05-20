import { Request, Response } from "restify";
import { requireContainerManageRequest } from "./auth";
import { BackendValidationError } from "./common/errors";
import { getJobManifest, getJobProgress, startDownloadJob } from "./download";

interface IStartDownloadRequestBody {
  containerId?: unknown;
  itemIds?: unknown;
}

/**
 * 启动归档准备任务。
 *
 * @param req Restify 请求对象。
 * @param res Restify 响应对象。
 */
export const startDownloadRequest = async (req: Request, res: Response) => {
  const authResult = await requireContainerManageRequest(req);
  const body = (req.body ?? {}) as IStartDownloadRequestBody;
  const containerId = readNonEmptyString(body.containerId);
  const itemIds = readStringArray(body.itemIds);

  if (!containerId || itemIds.length === 0) {
    throw new BackendValidationError(
      "containerId and a non-empty itemIds array are required.",
    );
  }

  // 这里只返回 jobId，让前端通过轮询继续读取准备进度和最终 manifest。
  const jobId = await startDownloadJob(
    containerId,
    itemIds,
    authResult.token,
    authResult.claims.oid ?? "",
  );
  res.send(200, { jobId });
};

/**
 * 读取归档任务进度。
 *
 * @param req Restify 请求对象。
 * @param res Restify 响应对象。
 */
export const getDownloadProgressRequest = async (
  req: Request,
  res: Response,
) => {
  const authResult = await requireContainerManageRequest(req);
  const jobId = readNonEmptyString(req.params?.jobId);

  if (!jobId) {
    throw new BackendValidationError("jobId route parameter is required.");
  }

  const requesterOid = authResult.claims.oid ?? "";
  // 所有权校验已经下沉到 download 模块，这里只负责把结果映射回 HTTP。
  res.send(200, getJobProgress(jobId, requesterOid));
};

/**
 * 读取归档任务的下载清单。
 *
 * @param req Restify 请求对象。
 * @param res Restify 响应对象。
 */
export const getDownloadManifestRequest = async (
  req: Request,
  res: Response,
) => {
  const authResult = await requireContainerManageRequest(req);
  const jobId = readNonEmptyString(req.params?.jobId);

  if (!jobId) {
    throw new BackendValidationError("jobId route parameter is required.");
  }

  const requesterOid = authResult.claims.oid ?? "";
  res.send(200, getJobManifest(jobId, requesterOid));
};

/**
 * 把未知输入读取成去首尾空白后的非空字符串。
 *
 * @param value 待解析的输入值。
 * @returns 合法字符串；否则返回 `undefined`。
 */
const readNonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/**
 * 从未知输入中过滤出非空字符串数组。
 *
 * @param value 待解析的输入值。
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
