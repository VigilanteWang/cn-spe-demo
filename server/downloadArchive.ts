/**
 * 提供“后端准备清单 + 前端流式归档”的下载任务能力。
 *
 * 这个模块只负责以下后端职责：
 * 1. 鉴权后的任务创建与所有权隔离。
 * 2. 递归展开文件/文件夹结构。
 * 3. 为每个文件解析可下载 URL，并返回前端可直接消费的清单。
 *
 * 真正的下载与 ZIP 压缩由前端完成，避免后端长时间占用 CPU 和内存。
 */

import { createGraphClient, getGraphToken } from "./auth";
import { v4 as uuidv4 } from "uuid";
import type { DriveItem } from "@microsoft/microsoft-graph-types";

// ─────────────────────────  常量区  ──────────────────────────────────────

const MAX_FILES = 500;
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB
const JOB_TTL_MS = 10 * 60 * 1000; // 10 分钟

// ─────────────────────────  类型定义  ───────────────────────────────────────

export type JobStatus = "queued" | "preparing" | "ready" | "failed";

/**
 * 前端可见的任务进度信息。
 */
export interface JobProgress {
  status: JobStatus;
  processedFiles: number;
  totalFiles: number;
  currentItem: string;
  preparedBytes: number;
  totalBytes: number;
  errors: string[];
}

/**
 * 单个文件的下载清单条目。
 */
export interface ArchiveManifestItem {
  itemId: string;
  name: string;
  relativePath: string;
  size: number;
  mimeType: string;
  downloadUrl: string;
}

/**
 * 提供给前端用于流式下载和归档的清单。
 */
export interface ArchiveManifest {
  jobId: string;
  archiveName: string;
  totalFiles: number;
  totalBytes: number;
  items: ArchiveManifestItem[];
}

/**
 * 内部任务对象。
 *
 * 除了对外暴露的进度字段外，还额外保存归档结果、创建时间、完成时间和所有者身份，
 * 以便后续下载、过期清理和权限校验。
 */
interface Job extends JobProgress {
  manifest?: ArchiveManifest;
  createdAt: number;
  /**
   * 任务进入终态（ready 或 failed）的时间戳。
   * 清理定时器使用此字段计算 TTL，确保用户在归档就绪后始终有完整的 10 分钟可用窗口。
   */
  completedAt?: number;
  /**
   * 启动本任务的用户的 Azure AD Object ID（来自 JWT oid claim）。
   * 用于确保只有任务创建者才能查询进度或读取下载清单。
   */
  ownerOid: string;
}

// ─────────────────────────  任务存储  ───────────────────────────────────────

const jobs = new Map<string, Job>();

/**
 * 定时清理过期任务，避免内存中的状态无限增长。
 */
