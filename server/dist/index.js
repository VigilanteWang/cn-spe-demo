"use strict";
/**
 * 后端 API 服务器主入口
 *
 * 此文件负责：
 * 1. 启动 Restify HTTP 服务器
 * 2. 注册 API 路由
 * 3. 配置 CORS (跨域资源共享)
 * 4. 处理全局错误
 *
 * 服务器运行在 http://localhost:3001
 * 提供两个 API 端点：
 * - GET  /api/listContainers   : 列出当前用户能访问的所有容器
 * - POST /api/createContainer  : 创建新容器
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const restify = __importStar(require("restify")); // HTTP 服务框架
require("./config"); // 加载环境变量配置 (副作用导入)
const listContainers_1 = require("./listContainers");
const createContainer_1 = require("./createContainer");
const downloadArchive_1 = require("./downloadArchive");
const auth_1 = require("./auth");
// =============== 服务器创建与中间件配置 ===============
// 创建 Restify 服务器实例
const server = restify.createServer();
// bodyParser 中间件：自动解析请求体中的 JSON 数据
server.use(restify.plugins.bodyParser());
// =============== 启动服务器 ===============
// 监听 3001 端口
server.listen(process.env.port || process.env.PORT || 3001, () => {
    console.log(`\nAPI server started, ${server.name} listening to ${server.url}`);
});
// =============== CORS 配置 ===============
// 设置 CORS headers
server.pre((req, res, next) => {
    // 允许跨域请求
    res.header("Access-Control-Allow-Origin", req.header("origin"));
    res.header("Access-Control-Allow-Headers", req.header("Access-Control-Request-Headers"));
    res.header("Access-Control-Allow-Credentials", "true");
    // 处理 OPTIONS 预检请求
    if (req.method === "OPTIONS") {
        return res.send(204);
    }
    next();
});
// =============== API 路由定义 ===============
function sanitizeDownloadFilename(filename) {
    // 过滤 Windows/Unix 文件名非法字符与控制字符，避免响应头注入和文件名异常
    const cleaned = filename
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
        .replace(/\s+/g, " ")
        .trim();
    if (!cleaned) {
        return "archive.zip";
    }
    return cleaned;
}
/**
 * GET /api/listContainers 路由
 *
 * 处理流程：
 * 1. 处理函数可能发生未捕获的异常
 * 2. try-catch 捕获并处理，返回 500 错误
 * 3. next() 允许 Restify 继续处理下一个中间件/路由
 */
server.get("/api/listContainers", (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, listContainers_1.listContainers)(req, res);
    }
    catch (error) {
        res.send(500, { message: `Error in API server: ${error.message}` });
    }
    next();
}));
/**
 * POST /api/createContainer 路由
 *
 * 处理流程：
 * 1. 调用处理函数
 * 2. 不捕获的异常返回 500
 * 3. next() 清理资源
 */
server.post("/api/createContainer", (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, createContainer_1.createContainer)(req, res);
    }
    catch (error) {
        res.send(500, { message: `Error in API server: ${error.message}` });
    }
    next();
}));
// ── 批量删除项目 ────────────────────────────────────────────────────────────
/**
 * POST /api/deleteItems
 * 请求体: { containerId: string, itemIds: string[] }
 * 响应体: { successful: string[], failed: Array<{ id: string, reason: string }> }
 */
server.post("/api/deleteItems", (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const authResult = yield (0, auth_1.authorizeContainerManageRequest)(req);
        if (!authResult.ok) {
            res.send(authResult.status, authResult.body);
            return next();
        }
        const { containerId, itemIds } = req.body;
        if (!containerId || !Array.isArray(itemIds) || itemIds.length === 0) {
            res.send(400, {
                message: "containerId and a non-empty itemIds array are required.",
            });
            return next();
        }
        const graphToken = yield (0, auth_1.getGraphToken)(authResult.token);
        const graphClient = (0, auth_1.createGraphClient)(graphToken);
        const successful = [];
        const failed = [];
        // 顺序删除以降低 Graph 节流（throttling）风险
        for (const itemId of itemIds) {
            try {
                yield graphClient
                    .api(`/drives/${containerId}/items/${itemId}`)
                    .delete();
                successful.push(itemId);
            }
            catch (err) {
                failed.push({ id: itemId, reason: (_a = err.message) !== null && _a !== void 0 ? _a : "Unknown error" });
            }
        }
        res.send(200, { successful, failed });
    }
    catch (error) {
        res.send(500, { message: `Error in deleteItems: ${error.message}` });
    }
    next();
}));
// ── 归档下载：启动任务 ──────────────────────────────────────────────────────
/**
 * POST /api/downloadArchive/start
 * 请求体: { containerId: string, itemIds: string[] }
 * 响应体: { jobId: string }
 */
