import { v4 as uuidv4 } from "uuid";
import { createGraphClient, getGraphToken } from "../auth";
import {
  createArchiveEmptyError,
  createArchiveJobNotFoundError,
  createArchiveManifestNotFoundError,
  createArchiveManifestNotReadyError,
  createArchiveTooLargeError,
  createArchiveTooManyFilesError,
  getDownloadJobFailureMessage,
  toDownloadUpstreamError,
  validateDownloadJobInput,
} from "./downloadErrors";
import {
  canAccessJob,
  createQueuedJob,
  markJobFailed,
  readJob,
  toJobProgress,
} from "./downloadJobStore";
import { flattenDriveItems, resolveDownloadUrl } from "./downloadGraph";
import type { ArchiveManifest, ArchiveManifestItem, JobProgress } from "./downloadTypes";

const MAX_FILES = 500;
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

/**
 * 按任务 ID 读取任务并校验访问权限。
 *
 * @param jobId 任务 ID。
 * @param requesterOid 请求者 oid。
 * @returns 可访问的任务对象。
 */
const assertAccessibleJob = (jobId: string, requesterOid?: string) => {
  const job = readJob(jobId);

  if (!job || !canAccessJob(job, requesterOid)) {
    throw createArchiveJobNotFoundError();
  }

  return job;
};

/**
 * 启动一个新的归档任务。
 *
 * 这个函数只负责创建任务记录并返回 jobId，真正耗时的目录展开和清单准备工作
 * 会在后台异步执行。
 *
 * @param containerId 当前容器对应的 Drive ID。
 * @param itemIds 用户选择的项目 ID 列表。
 * @param userToken 当前登录用户的 API Token。
 * @param ownerOid 当前登录用户 oid。
 * @returns 新创建的任务 ID。
 */
export async function startDownloadJob(
  containerId: string,
  itemIds: string[],
  userToken: string,
  ownerOid: string,
): Promise<string> {
  validateDownloadJobInput(containerId, itemIds, ownerOid);

  const jobId = uuidv4();
  const job = createQueuedJob(jobId, ownerOid);

  // 后台流程故意不 await，让接口可以尽快把 jobId 返回给前端开始轮询。
  void processJob(jobId, containerId, itemIds, userToken).catch(
    (error: unknown) => {
      markJobFailed(
        job,
        getDownloadJobFailureMessage(error, "Unable to prepare the archive."),
      );
    },
  );

  return jobId;
}

/**
 * 获取任务当前进度。
 *
 * @param jobId 任务 ID。
 * @param requesterOid 请求者 oid。
 * @returns 对外可见的任务进度对象。
 */
export function getJobProgress(
  jobId: string,
  requesterOid?: string,
): JobProgress {
  return toJobProgress(assertAccessibleJob(jobId, requesterOid));
}

/**
 * 读取已完成任务的下载清单。
 *
 * @param jobId 任务 ID。
 * @param requesterOid 请求者 oid。
 * @returns 准备完成后的下载清单。
 */
export function getJobManifest(
  jobId: string,
  requesterOid?: string,
): ArchiveManifest {
  const job = assertAccessibleJob(jobId, requesterOid);

  if (job.status !== "ready") {
    throw createArchiveManifestNotReadyError(job.status);
  }

  if (!job.manifest) {
    throw createArchiveManifestNotFoundError();
  }

  return job.manifest;
}

/**
 * 在后台执行真实的归档处理流程。
 *
 * @param jobId 当前任务 ID。
 * @param containerId 当前容器对应的 Drive ID。
 * @param itemIds 用户选择的项目 ID 列表。
 * @param userToken 当前登录用户的 API Token。
 */
async function processJob(
  jobId: string,
  containerId: string,
  itemIds: string[],
  userToken: string,
): Promise<void> {
  const job = assertAccessibleJob(jobId);
  job.status = "preparing";
  job.currentItem = "Initialising...";

  let graphToken: string;
  try {
    graphToken = await getGraphToken(userToken);
  } catch (error: unknown) {
    throw toDownloadUpstreamError(error, "Unable to prepare the archive.");
  }

  const graphClient = createGraphClient(graphToken);

  // 先把文件夹递归展开为扁平文件列表，便于后续逐项解析下载地址。
  job.currentItem = "Expanding folder structure...";
  const flatFiles = await flattenDriveItems(graphClient, containerId, itemIds);

  if (flatFiles.length === 0) {
    throw createArchiveEmptyError();
  }

  if (flatFiles.length > MAX_FILES) {
    throw createArchiveTooManyFilesError(flatFiles.length, MAX_FILES);
  }

  job.totalFiles = flatFiles.length;

  let totalBytes = 0;
  for (let i = 0; i < flatFiles.length; i++) {
    const flatFile = flatFiles[i];
    job.currentItem = flatFile.relativePath;
    job.processedFiles = i;

    // 先顺序累计总大小，超过上限时直接失败，避免继续解析后续下载地址浪费请求。
    totalBytes += flatFile.size;
    if (totalBytes > MAX_BYTES) {
      throw createArchiveTooLargeError(MAX_BYTES);
    }
  }

  job.totalBytes = totalBytes;
  job.processedFiles = 0;

  const manifestItems: ArchiveManifestItem[] = [];
  let preparedBytes = 0;

  for (let i = 0; i < flatFiles.length; i++) {
    const file = flatFiles[i];
    job.currentItem = file.relativePath;
    job.processedFiles = i;

    const downloadUrl = await resolveDownloadUrl(
      graphClient,
      graphToken,
      containerId,
      file.itemId,
    );

    // manifest 只保存前端真正需要的最小字段，避免把 Graph 原始响应直接泄漏到调用方。
    manifestItems.push({
      itemId: file.itemId,
      name: file.name,
      relativePath: file.relativePath,
      size: file.size,
      mimeType: file.mimeType,
      downloadUrl,
    });

    // 每完成一个文件就立刻推进进度，前端轮询时能看到更细粒度的准备状态。
    preparedBytes += file.size;
    job.preparedBytes = preparedBytes;
    job.processedFiles = i + 1;
  }

  job.manifest = {
    jobId,
    // ZIP 文件名在这里统一生成，前端仍可在保存对话框中覆盖最终输出名称。
    archiveName: `SPE-${Date.now()}.zip`,
    totalFiles: manifestItems.length,
    totalBytes,
    items: manifestItems,
  };
  job.status = "ready";
  job.currentItem = "";
  job.completedAt = Date.now();
}