setInterval(
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

// ─────────────────────────  辅助函数  ───────────────────────────────────────

interface FlatFile {
  itemId: string;
  name: string;
  relativePath: string;
  size: number;
  mimeType: string;
}

interface GraphDriveItemWithDownloadUrl extends DriveItem {
  "@microsoft.graph.downloadUrl"?: string;
}

/**
 * 递归展开单个 Drive Item。
 *
 * 如果当前项目是文件，就直接加入待打包列表；
 * 如果是文件夹，就继续递归展开其子项。
 *
 * @param graphClient 已认证的 Microsoft Graph 客户端。
 * @param driveId 当前容器对应的 Drive ID。
 * @param itemId 当前要展开的项目 ID。
 * @param basePath 当前项目在 ZIP 包中的父级路径。
 * @param result 扁平化后的文件输出数组。
 * @returns Promise<void>
 */
async function expandItem(
  graphClient: ReturnType<typeof createGraphClient>,
  driveId: string,
  itemId: string,
  basePath: string,
  result: FlatFile[],
): Promise<void> {
  const item = (await graphClient
    .api(`/drives/${driveId}/items/${itemId}`)
    .select("id,name,folder,file,size")
    .get()) as DriveItem;

  const itemName = item.name ?? "";
  if (item.folder) {
    await expandFolder(
      graphClient,
      driveId,
      itemId,
      basePath ? `${basePath}/${itemName}` : itemName,
      result,
    );
  } else {
    result.push({
      itemId,
      name: itemName,
      relativePath: basePath ? `${basePath}/${itemName}` : itemName,
      size: item.size ?? 0,
      mimeType: item.file?.mimeType ?? "application/octet-stream",
    });
  }
}

/**
 * 枚举文件夹下所有子项，并处理 Graph 分页结果。
 *
 * @param graphClient 已认证的 Microsoft Graph 客户端。
 * @param driveId 当前容器对应的 Drive ID。
 * @param folderId 要展开的文件夹 ID。
 * @param folderPath 当前文件夹在 ZIP 包中的路径。
 * @param result 扁平化后的文件输出数组。
 * @returns Promise<void>
 */
async function expandFolder(
  graphClient: ReturnType<typeof createGraphClient>,
  driveId: string,
  folderId: string,
  folderPath: string,
  result: FlatFile[],
): Promise<void> {
  let endpoint: string | null = `/drives/${driveId}/items/${folderId}/children`;

  while (endpoint) {
    const page: { value?: DriveItem[]; "@odata.nextLink"?: string } =
      await graphClient.api(endpoint).select("id,name,folder,file,size").get();
    const children: DriveItem[] = page.value ?? [];

    for (const child of children) {
      const childId = child.id ?? "";
      const childName = child.name ?? "";
      if (child.folder) {
        await expandFolder(
          graphClient,
          driveId,
          childId,
          `${folderPath}/${childName}`,
          result,
        );
      } else {
        result.push({
          itemId: childId,
          name: childName,
          relativePath: `${folderPath}/${childName}`,
          size: child.size ?? 0,
          mimeType: child.file?.mimeType ?? "application/octet-stream",
        });
      }
    }

    endpoint = page["@odata.nextLink"] ?? null;
  }
}

/**
 * 从 Graph 元数据中优先读取下载 URL，缺失时回退到 /content 重定向地址。
 *
 * @param graphClient 已认证的 Graph 客户端。
 * @param graphToken Graph 访问令牌。
 * @param driveId 当前容器的 Drive ID。
 * @param itemId 文件 ID。
 * @returns Promise<string> 可直接下载文件内容的 URL。
 */
async function resolveDownloadUrl(
  graphClient: ReturnType<typeof createGraphClient>,
  graphToken: string,
  driveId: string,
  itemId: string,
): Promise<string> {
  const item = (await graphClient
    .api(`/drives/${driveId}/items/${itemId}`)
    .get()) as GraphDriveItemWithDownloadUrl;

  if (item["@microsoft.graph.downloadUrl"]) {
    return item["@microsoft.graph.downloadUrl"];
  }

  // 兜底方案：使用 /content 端点的 302 Location 作为下载地址。
  const contentEndpoint = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`;
  const response = await fetch(contentEndpoint, {
    method: "GET",
    headers: { Authorization: `Bearer ${graphToken}` },
    redirect: "manual",
  });

  const location = response.headers.get("location");
  if (!location) {
    throw new Error(
      `Cannot resolve download url for item ${itemId}. HTTP ${response.status}`,
    );
  }

  return location;
}

// ─────────────────────────  对外 API  ───────────────────────────────────────

/**
 * 启动一个新的归档任务。
 *
 * 这个函数只负责创建任务记录并返回 jobId，真正耗时的目录展开和清单准备工作
 * 会在后台异步执行。
 *
 * @param containerId SharePoint Embedded 容器对应的 Drive ID。
 * @param itemIds 要归档的项目 ID 列表，可以包含文件和文件夹。
 * @param userToken 已验证通过的用户访问令牌，用于后续 OBO 流程。
 * @param ownerOid 发起请求的用户 Azure AD Object ID，用于后续鉴权。
 * @returns Promise<string> 新创建任务的 jobId。
 */
export async function startDownloadJob(
  containerId: string,
  itemIds: string[],
  userToken: string,
  ownerOid: string,
): Promise<string> {
  const jobId = uuidv4();

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
  jobs.set(jobId, job);

  /** 后台执行真正的归档工作，避免阻塞当前请求。 */
  processJob(jobId, containerId, itemIds, userToken).catch((err) => {
    const j = jobs.get(jobId);
    if (j) {
      j.status = "failed";
      j.completedAt = Date.now();
      j.errors.push(`Job failed: ${err.message}`);
    }
  });

  return jobId;
}

/**
 * 获取任务当前进度。
 *
 * @param jobId 任务 ID。
 * @param requesterOid 请求者的 Azure AD Object ID。提供时会校验任务归属，
 *   不匹配则返回 null（与任务不存在的响应相同，避免泄露任务存在信息）。
 * @returns JobProgress | null 当任务不存在、已过期或请求者无权访问时返回 null。
 */
export function getJobProgress(
  jobId: string,
  requesterOid?: string,
): JobProgress | null {
  const job = jobs.get(jobId);
  if (!job) return null;
  if (requesterOid !== undefined && job.ownerOid !== requesterOid) return null;
  const {
    manifest: _ignored,
    createdAt: _c,
    completedAt: _ca,
    ownerOid: _o,
    ...progress
  } = job;
  return progress;
}

/**
 * 读取已完成任务的下载清单。
 *
 * @param jobId 任务 ID。
 * @param requesterOid 请求者 oid，用于所有权校验。
 * @returns ArchiveManifest | null 当任务未就绪、无权限或已过期时返回 null。
 */
export function getJobManifest(
  jobId: string,
  requesterOid?: string,
): ArchiveManifest | null {
  const job = jobs.get(jobId);
  if (!job || job.status !== "ready" || !job.manifest) return null;
  if (requesterOid !== undefined && job.ownerOid !== requesterOid) return null;
  return job.manifest;
}

// ─────────────────────────  后台处理流程  ───────────────────────────────────

/**
 * 在后台执行真实的归档处理流程。
 *
 * 这是整个模块的核心函数，负责准备 Graph 客户端、展开目录结构、
 * 解析文件下载 URL、构建清单，并持续回写任务状态。
 *
 * @param jobId 当前任务 ID。
 * @param containerId 当前容器对应的 Drive ID。
 * @param itemIds 用户选择的项目 ID 列表。
 * @param userToken 已验证通过的用户访问令牌。
 * @returns Promise<void>
 */
async function processJob(
  jobId: string,
  containerId: string,
  itemIds: string[],
  userToken: string,
): Promise<void> {
  const job = jobs.get(jobId)!;

  job.status = "preparing";
  job.currentItem = "Initialising...";

  let graphToken: string;
  try {
    graphToken = await getGraphToken(userToken);
  } catch (err: any) {
    job.status = "failed";
    job.completedAt = Date.now();
    job.errors.push(`Graph token error: ${err.message}`);
    return;
  }

  const graphClient = createGraphClient(graphToken);

  // 先把文件夹递归展开为扁平文件列表，便于后续逐项解析下载地址。
  job.currentItem = "Expanding folder structure...";
  const flatFiles: FlatFile[] = [];

  for (const itemId of itemIds) {
    try {
      await expandItem(graphClient, containerId, itemId, "", flatFiles);
    } catch (err: any) {
      job.errors.push(`Failed to expand item ${itemId}: ${err.message}`);
    }
  }

  /** 对空结果和超量结果提前失败，避免继续浪费资源。 */
  if (flatFiles.length === 0) {
    job.status = "failed";
    job.completedAt = Date.now();
    job.errors.push("No files found to archive.");
    return;
  }
  if (flatFiles.length > MAX_FILES) {
    job.status = "failed";
    job.completedAt = Date.now();
    job.errors.push(
      `Too many files (${flatFiles.length}). Maximum is ${MAX_FILES}.`,
    );
    return;
  }

  job.totalFiles = flatFiles.length;
  let totalBytes = 0;
  let preparedBytes = 0;
  const manifestItems: ArchiveManifestItem[] = [];

  for (let i = 0; i < flatFiles.length; i++) {
    const flatFile = flatFiles[i];
    job.currentItem = flatFile.relativePath;
    job.processedFiles = i;

    totalBytes += flatFile.size;
    if (totalBytes > MAX_BYTES) {
      job.status = "failed";
      job.completedAt = Date.now();
      job.errors.push(
        `Archive would exceed the ${MAX_BYTES / 1024 / 1024} MB size limit.`,
      );
      return;
    }
  }

  job.totalBytes = totalBytes;

  for (let i = 0; i < flatFiles.length; i++) {
    const file = flatFiles[i];
    job.currentItem = file.relativePath;
    job.processedFiles = i;

    try {
      const downloadUrl = await resolveDownloadUrl(
        graphClient,
        graphToken,
        containerId,
        file.itemId,
      );

      manifestItems.push({
        itemId: file.itemId,
        name: file.name,
        relativePath: file.relativePath,
        size: file.size,
        mimeType: file.mimeType,
        downloadUrl,
      });

      preparedBytes += file.size;
      job.preparedBytes = preparedBytes;
      job.processedFiles = i + 1;
    } catch (err: any) {
      job.errors.push(`Error preparing ${file.relativePath}: ${err.message}`);
    }
  }

  if (manifestItems.length === 0) {
    job.status = "failed";
    job.completedAt = Date.now();
    job.errors.push("No downloadable files available.");
    return;
  }

  job.manifest = {
    jobId,
    archiveName: `SPE-${Date.now()}.zip`,
    totalFiles: manifestItems.length,
    totalBytes,
    items: manifestItems,
  };
  job.status = "ready";
  job.currentItem = "";
  job.completedAt = Date.now();
}
