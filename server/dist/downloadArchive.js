"use strict";
/**
 * 归档下载模块
 *
 * 提供基于任务的异步 ZIP 下载机制：
 * 1. 调用方通过 startDownloadJob() 启动任务
 * 2. 调用方通过 getJobProgress() 轮询进度
 * 3. 任务 ready 后，可通过票据端点下载归档（底层数据由 getJobBuffer() 读取）
 *
 * 架构说明：
 * - 任务保存在内存 Map 中，按 TTL 定时清理
 * - Graph API 使用请求携带的用户令牌，经 OBO 流程换取 Graph Token
 * - 文件夹会递归展开，并处理 @odata.nextLink 分页
 * - 文件写入 archiver ZIP 流，归档完成后缓存在内存中
 * - 每个任务最多 500 个文件或 500 MB
 *
 * 使用到的 Graph 端点：
 *   GET /drives/{driveId}/items/{itemId}          - 查询项目元数据
 *   GET /drives/{driveId}/items/{itemId}/children - 列出文件夹子项
 *   GET /drives/{driveId}/items/{itemId}/content  - 下载文件内容流
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
// 定时清理过期任务与过期票据（每 2 分钟执行一次）
setInterval(() => {
    const now = Date.now();
    for (const [id, job] of jobs) {
        if (now - job.createdAt > JOB_TTL_MS) {
            jobs.delete(id);
        }
    }
    for (const [ticket, record] of downloadTickets) {
        if (record.expiresAt <= now) {
            downloadTickets.delete(ticket);
        }
    }
}, 2 * 60 * 1000);
/**
 * 递归展开单个 drive item。
 * - 如果是文件，直接写入 result。
 * - 如果是文件夹，读取其子项（含分页）并继续递归。
 */
function expandItem(graphClient, driveId, itemId, basePath, result) {
    return __awaiter(this, void 0, void 0, function* () {
        // 先查询项目元数据，判断是文件还是文件夹
        const item = yield graphClient
            .api(`/drives/${driveId}/items/${itemId}`)
            .select("id,name,folder,file,size")
            .get();
        if (item.folder) {
            // 文件夹：继续展开其子项
            yield expandFolder(graphClient, driveId, itemId, basePath ? `${basePath}/${item.name}` : item.name, result);
        }
        else {
            // 文件：直接加入待打包列表
            result.push({
                itemId,
                zipPath: basePath ? `${basePath}/${item.name}` : item.name,
            });
        }
    });
}
/**
 * 枚举文件夹下所有子项（处理 @odata.nextLink 分页）。
 */
function expandFolder(graphClient, driveId, folderId, folderPath, result) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        let endpoint = `/drives/${driveId}/items/${folderId}/children`;
        while (endpoint) {
            const page = yield graphClient.api(endpoint).select("id,name,folder,file,size").get(); // eslint-disable-line
            const children = (_a = page.value) !== null && _a !== void 0 ? _a : [];
            for (const child of children) {
                if (child.folder) {
                    yield expandFolder(graphClient, driveId, child.id, `${folderPath}/${child.name}`, result);
                }
                else {
                    result.push({
                        itemId: child.id,
                        zipPath: `${folderPath}/${child.name}`,
                    });
                }
            }
            // 如果存在下一页链接，继续拉取
            endpoint = (_b = page["@odata.nextLink"]) !== null && _b !== void 0 ? _b : null;
        }
    });
}
// ─────────────────────────  对外 API  ───────────────────────────────────────
/**
 * 启动新的归档下载任务。
 *
 * @param containerId SPE 容器（Drive）ID
 * @param itemIds 要归档的项目 ID 列表（文件或文件夹）
 * @param userToken 已验证通过的用户访问令牌（用于 OBO 换取 Graph Token）
 * @returns 任务 ID
 */
function startDownloadJob(containerId, itemIds, userToken) {
    return __awaiter(this, void 0, void 0, function* () {
        const jobId = (0, uuid_1.v4)();
        const job = {
            status: "queued",
            processedFiles: 0,
            totalFiles: 0,
            currentItem: "",
            errors: [],
            createdAt: Date.now(),
        };
        jobs.set(jobId, job);
        // 异步后台执行，保证 HTTP 请求可以立即返回 jobId
        processJob(jobId, containerId, itemIds, userToken).catch((err) => {
            const j = jobs.get(jobId);
            if (j) {
                j.status = "failed";
                j.errors.push(`Job failed: ${err.message}`);
            }
        });
        return jobId;
    });
}
exports.startDownloadJob = startDownloadJob;
/**
 * 获取任务当前进度。
 * 如果 jobId 不存在或已过期，返回 null。
 */
