"use strict";
/**
 * 提供基于后台任务的 ZIP 归档能力。
 *
 * 当用户一次选择很多文件或文件夹下载时，服务端不适合在单个 HTTP 请求中
 * 同步完成全部读取和压缩工作。这个模块通过“任务 + 轮询 + 一次性票据”的方式
 * 把耗时操作拆成多个更稳定的阶段。
 *
 * 整体流程如下：
 *
 * 1. 调用 startDownloadJob 创建后台任务并立即返回 jobId。
 * 2. 前端通过进度接口轮询任务状态。
 * 3. 任务完成后，调用方创建一次性下载票据。
 * 4. 浏览器再使用票据请求最终 ZIP 文件。
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.consumeDownloadTicket = exports.createDownloadTicket = exports.getJobBuffer = exports.getJobProgress = exports.startDownloadJob = void 0;
const archiver_1 = __importDefault(require("archiver"));
const stream_1 = require("stream");
const auth_1 = require("./auth");
const uuid_1 = require("uuid");
// ─────────────────────────  常量区  ──────────────────────────────────────
const MAX_FILES = 500;
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB
const JOB_TTL_MS = 10 * 60 * 1000; // 10 分钟
const DOWNLOAD_TICKET_TTL_MS = 60 * 1000; // 1 分钟
// ─────────────────────────  任务与票据存储  ─────────────────────────────────
const jobs = new Map();
const downloadTickets = new Map();
/**
 * 定时清理过期任务和票据，避免内存中的状态无限增长。
 */
setInterval(() => {
    const now = Date.now();
    for (const [id, job] of jobs) {
        if (now - job.completedAt > JOB_TTL_MS) {
            jobs.delete(id);
        }
    }
    for (const [ticket, record] of downloadTickets) {
        if (record.expiresAt <= now) {
            downloadTickets.delete(ticket);
        }
    }
}, 2 * 60 * 1000);
function touchJob(job) {
    job.completedAt = Date.now();
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
function expandItem(graphClient, driveId, itemId, basePath, result) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const item = (yield graphClient
            .api(`/drives/${driveId}/items/${itemId}`)
            .select("id,name,folder,file,size")
            .get());
        const itemName = (_a = item.name) !== null && _a !== void 0 ? _a : "";
        if (item.folder) {
            yield expandFolder(graphClient, driveId, itemId, basePath ? `${basePath}/${itemName}` : itemName, result);
        }
        else {
            result.push({
                itemId,
                zipPath: basePath ? `${basePath}/${itemName}` : itemName,
            });
        }
    });
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
function expandFolder(graphClient, driveId, folderId, folderPath, result) {
    var _a, _b, _d, _e;
    return __awaiter(this, void 0, void 0, function* () {
        let endpoint = `/drives/${driveId}/items/${folderId}/children`;
        while (endpoint) {
            const page = yield graphClient.api(endpoint).select("id,name,folder,file,size").get();
            const children = (_a = page.value) !== null && _a !== void 0 ? _a : [];
            for (const child of children) {
                const childId = (_b = child.id) !== null && _b !== void 0 ? _b : "";
                const childName = (_d = child.name) !== null && _d !== void 0 ? _d : "";
                if (child.folder) {
                    yield expandFolder(graphClient, driveId, childId, `${folderPath}/${childName}`, result);
                }
                else {
                    result.push({
                        itemId: childId,
                        zipPath: `${folderPath}/${childName}`,
                    });
                }
            }
            endpoint = (_e = page["@odata.nextLink"]) !== null && _e !== void 0 ? _e : null;
        }
    });
}
// ─────────────────────────  对外 API  ───────────────────────────────────────
/**
 * 启动一个新的归档任务。
 *
 * 这个函数只负责创建任务记录并返回 jobId，真正耗时的文件下载和压缩工作
 * 会在后台异步执行。
 *
 * @param containerId SharePoint Embedded 容器对应的 Drive ID。
 * @param itemIds 要归档的项目 ID 列表，可以包含文件和文件夹。
 * @param userToken 已验证通过的用户访问令牌，用于后续 OBO 流程。
 * @returns Promise<string> 新创建任务的 jobId。
 */
