/**
 * Archive Download Module
 *
 * Provides a job-based async ZIP download mechanism:
 * 1. Caller starts a job via startDownloadJob()
 * 2. Caller polls job progress via getJobProgress()
 * 3. When status === "ready", caller fetches the ZIP buffer via getJobBuffer()
 *
 * Architecture:
 * - Jobs are held in memory (Map) with a 10-minute TTL cleanup
 * - Graph API is called via OBO token passed from the request handler
 * - Folder items are recursively expanded (pagination-aware)
 * - Files are piped into an archiver ZIP stream; the full buffer is stored on completion
 * - Max 500 files or 500 MB per job (configurable constants below)
 *
 * Graph endpoints used:
 *   GET /drives/{driveId}/items/{itemId}              – fetch item metadata
 *   GET /drives/{driveId}/items/{itemId}/children     – list folder children
 *   GET /drives/{driveId}/items/{itemId}/content      – download file stream
 */

import archiver from "archiver";
import { PassThrough } from "stream";
import { createGraphClient, getGraphToken } from "./auth";
import { v4 as uuidv4 } from "uuid";

// ─────────────────────────  constants  ──────────────────────────────────────

const MAX_FILES = 500;
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB
const JOB_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ─────────────────────────  types  ──────────────────────────────────────────

export type JobStatus = "queued" | "preparing" | "zipping" | "ready" | "failed";

export interface JobProgress {
  status: JobStatus;
  processedFiles: number;
  totalFiles: number;
  currentItem: string;
  errors: string[];
}

interface Job extends JobProgress {
  zipBuffer?: Buffer;
  createdAt: number;
}

// ─────────────────────────  job store  ──────────────────────────────────────

const jobs = new Map<string, Job>();

// Periodic TTL cleanup – every 2 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [id, job] of jobs) {
      if (now - job.createdAt > JOB_TTL_MS) {
        jobs.delete(id);
      }
    }
  },
  2 * 60 * 1000,
);

// ─────────────────────────  helpers  ────────────────────────────────────────

interface FlatFile {
  itemId: string;
  zipPath: string; // relative path inside the ZIP archive
}

/**
 * Recursively expand a single drive item.
 * - If it is a file, push to `result` directly.
 * - If it is a folder, fetch its children (with pagination) and recurse.
 */
async function expandItem(
  graphClient: ReturnType<typeof createGraphClient>,
  driveId: string,
  itemId: string,
  basePath: string,
  result: FlatFile[],
): Promise<void> {
  // Fetch the item's metadata first
  const item = await graphClient
    .api(`/drives/${driveId}/items/${itemId}`)
    .select("id,name,folder,file,size")
    .get();

  if (item.folder) {
    // It is a folder – expand all children
    await expandFolder(
      graphClient,
      driveId,
      itemId,
      basePath ? `${basePath}/${item.name}` : item.name,
      result,
    );
  } else {
    // It is a file
    result.push({
      itemId,
      zipPath: basePath ? `${basePath}/${item.name}` : item.name,
    });
  }
}

/**
 * Enumerate all children of a folder (handles @odata.nextLink pagination).
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
    const page: { value?: any[]; "@odata.nextLink"?: string } =
      await graphClient.api(endpoint).select("id,name,folder,file,size").get(); // eslint-disable-line
    const children: any[] = page.value ?? [];

    for (const child of children) {
      if (child.folder) {
        await expandFolder(
          graphClient,
          driveId,
          child.id,
          `${folderPath}/${child.name}`,
          result,
        );
      } else {
        result.push({
          itemId: child.id,
          zipPath: `${folderPath}/${child.name}`,
        });
      }
    }

    // Follow next page link if present
    endpoint = page["@odata.nextLink"] ?? null;
  }
}

// ─────────────────────────  public API  ─────────────────────────────────────

/**
 * Start a new archive download job.
 *
 * @param containerId  The SPE container / drive ID
 * @param itemIds      Array of item IDs (files or folders) to include
 * @param userToken    The validated user access token (used for OBO Graph token)
 * @returns            jobId string
 */
export async function startDownloadJob(
  containerId: string,
  itemIds: string[],
  userToken: string,
): Promise<string> {
  const jobId = uuidv4();

  const job: Job = {
    status: "queued",
    processedFiles: 0,
    totalFiles: 0,
    currentItem: "",
    errors: [],
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);

  // Run asynchronously so the HTTP response returns the jobId immediately
  processJob(jobId, containerId, itemIds, userToken).catch((err) => {
    const j = jobs.get(jobId);
    if (j) {
      j.status = "failed";
      j.errors.push(`Job failed: ${err.message}`);
    }
  });

  return jobId;
}