server.post("/api/downloadArchive/start", (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const authResult = yield (0, auth_1.authorizeContainerManageRequest)(req);
        if (!authResult.ok) {
            res.send(authResult.status, authResult.body);
            return next();
        }
        const { containerId, itemIds } = req.body;
        if (!containerId || !Array.isArray(itemIds) || itemIds.length === 0) {
            res.send(400, {
                message: "containerId and a non-empty itemIds array are required.",
            });
            return next();
        }
        const jobId = yield (0, downloadArchive_1.startDownloadJob)(containerId, itemIds, authResult.token);
        res.send(200, { jobId });
    }
    catch (error) {
        res.send(500, { message: `Error starting archive job: ${error.message}` });
    }
    next();
}));
// ── 归档下载：查询进度 ─────────────────────────────────────────────────────
/**
 * GET /api/downloadArchive/progress/:jobId
 * 响应: JobProgress | 404
 */
server.get("/api/downloadArchive/progress/:jobId", (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { jobId } = req.params;
        const progress = (0, downloadArchive_1.getJobProgress)(jobId);
        if (!progress) {
            res.send(404, { message: "Job not found or expired." });
            return next();
        }
        res.send(200, progress);
    }
    catch (error) {
        res.send(500, { message: `Error fetching progress: ${error.message}` });
    }
    next();
}));
// ── 归档下载：创建一次性票据 ───────────────────────────────────────────────
/**
 * POST /api/downloadArchive/ticket/:jobId
 * 请求体: { filename?: string }
 * 响应体: { downloadUrl: string }
 */
server.post("/api/downloadArchive/ticket/:jobId", (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _b;
    try {
        const authResult = yield (0, auth_1.authorizeContainerManageRequest)(req);
        if (!authResult.ok) {
            res.send(authResult.status, authResult.body);
            return next();
        }
        const { jobId } = req.params;
        const progress = (0, downloadArchive_1.getJobProgress)(jobId);
        if (!progress) {
            res.send(404, { message: "Job not found or expired." });
            return next();
        }
        if (progress.status !== "ready") {
            res.send(409, {
                message: `Archive not ready yet. Status: ${progress.status}`,
            });
            return next();
        }
        const buffer = (0, downloadArchive_1.getJobBuffer)(jobId);
        if (!buffer) {
            res.send(404, { message: "Archive data not found." });
            return next();
        }
        const body = ((_b = req.body) !== null && _b !== void 0 ? _b : {});
        const requestedFilename = typeof body.filename === "string" && body.filename.trim().length > 0
            ? body.filename
            : "archive.zip";
        const ticket = (0, downloadArchive_1.createDownloadTicket)(jobId, requestedFilename);
        res.send(200, {
            downloadUrl: `/api/downloadArchive/fileByTicket/${encodeURIComponent(ticket)}`,
        });
    }
    catch (error) {
        res.send(500, {
            message: `Error creating download ticket: ${error.message}`,
        });
    }
    next();
}));
// ── 归档下载：通过一次性票据下载 ZIP ──────────────────────────────────────
/**
 * GET /api/downloadArchive/fileByTicket/:ticket
 * 响应: application/zip 附件流 | 404 | 409
 */
server.get("/api/downloadArchive/fileByTicket/:ticket", (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { ticket } = req.params;
        const consumed = (0, downloadArchive_1.consumeDownloadTicket)(ticket);
        if (!consumed) {
            res.send(404, { message: "Invalid or expired download ticket." });
            return next();
        }
        const { jobId, filename } = consumed;
        const progress = (0, downloadArchive_1.getJobProgress)(jobId);
        if (!progress) {
            res.send(404, { message: "Job not found or expired." });
            return next();
        }
        if (progress.status !== "ready") {
            res.send(409, {
                message: `Archive not ready yet. Status: ${progress.status}`,
            });
            return next();
        }
        const buffer = (0, downloadArchive_1.getJobBuffer)(jobId);
        if (!buffer) {
            res.send(404, { message: "Archive data not found." });
            return next();
        }
        const safeFilename = sanitizeDownloadFilename(filename);
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
        res.setHeader("Content-Length", String(buffer.length));
        res.sendRaw(200, buffer);
    }
    catch (error) {
        res.send(500, {
            message: `Error fetching archive by ticket: ${error.message}`,
        });
    }
    next();
}));
//# sourceMappingURL=index.js.map