function startDownloadJob(containerId, itemIds, userToken, ownerOid, ownerUpn) {
    return __awaiter(this, void 0, void 0, function* () {
        const jobId = (0, uuid_1.v4)();
        const now = Date.now();
        const job = {
            status: "queued",
            processedFiles: 0,
            totalFiles: 0,
            currentItem: "",
            errors: [],
            createdAt: now,
            completedAt: now,
            ownerOid,
            ownerUpn,
        };
        jobs.set(jobId, job);
        /** 后台执行真正的归档工作，避免阻塞当前请求。 */
        processJob(jobId, containerId, itemIds, userToken).catch((err) => {
            const j = jobs.get(jobId);
            if (j) {
                j.status = "failed";
                j.errors.push(`Job failed: ${err.message}`);
                touchJob(j);
            }
        });
        return jobId;
    });
}
exports.startDownloadJob = startDownloadJob;
/**
 * 获取任务当前进度。
 *
 * @param jobId 任务 ID。
 * @returns JobProgress | null 当任务不存在或已过期时返回 null。
 */
function getJobProgress(jobId, ownerOid) {
    const job = jobs.get(jobId);
    if (!job)
        return null;
    if (ownerOid && job.ownerOid !== ownerOid)
        return null;
    const { zipBuffer: _ignored, createdAt: _c, completedAt: _done, ownerOid: _ownerOid, ownerUpn: _ownerUpn } = job, progress = __rest(job, ["zipBuffer", "createdAt", "completedAt", "ownerOid", "ownerUpn"]);
    return progress;
}
exports.getJobProgress = getJobProgress;
/**
 * 读取已完成任务的 ZIP 二进制内容。
 *
 * @param jobId 任务 ID。
 * @returns Buffer | null 只有当任务状态为 ready 时才返回 ZIP Buffer。
 */
function getJobBuffer(jobId, ownerOid) {
    const job = jobs.get(jobId);
    if (ownerOid && (job === null || job === void 0 ? void 0 : job.ownerOid) !== ownerOid)
        return null;
    if (!job || job.status !== "ready" || !job.zipBuffer)
        return null;
    return job.zipBuffer;
}
exports.getJobBuffer = getJobBuffer;
/**
 * 创建一个短时有效、单次消费的下载票据。
 *
 * @param jobId 已完成归档任务的 ID。
 * @param filename 下载时建议使用的文件名。
 * @returns string 新生成的票据字符串。
 */
function createDownloadTicket(jobId, filename, ownerOid, ownerUpn) {
    const ticket = (0, uuid_1.v4)();
    downloadTickets.set(ticket, {
        jobId,
        filename,
        expiresAt: Date.now() + DOWNLOAD_TICKET_TTL_MS,
        ownerOid,
        ownerUpn,
    });
    return ticket;
}
exports.createDownloadTicket = createDownloadTicket;
/**
 * 消费并作废下载票据。
 *
 * 票据一旦被读取就会立刻删除，确保它只能使用一次。
 *
 * @param ticket 下载票据。
 * @returns {{ jobId: string; filename: string } | null} 票据关联信息；无效或过期则返回 null。
 */
function consumeDownloadTicket(ticket, ownerOid) {
    const record = downloadTickets.get(ticket);
    if (!record)
        return { ok: false, reason: "not_found" };
    /** 先删除再校验，确保同一票据不会被重复利用。 */
    downloadTickets.delete(ticket);
    if (record.expiresAt <= Date.now()) {
        return { ok: false, reason: "expired" };
    }
    if (record.ownerOid !== ownerOid) {
        return { ok: false, reason: "forbidden" };
    }
    return { ok: true, jobId: record.jobId, filename: record.filename };
}
exports.consumeDownloadTicket = consumeDownloadTicket;
// ─────────────────────────  后台处理流程  ───────────────────────────────────
/**
 * 在后台执行真实的归档处理流程。
 *
 * 这是整个模块的核心函数，负责准备 Graph 客户端、展开目录结构、
 * 下载文件内容、构建 ZIP，并持续回写任务状态。
 *
 * @param jobId 当前任务 ID。
 * @param containerId 当前容器对应的 Drive ID。
 * @param itemIds 用户选择的项目 ID 列表。
 * @param userToken 已验证通过的用户访问令牌。
 * @returns Promise<void>
 */