function getJobProgress(jobId) {
    const job = jobs.get(jobId);
    if (!job)
        return null;
    const { zipBuffer: _ignored, createdAt: _c } = job, progress = __rest(job, ["zipBuffer", "createdAt"]);
    return progress;
}
exports.getJobProgress = getJobProgress;
/**
 * 读取 ready 任务的 ZIP Buffer。
 * 任务不存在、未 ready 或已过期时返回 null。
 */
function getJobBuffer(jobId) {
    const job = jobs.get(jobId);
    if (!job || job.status !== "ready" || !job.zipBuffer)
        return null;
    return job.zipBuffer;
}
exports.getJobBuffer = getJobBuffer;
/**
 * 创建短时有效、单次消费的下载票据（给浏览器原生下载器使用）。
 */
function createDownloadTicket(jobId, filename) {
    const ticket = (0, uuid_1.v4)();
    downloadTickets.set(ticket, {
        jobId,
        filename,
        expiresAt: Date.now() + DOWNLOAD_TICKET_TTL_MS,
    });
    return ticket;
}
exports.createDownloadTicket = createDownloadTicket;
/**
 * 消费并作废票据。
 * 票据无效或过期时返回 null。
 */
function consumeDownloadTicket(ticket) {
    const record = downloadTickets.get(ticket);
    if (!record)
        return null;
    // 先删除再校验有效期，确保票据永远只能被消费一次
    downloadTickets.delete(ticket);
    if (record.expiresAt <= Date.now()) {
        return null;
    }
    return { jobId: record.jobId, filename: record.filename };
}
exports.consumeDownloadTicket = consumeDownloadTicket;
// ─────────────────────────  后台处理流程  ───────────────────────────────────
function processJob(jobId, containerId, itemIds, userToken) {
    return __awaiter(this, void 0, void 0, function* () {
        const job = jobs.get(jobId);
        // ── 1. 准备 Graph 客户端 ────────────────────────────────────────────────
        job.status = "preparing";
        job.currentItem = "Initialising…";
        let graphToken;
        try {
            graphToken = yield (0, auth_1.getGraphToken)(userToken);
        }
        catch (err) {
            job.status = "failed";
            job.errors.push(`Graph token error: ${err.message}`);
            return;
        }
        const graphClient = (0, auth_1.createGraphClient)(graphToken);
        // ── 2. 将所选项展开为扁平文件列表 ───────────────────────────────────────
        job.currentItem = "Expanding folder structure…";
        const flatFiles = [];
        for (const itemId of itemIds) {
            try {
                yield expandItem(graphClient, containerId, itemId, "", flatFiles);
            }
            catch (err) {
                job.errors.push(`Failed to expand item ${itemId}: ${err.message}`);
            }
        }
        // 容量防护：空任务/文件数超限直接失败
        if (flatFiles.length === 0) {
            job.status = "failed";
            job.errors.push("No files found to archive.");
            return;
        }
        if (flatFiles.length > MAX_FILES) {
            job.status = "failed";
            job.errors.push(`Too many files (${flatFiles.length}). Maximum is ${MAX_FILES}.`);
            return;
        }
        job.totalFiles = flatFiles.length;
        // ── 3. 构建 ZIP ──────────────────────────────────────────────────────────
        job.status = "zipping";
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
            try {
                // 通过 Graph /content 端点下载文件内容。
                // 在 SPE 容器场景下，@microsoft.graph.downloadUrl 可靠性较差；
                // 使用携带 Bearer Token 的 /content 能稳定覆盖不同 Drive 类型，
                // 并自动跟随重定向到真实存储地址。
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
                // 按“真实已下载字节数”做总大小限制，避免打包过程失控
                totalBytes += buffer.length;
                if (totalBytes > MAX_BYTES) {
                    job.status = "failed";
                    job.errors.push(`Archive would exceed the ${MAX_BYTES / 1024 / 1024} MB size limit.`);
                    archive.abort();
                    return;
                }
                archive.append(buffer, { name: zipPath });
                job.processedFiles = i + 1;
            }
            catch (err) {
                job.errors.push(`Error adding ${zipPath}: ${err.message}`);
            }
        }
        // 归档收尾：等待流真正结束后再拼接 Buffer，避免拿到不完整数据
        yield new Promise((resolve, reject) => {
            passThrough.on("finish", resolve);
            passThrough.on("error", reject);
            archive.on("error", reject);
            archive.finalize();
        });
        job.zipBuffer = Buffer.concat(chunks);
        job.status = "ready";
        job.currentItem = "";
    });
}
//# sourceMappingURL=downloadArchive.js.map