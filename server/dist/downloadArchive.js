"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJobManifest = exports.getJobProgress = exports.startDownloadJob = void 0;
const auth_1 = require("./auth");
const uuid_1 = require("uuid");
// ─────────────────────────  常量区  ──────────────────────────────────────
const MAX_FILES = 500;
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB
const JOB_TTL_MS = 10 * 60 * 1000; // 10 分钟
// ─────────────────────────  任务存储  ───────────────────────────────────────
const jobs = new Map();
/**
 * 定时清理过期任务，避免内存中的状态无限增长。
 */
setInterval(() => {
    var _a;
    const now = Date.now();
    for (const [id, job] of jobs) {
        if (now - ((_a = job.completedAt) !== null && _a !== void 0 ? _a : job.createdAt) > JOB_TTL_MS) {
            jobs.delete(id);
        }
    }
}, 2 * 60 * 1000);
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
    var _a, _b, _d, _e;
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
                name: itemName,
                relativePath: basePath ? `${basePath}/${itemName}` : itemName,
                size: (_b = item.size) !== null && _b !== void 0 ? _b : 0,
                mimeType: (_e = (_d = item.file) === null || _d === void 0 ? void 0 : _d.mimeType) !== null && _e !== void 0 ? _e : "application/octet-stream",
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
    var _a, _b, _d, _e, _f, _g, _h;
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
                        name: childName,
                        relativePath: `${folderPath}/${childName}`,
                        size: (_e = child.size) !== null && _e !== void 0 ? _e : 0,
                        mimeType: (_g = (_f = child.file) === null || _f === void 0 ? void 0 : _f.mimeType) !== null && _g !== void 0 ? _g : "application/octet-stream",
                    });
                }
            }
            endpoint = (_h = page["@odata.nextLink"]) !== null && _h !== void 0 ? _h : null;
        }
    });
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
function resolveDownloadUrl(graphClient, graphToken, driveId, itemId) {
    return __awaiter(this, void 0, void 0, function* () {
        const item = (yield graphClient
            .api(`/drives/${driveId}/items/${itemId}`)
            .get());
        if (item["@microsoft.graph.downloadUrl"]) {
            return item["@microsoft.graph.downloadUrl"];
        }
        // 兜底方案：使用 /content 端点的 302 Location 作为下载地址。
        const contentEndpoint = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`;
        const response = yield fetch(contentEndpoint, {
            method: "GET",
            headers: { Authorization: `Bearer ${graphToken}` },
            redirect: "manual",
        });
        const location = response.headers.get("location");
        if (!location) {
            throw new Error(`Cannot resolve download url for item ${itemId}. HTTP ${response.status}`);
        }
        return location;
    });
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
function startDownloadJob(containerId, itemIds, userToken, ownerOid) {
    return __awaiter(this, void 0, void 0, function* () {
        const jobId = (0, uuid_1.v4)();
        const job = {
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
    });
}
exports.startDownloadJob = startDownloadJob;
/**
 * 获取任务当前进度。
 *
 * @param jobId 任务 ID。
 * @param requesterOid 请求者的 Azure AD Object ID。提供时会校验任务归属，
 *   不匹配则返回 null（与任务不存在的响应相同，避免泄露任务存在信息）。
 * @returns JobProgress | null 当任务不存在、已过期或请求者无权访问时返回 null。
 */
function getJobProgress(jobId, requesterOid) {
    const job = jobs.get(jobId);
    if (!job)
        return null;
    if (requesterOid !== undefined && job.ownerOid !== requesterOid)
        return null;
    const { manifest: _ignored, createdAt: _c, completedAt: _ca, ownerOid: _o } = job, progress = __rest(job, ["manifest", "createdAt", "completedAt", "ownerOid"]);
    return progress;
}
exports.getJobProgress = getJobProgress;
/**
 * 读取已完成任务的下载清单。
 *
 * @param jobId 任务 ID。
 * @param requesterOid 请求者 oid，用于所有权校验。
 * @returns ArchiveManifest | null 当任务未就绪、无权限或已过期时返回 null。
 */
function getJobManifest(jobId, requesterOid) {
    const job = jobs.get(jobId);
    if (!job || job.status !== "ready" || !job.manifest)
        return null;
    if (requesterOid !== undefined && job.ownerOid !== requesterOid)
        return null;
    return job.manifest;
}
exports.getJobManifest = getJobManifest;
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
function processJob(jobId, containerId, itemIds, userToken) {
    return __awaiter(this, void 0, void 0, function* () {
        const job = jobs.get(jobId);
        job.status = "preparing";
        job.currentItem = "Initialising...";
        let graphToken;
        try {
            graphToken = yield (0, auth_1.getGraphToken)(userToken);
        }
        catch (err) {
            job.status = "failed";
            job.completedAt = Date.now();
            job.errors.push(`Graph token error: ${err.message}`);
            return;
        }
        const graphClient = (0, auth_1.createGraphClient)(graphToken);
        // 先把文件夹递归展开为扁平文件列表，便于后续逐项解析下载地址。
        job.currentItem = "Expanding folder structure...";
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
            job.completedAt = Date.now();
            job.errors.push("No files found to archive.");
            return;
        }
        if (flatFiles.length > MAX_FILES) {
            job.status = "failed";
            job.completedAt = Date.now();
            job.errors.push(`Too many files (${flatFiles.length}). Maximum is ${MAX_FILES}.`);
            return;
        }
        job.totalFiles = flatFiles.length;
        let totalBytes = 0;
        let preparedBytes = 0;
        const manifestItems = [];
        for (let i = 0; i < flatFiles.length; i++) {
            const flatFile = flatFiles[i];
            job.currentItem = flatFile.relativePath;
            job.processedFiles = i;
            totalBytes += flatFile.size;
            if (totalBytes > MAX_BYTES) {
                job.status = "failed";
                job.completedAt = Date.now();
                job.errors.push(`Archive would exceed the ${MAX_BYTES / 1024 / 1024} MB size limit.`);
                return;
            }
        }
        job.totalBytes = totalBytes;
        for (let i = 0; i < flatFiles.length; i++) {
            const file = flatFiles[i];
            job.currentItem = file.relativePath;
            job.processedFiles = i;
            try {
                const downloadUrl = yield resolveDownloadUrl(graphClient, graphToken, containerId, file.itemId);
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
            }
            catch (err) {
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
    });
}
//# sourceMappingURL=downloadArchive.js.map