function processJob(jobId, containerId, itemIds, userToken) {
    return __awaiter(this, void 0, void 0, function* () {
        const job = jobs.get(jobId);
        job.status = "preparing";
        job.currentItem = "Initialising…";
        touchJob(job);
        let graphToken;
        try {
            graphToken = yield (0, auth_1.getGraphToken)(userToken);
        }
        catch (err) {
            job.status = "failed";
            job.errors.push(`Graph token error: ${err.message}`);
            touchJob(job);
            return;
        }
        const graphClient = (0, auth_1.createGraphClient)(graphToken);
        /** 先把文件夹递归展开为扁平文件列表，方便后续统一压缩。 */
        job.currentItem = "Expanding folder structure…";
        touchJob(job);
        const flatFiles = [];
        for (const itemId of itemIds) {
            try {
                yield expandItem(graphClient, containerId, itemId, "", flatFiles);
            }
            catch (err) {
                job.errors.push(`Failed to expand item ${itemId}: ${err.message}`);
            }
        }
        /** 对空结果和超量结果提前失败，避免继续浪费资源。 */
        if (flatFiles.length === 0) {
            job.status = "failed";
            job.errors.push("No files found to archive.");
            touchJob(job);
            return;
        }
        if (flatFiles.length > MAX_FILES) {
            job.status = "failed";
            job.errors.push(`Too many files (${flatFiles.length}). Maximum is ${MAX_FILES}.`);
            touchJob(job);
            return;
        }
        job.totalFiles = flatFiles.length;
        /** 进入真正的 ZIP 构建阶段。 */
        job.status = "zipping";
        touchJob(job);
        const chunks = [];
        const passThrough = new stream_1.PassThrough();
        passThrough.on("data", (chunk) => chunks.push(chunk));
        const archive = (0, archiver_1.default)("zip", { zlib: { level: 6 } });
        archive.pipe(passThrough);
        let totalBytes = 0;
        for (let i = 0; i < flatFiles.length; i++) {
            const { itemId, zipPath } = flatFiles[i];
            job.currentItem = zipPath;
            job.processedFiles = i;
            touchJob(job);
            try {
                /**
                 * 通过 Graph 的 /content 端点拉取文件内容。
                 * 这种做法比依赖临时下载地址更稳定，也便于统一认证处理。
                 */
                const contentUrl = `https://graph.microsoft.com/v1.0/drives/${containerId}/items/${itemId}/content`;
                const fileResponse = yield fetch(contentUrl, {
                    headers: { Authorization: `Bearer ${graphToken}` },
                    redirect: "follow",
                });
                if (!fileResponse.ok) {
                    job.errors.push(`Failed to download ${zipPath}: HTTP ${fileResponse.status}`);
                    continue;
                }
                const arrayBuffer = yield fileResponse.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                /** 按已下载字节累计总量，防止归档结果过大。 */
                totalBytes += buffer.length;
                if (totalBytes > MAX_BYTES) {
                    job.status = "failed";
                    job.errors.push(`Archive would exceed the ${MAX_BYTES / 1024 / 1024} MB size limit.`);
                    touchJob(job);
                    archive.abort();
                    return;
                }
                archive.append(buffer, { name: zipPath });
                job.processedFiles = i + 1;
                touchJob(job);
            }
            catch (err) {
                job.errors.push(`Error adding ${zipPath}: ${err.message}`);
                touchJob(job);
            }
        }
        /** 等待 ZIP 流真正结束后再拼接 Buffer，避免拿到不完整数据。 */
        yield new Promise((resolve, reject) => {
            passThrough.on("finish", resolve);
            passThrough.on("error", reject);
            archive.on("error", reject);
            archive.finalize();
        });
        job.zipBuffer = Buffer.concat(chunks);
        job.status = "ready";
        job.currentItem = "";
        touchJob(job);
    });
}
//# sourceMappingURL=downloadArchive.js.map