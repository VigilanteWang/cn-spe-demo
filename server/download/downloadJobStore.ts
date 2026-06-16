import { AppError, serializeAppError } from "../../common/appError";
import type { Job, JobProgress } from "./downloadTypes";

const JOB_TTL_MS = 10 * 60 * 1000;

const jobs = new Map<string, Job>();

/**
 * 定时清理过期任务，避免内存中的任务状态无限增长。
 */
const cleanupTimer = setInterval(
  () => {
    const now = Date.now();

    for (const [id, job] of jobs) {
      // 已完成任务按 completedAt 计算保留时间，未完成任务则回退到 createdAt。
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
    error: undefined,
    createdAt: Date.now(),
    ownerOid,
  };

  // 任务一创建就立刻放入内存表，前端才能马上根据 jobId 查询状态。
  jobs.set(jobId, job);
  return job;
};

/**
 * 根据任务 ID 读取任务。
 *
 * @param jobId 任务 ID。
 * @returns 找到的任务；不存在时返回 `undefined`。
 */
export const readJob = (jobId: string): Job | undefined => jobs.get(jobId);

/**
 * 把内部任务对象裁剪成对外暴露的进度结构。
 *
 * @param job 内部完整任务对象。
 * @returns 前端可见的任务进度。
 */
export const toJobProgress = (job: Job): JobProgress => {
  // manifest、所有者、时间戳属于服务端内部字段，不对前端直接暴露。
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
 * @returns 是否允许访问。
 */
export const canAccessJob = (job: Job, requesterOid?: string): boolean =>
  requesterOid === undefined || job.ownerOid === requesterOid;

/**
 * 把任务标记为失败。
 *
 * @param job 当前任务。
 * @param error 要记录到任务中的标准化错误对象。
 */
export const markJobFailed = (job: Job, error: AppError): void => {
  job.status = "failed";
  job.currentItem = "";
  job.completedAt = Date.now();
  job.error = serializeAppError(error);
};
