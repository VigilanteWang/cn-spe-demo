import { v4 as uuidv4 } from "uuid";
import { createGraphClient, getGraphOBOToken } from "../auth";
import {
  createArchiveEmptyError,
  createArchiveJobNotFoundError,
  createArchiveManifestNotFoundError,
  createArchiveManifestNotReadyError,
  createArchiveTooLargeError,
  createArchiveTooManyFilesError,
  getDownloadJobFailureMessage,
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
import type {
  ArchiveManifest,
  ArchiveManifestItem,
  JobProgress,
} from "./downloadTypes";

const MAX_FILES = 500;
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

/**
 * 根据任务 ID 读取任务并校验访问权限。
 *
 * @param jobId 任务 ID。
 * @param requesterOid 请求者 oid。
 * @returns 允许访问的任务对象。
 */
const assertAccessibleJob = (jobId: string, requesterOid?: string) => {
  // 先从内存任务表里取出当前任务。
  const job = readJob(jobId);

  // 同时把“任务不存在”和“无权访问”都收口成同一个 not found 语义。
  if (!job || !canAccessJob(job, requesterOid)) {
    throw createArchiveJobNotFoundError();
  }

  return job;
};

/**
 * 启动一个新的归档准备任务。
 *
 * 这个函数只负责创建任务记录并返回 `jobId`，
 * 真正耗时的目录展开和下载清单准备会在后台异步执行。
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
  // 先做输入校验，避免后面在后台流程里才发现基础参数有问题。
  validateDownloadJobInput(containerId, itemIds, ownerOid);

  // 为这次下载准备流程生成一个全新的任务 ID。
  const jobId = uuidv4();

  // 先把任务以 queued 状态写入内存，前端才能马上开始轮询。
  const job = createQueuedJob(jobId, ownerOid);

  // 故意不 await，让接口先返回 jobId，后台再慢慢准备下载清单。
  void processJob(jobId, containerId, itemIds, userToken).catch(
    (error: unknown) => {
      // 如果后台准备失败，就把任务状态改成 failed，并保留首个关键错误文案。
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
  // 先校验任务存在且当前请求者有权访问，再裁剪成前端可见的进度结构。
  return toJobProgress(assertAccessibleJob(jobId, requesterOid));
}

/**
 * 读取已准备完成任务的下载清单。
 *
 * @param jobId 任务 ID。
 * @param requesterOid 请求者 oid。
 * @returns 准备完成后的下载清单。
 */
export function getJobManifest(
  jobId: string,
  requesterOid?: string,
): ArchiveManifest {
  // manifest 属于任务私有数据，所以这里也先走一次访问控制。
  const job = assertAccessibleJob(jobId, requesterOid);

  // 只有 ready 状态才允许前端真正开始读取下载清单。
  if (job.status !== "ready") {
    throw createArchiveManifestNotReadyError(job.status);
  }

  // 理论上 ready 任务应该带 manifest，这里仍保留一层防御式校验。
  if (!job.manifest) {
    throw createArchiveManifestNotFoundError();
  }

  return job.manifest;
}

/**
 * 在后台执行真实的归档准备流程。
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
  // 取回刚刚创建的任务对象，后续整个后台流程都会持续更新它的状态。
  const job = assertAccessibleJob(jobId);

  // 一进入后台准备阶段，就把状态切成 preparing。
  job.status = "preparing";

  // 给前端一个最初始的可见提示，表示任务已经开始工作。
  job.currentItem = "Initialising...";

  // 用换到的 Graph token 创建后续目录读取和文件解析要用的客户端。
  const graphToken = await getGraphOBOToken(userToken);
  const graphClient = createGraphClient(graphToken);

  // 接下来先把“文件 + 文件夹混合选择”展开成纯文件列表。
  job.currentItem = "Expanding folder structure...";
  const flatFiles = await flattenDriveItems(graphClient, containerId, itemIds);

  if (flatFiles.length === 0) {
    throw createArchiveEmptyError();
  }

  if (flatFiles.length > MAX_FILES) {
    throw createArchiveTooManyFilesError(flatFiles.length, MAX_FILES);
  }

  // 先把总文件数写进任务，方便前端尽早显示完整进度上限。
  job.totalFiles = flatFiles.length;

  let totalBytes = 0;
  for (let i = 0; i < flatFiles.length; i++) {
    const flatFile = flatFiles[i];

    // 在“预统计阶段”里，也把当前扫描到的文件路径暴露给前端。
    job.currentItem = flatFile.relativePath;

    // 这里的 processedFiles 表示“已经预检查过多少项”，让轮询界面能持续动起来。
    job.processedFiles = i;

    // 先顺序累计总大小，尽早在超限时失败，避免继续解析后续文件的下载地址。
    totalBytes += flatFile.size;
    if (totalBytes > MAX_BYTES) {
      throw createArchiveTooLargeError(MAX_BYTES);
    }
  }

  // 预统计完成后，把最终总字节数写回任务。
  job.totalBytes = totalBytes;

  // 接下来要进入真正的 manifest 生成阶段，所以把已处理数重新归零。
  job.processedFiles = 0;

  // 这里逐项收集前端真正需要的下载清单项。
  const manifestItems: ArchiveManifestItem[] = [];

  // 单独累计“已完成准备”的字节数，用于给前端展示更细粒度进度。
  let preparedBytes = 0;

  for (let i = 0; i < flatFiles.length; i++) {
    const file = flatFiles[i];

    // 告诉前端当前正在为哪个文件准备最终下载信息。
    job.currentItem = file.relativePath;

    // 这里的 processedFiles 表示“已经准备到第几个文件”。
    job.processedFiles = i;

    // 为当前文件解析可直接下载的 URL。
    const downloadUrl = await resolveDownloadUrl(
      graphClient,
      graphToken,
      containerId,
      file.itemId,
    );

    // manifest 只保留前端真正需要的字段，避免把 Graph 原始结构直接泄漏出去。
    manifestItems.push({
      itemId: file.itemId,
      name: file.name,
      relativePath: file.relativePath,
      size: file.size,
      mimeType: file.mimeType,
      downloadUrl,
    });

    // 每准备完一个文件，就把已准备字节数往前推进一点。
    preparedBytes += file.size;
    job.preparedBytes = preparedBytes;

    // 这里改成 i + 1，表示这个文件已经完整准备结束。
    job.processedFiles = i + 1;
  }

  // 到这里为止，前端下载 ZIP 所需的最小清单已经完整生成。
  job.manifest = {
    jobId,
    // 后端统一生成默认 ZIP 名称，前端仍可在保存阶段自行覆盖。
    archiveName: `SPE-${Date.now()}.zip`,
    totalFiles: manifestItems.length,
    totalBytes,
    items: manifestItems,
  };

  // manifest 准备好之后，任务正式进入 ready 状态。
  job.status = "ready";

  // 清空当前处理项，表示后台准备流程已经结束。
  job.currentItem = "";

  // 记录完成时间，后续任务清理器会用它来计算保留时长。
  job.completedAt = Date.now();
}
