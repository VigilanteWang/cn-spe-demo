import type { Job, JobProgress } from "./downloadTypes";

const JOB_TTL_MS = 10 * 60 * 1000;

const jobs = new Map<string, Job>();

/**
 * 定时清理过期任务，避免内存中的状态无限增长。
 */
const cleanupTimer = setInterval(
  () => {
    const now = Date.now();

    for (const [id, job] of jobs) {
      if (now - (job.completedAt ?? job.createdAt) > JOB_TTL_MS) {
        jobs.delete(id);
      }
    }
  },
  2 * 60 * 1000,
);

// 这个定时器只负责后台清理内存缓存，不是业务主流程；调用 unref 后，
// 即使它还在等待下一次执行，也不会因为它而把整个 Node 进程留住。
// 这样服务在没有其他活动句柄时可以正常退出，不会被这个辅助任务拖住。
cleanupTimer.unref?.();

/**
 * 创建并保存一个新的排队中任务。
 *
 * @param jobId 新任务 ID。
 * @param ownerOid 任务所有者 oid。
 * @returns 初始化后的任务对象。
 */
export const createQueuedJob = (jobId: string, ownerOid: string): Job => {
  const job: Job = {
    status: "queued",
    processedFiles: 0,
    totalFiles: 0,
    currentItem: "",
    preparedBytes: 0,
    totalBytes: 0,
    errors: [],
    createdAt: Date.now(),
    ownerOid,
  };

  // 任务一创建就立刻放入内存表，后续轮询才能根据 jobId 立即查到状态。
  jobs.set(jobId, job);
  return job;
};

/**
 * 根据任务 ID 读取任务。
 *
 * @param jobId 任务 ID。
 * @returns 找到的任务对象；不存在时返回 undefined。
 */
export const readJob = (jobId: string): Job | undefined => jobs.get(jobId);

/**
 * 读取对外可见的任务进度。
 *
 * @param job 内部完整任务对象。
 * @returns 去掉内部字段后的公开进度对象。
 */
export const toJobProgress = (job: Job): JobProgress => {
  const {
    manifest: _manifest,
    createdAt: _createdAt,
    completedAt: _completedAt,
    ownerOid: _ownerOid,
    ...progress
  } = job;

  return progress;
};

/**
 * 判断请求者是否能访问当前任务。
 *
 * @param job 当前任务。
 * @param requesterOid 请求者 oid。
 * @returns 是否允许访问该任务。
 */
export const canAccessJob = (job: Job, requesterOid?: string): boolean =>
  requesterOid === undefined || job.ownerOid === requesterOid;

/**
 * 把任务标记为失败。
 *
 * @param job 当前任务。
 * @param message 要记录到任务中的错误文案。
 */
export const markJobFailed = (job: Job, message: string): void => {
  job.status = "failed";
  job.currentItem = "";
  job.completedAt = Date.now();

  // 严格失败模式下只保留首个致命错误，避免后续兜底覆盖更有价值的原始原因。
  if (job.errors.length === 0) {
    job.errors.push(message);
  }
};

/**
 * 清空测试中的任务状态，避免跨用例污染。
 */
export const resetDownloadJobsForTest = (): void => {
  jobs.clear();
};