/**
 * Get current progress of a job.
 * Returns null if the jobId is unknown or expired.
 */
export function getJobProgress(jobId: string): JobProgress | null {
  const job = jobs.get(jobId);
  if (!job) return null;
  const { zipBuffer: _ignored, createdAt: _c, ...progress } = job;
  return progress;
}

/**
 * Retrieve the completed ZIP buffer for a ready job.
 * Returns null if job is not found, not ready, or already expired.
 */
export function getJobBuffer(jobId: string): Buffer | null {
  const job = jobs.get(jobId);
  if (!job || job.status !== "ready" || !job.zipBuffer) return null;
  return job.zipBuffer;
}

// ─────────────────────────  background processing  ──────────────────────────

async function processJob(
  jobId: string,
  containerId: string,
  itemIds: string[],
  userToken: string,
): Promise<void> {
  const job = jobs.get(jobId)!;

  // ── 1. Prepare Graph client ──────────────────────────────────────────────
  job.status = "preparing";
  job.currentItem = "Initialising…";

  let graphToken: string;
  try {
    graphToken = await getGraphToken(userToken);
  } catch (err: any) {
    job.status = "failed";
    job.errors.push(`Graph token error: ${err.message}`);
    return;
  }

  const graphClient = createGraphClient(graphToken);

  // ── 2. Expand all selected items into a flat file list ───────────────────
  job.currentItem = "Expanding folder structure…";
  const flatFiles: FlatFile[] = [];

  for (const itemId of itemIds) {
    try {
      await expandItem(graphClient, containerId, itemId, "", flatFiles);
    } catch (err: any) {
      job.errors.push(`Failed to expand item ${itemId}: ${err.message}`);
    }
  }

  // Guard: size limits
  if (flatFiles.length === 0) {
    job.status = "failed";
    job.errors.push("No files found to archive.");
    return;
  }
  if (flatFiles.length > MAX_FILES) {
    job.status = "failed";
    job.errors.push(
      `Too many files (${flatFiles.length}). Maximum is ${MAX_FILES}.`,
    );
    return;
  }

  job.totalFiles = flatFiles.length;

  // ── 3. Build ZIP ──────────────────────────────────────────────────────────
  job.status = "zipping";

  const chunks: Buffer[] = [];
  const passThrough = new PassThrough();
  passThrough.on("data", (chunk: Buffer) => chunks.push(chunk));

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.pipe(passThrough);

  let totalBytes = 0;

  for (let i = 0; i < flatFiles.length; i++) {
    const { itemId, zipPath } = flatFiles[i];
    job.currentItem = zipPath;
    job.processedFiles = i;

    try {
      // Download file content via the Graph API content endpoint.
      // Using @microsoft.graph.downloadUrl is not reliable for SPE container
      // drives; the /content endpoint with a valid Bearer token works for all
      // drive types and follows the redirect to the actual storage URL.
      const contentUrl = `https://graph.microsoft.com/v1.0/drives/${containerId}/items/${itemId}/content`;
      const fileResponse = await fetch(contentUrl, {
        headers: { Authorization: `Bearer ${graphToken}` },
        redirect: "follow",
      });
      if (!fileResponse.ok) {
        job.errors.push(
          `Failed to download ${zipPath}: HTTP ${fileResponse.status}`,
        );
        continue;
      }

      const arrayBuffer = await fileResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Guard total archive size (checked against actual downloaded bytes)
      totalBytes += buffer.length;
      if (totalBytes > MAX_BYTES) {
        job.status = "failed";
        job.errors.push(
          `Archive would exceed the ${MAX_BYTES / 1024 / 1024} MB size limit.`,
        );
        archive.abort();
        return;
      }

      archive.append(buffer, { name: zipPath });
      job.processedFiles = i + 1;
    } catch (err: any) {
      job.errors.push(`Error adding ${zipPath}: ${err.message}`);
    }
  }

  // Finalise the archive
  await new Promise<void>((resolve, reject) => {
    passThrough.on("finish", resolve);
    passThrough.on("error", reject);
    archive.on("error", reject);
    archive.finalize();
  });

  job.zipBuffer = Buffer.concat(chunks);
  job.status = "ready";
  job.currentItem = "";
}
