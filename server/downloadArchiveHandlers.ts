import { Request, Response } from "restify";
import { requireContainerManageRequest } from "./auth";
import {
  getJobManifest,
  getJobProgress,
  startDownloadJob,
} from "./downloadArchive";
import {
  BackendBusinessError,
  BackendValidationError,
} from "./common/errors";

interface IStartDownloadArchiveRequestBody {
  containerId?: unknown;
  itemIds?: unknown;
}

/**
 * 启动归档准备任务。
 */
export const startDownloadArchiveRequest = async (
  req: Request,
  res: Response,
) => {
  const authResult = await requireContainerManageRequest(req);
  const body = (req.body ?? {}) as IStartDownloadArchiveRequestBody;
  const containerId = readNonEmptyString(body.containerId);
  const itemIds = readStringArray(body.itemIds);

  if (!containerId || itemIds.length === 0) {
    throw new BackendValidationError(
      "containerId and a non-empty itemIds array are required.",
    );
  }

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
 */
export const getDownloadArchiveProgressRequest = async (
  req: Request,
  res: Response,
) => {
  const authResult = await requireContainerManageRequest(req);
  const jobId = readNonEmptyString(req.params?.jobId);

  if (!jobId) {
    throw new BackendValidationError("jobId route parameter is required.");
  }

  const requesterOid = authResult.claims.oid ?? "";
  const progress = getJobProgress(jobId, requesterOid);

  if (!progress) {
    throw new BackendBusinessError({
      name: "ArchiveJobNotFoundError",
      code: "notFound",
      category: "business",
      message: "Job not found, expired, or access denied.",
      statusCode: 404,
    });
  }

  res.send(200, progress);
};

/**
 * 读取归档任务清单。
 */
export const getDownloadArchiveManifestRequest = async (
  req: Request,
  res: Response,
) => {
  const authResult = await requireContainerManageRequest(req);
  const jobId = readNonEmptyString(req.params?.jobId);

  if (!jobId) {
    throw new BackendValidationError("jobId route parameter is required.");
  }

  const requesterOid = authResult.claims.oid ?? "";
  const progress = getJobProgress(jobId, requesterOid);

  if (!progress) {
    throw new BackendBusinessError({
      name: "ArchiveJobNotFoundError",
      code: "notFound",
      category: "business",
      message: "Job not found, expired, or access denied.",
      statusCode: 404,
    });
  }

  if (progress.status !== "ready") {
    throw new BackendBusinessError({
      name: "ArchiveManifestNotReadyError",
      code: "conflict",
      category: "business",
      message: `Archive manifest not ready yet. Status: ${progress.status}`,
      statusCode: 409,
    });
  }

  const manifest = getJobManifest(jobId, requesterOid);

  if (!manifest) {
    throw new BackendBusinessError({
      name: "ArchiveManifestNotFoundError",
      code: "notFound",
      category: "business",
      message: "Archive manifest not found.",
      statusCode: 404,
    });
  }

  res.send(200, manifest);
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
