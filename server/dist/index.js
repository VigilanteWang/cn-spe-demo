"use strict";
/**
 * 后端 API 服务器主入口
 *
 * 可以把这个文件理解为“后端的总装配点（composition root）”。
 * 应用启动时会先执行这里，再由这里把各个独立的能力拼起来。
 *
 * 此文件主要负责：
 * 1. 启动 Restify HTTP 服务器，让浏览器或其他客户端可以通过 HTTP 调用后端能力
 * 2. 注册 API 路由，把具体 URL 映射到对应的业务处理函数
 * 3. 配置 CORS (跨域资源共享)，允许前端开发服务器从不同端口访问本地后端
 * 4. 在路由这一层做统一的异常兜底，避免未捕获错误直接导致请求挂起
 * 5. 串联认证、Microsoft Graph 调用、归档下载等多个模块
 *
 * 服务器运行在 http://localhost:3001
 * 这个文件暴露的 API 主要分为三类：
 * - 容器管理：列出容器、创建容器
 * - 文件项管理：批量删除指定项目
 * - 归档下载：启动归档准备任务、查询进度、返回下载清单（manifest）
 *
 * 对初级开发者来说，阅读顺序建议是：
 * 1. 先看中间件配置，理解每个请求进入服务器后的公共处理
 * 2. 再看各个路由注释，理解请求参数、调用链和响应结果
 * 3. 最后跳转到 listContainers / createContainer / downloadArchive / auth 等模块看具体业务实现
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
// ─── 服务器初始化 ────────────────────────────────────────────────────────────
/** 创建 Restify 服务器实例。 */
const server = restify.createServer();
/** bodyParser 中间件：自动解析请求体中的 JSON，让路由处理函数可以直接读取 req.body。 */
server.use(restify.plugins.bodyParser());
// ─── 启动服务器 ─────────────────────────────────────────────────────────────
/** 监听端口，优先读取环境变量，回退到 3001。 */
server.listen(process.env.port || process.env.PORT || 3001, () => {
    console.log(`\nAPI server started, ${server.name} listening to ${server.url}`);
});
// ─── CORS 配置 ───────────────────────────────────────────────────────────────
/**
 * server.pre 会在路由匹配前拦截每个请求。
 * 这里统一写入跨域响应头，让前端开发服务器可以访问本地后端。
 */
server.pre((req, res, next) => {
    res.header("Access-Control-Allow-Origin", req.header("origin"));
    res.header("Access-Control-Allow-Headers", req.header("Access-Control-Request-Headers"));
    res.header("Access-Control-Allow-Credentials", "true");
    /** 直接应答 OPTIONS 预检请求，避免进入路由处理。 */
    if (req.method === "OPTIONS") {
        return res.send(204);
    }
    next();
});
/**
 * GET /api/listContainers 路由
 *
 * 这个接口用于返回“当前用户有权限访问的容器列表”。
 * 前端通常会在页面初始化或刷新列表时调用它，用来构建容器选择界面。
 *
 * 这里本身不实现“如何查询容器”的业务细节，
 * 而是把真正的工作委托给 listContainers 模块，当前文件只负责：
 * 1. 接收 HTTP 请求
 * 2. 调用业务函数
 * 3. 如果业务函数抛错，则统一转换成 500 响应
 * 4. 调用 next() 结束当前 Restify 路由处理流程
 *
 * 这种分层方式的好处是：
 * - 路由文件保持薄，容易快速浏览所有接口
 * - 业务逻辑集中在单独模块里，更容易测试和复用
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
 * 这个接口用于创建一个新的容器。
 * 一般由前端表单提交触发，例如用户输入容器名称后点击“创建”。
 *
 * 和 listContainers 一样，当前路由只负责 HTTP 层面的编排：
 * 1. 从客户端接收创建请求
 * 2. 调用 createContainer 模块执行业务逻辑
 * 3. 如果底层实现抛错，则返回 500，避免请求无响应
 * 4. 调用 next()，让 Restify 完成这次请求生命周期
 *
 * 对初级开发者来说，可以把这里理解为 controller，
 * createContainer 则更接近 service 层或 use-case 层。
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
 *
 * 这个接口用于在指定容器中批量删除多个项目。
 * 它适合“用户在前端勾选多条记录后一次性删除”的场景。
 *
 * 请求体: { containerId: string, itemIds: string[] }
 * 响应体: { successful: string[], failed: Array<{ id: string, reason: string }> }
 *
 * 处理步骤：
 * 1. 先校验当前请求是否具备容器管理权限
 * 2. 再校验请求体参数是否完整
 * 3. 使用当前用户令牌换取 Graph 可用令牌，并创建 Graph 客户端
 * 4. 逐个删除 item，分别记录成功和失败结果
 * 5. 即使部分项目删除失败，也会把每个 item 的结果汇总返回给前端
 *
 * 这里没有采用“一个失败就整个请求失败”的方式，
 * 而是返回 successful/failed 两个集合。这样前端可以更友好地提示用户：
 * 哪些项已删除，哪些项失败，以及失败原因是什么。
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
        /** 顺序删除以降低 Microsoft Graph 节流风险。 */
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
 *
 * 这个接口用于“发起一个后台归档准备任务”，而不是直接把 ZIP 文件同步返回给浏览器。
 * 之所以分成异步任务，是因为当用户选择的文件较多时，目录展开与链接解析可能持续数秒甚至更久，
 * 如果在一个 HTTP 请求里同步完成，体验会差，也更容易超时。
 *
 * 请求体: { containerId: string, itemIds: string[] }
 * 响应体: { jobId: string }
 *
 * 返回的 jobId 是后续整个下载流程的关键：
 * - 前端用它轮询准备进度
 * - 准备完成后通过 manifest 接口获取下载清单
 */
server.post("/api/downloadArchive/start", (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _b;
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
        const jobId = yield (0, downloadArchive_1.startDownloadJob)(containerId, itemIds, authResult.token, (_b = authResult.claims.oid) !== null && _b !== void 0 ? _b : "");
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
 *
 * 这个接口用于查询某个归档任务当前进展。
 * 前端通常会在用户点击“下载选中项”后，周期性轮询这个接口，
 * 从而更新页面上的进度条、状态文案或 loading 提示。
 *
 * 响应: JobProgress | 404
 *
 * 如果 jobId 找不到，通常说明：
 * - jobId 本身无效
 * - 任务已经过期并从内存中清理掉
 */
server.get("/api/downloadArchive/progress/:jobId", (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _c;
    try {
        const authResult = yield (0, auth_1.authorizeContainerManageRequest)(req);
        if (!authResult.ok) {
            res.send(authResult.status, authResult.body);
            return next();
        }
        const { jobId } = req.params;
        const requesterOid = (_c = authResult.claims.oid) !== null && _c !== void 0 ? _c : "";
        const progress = (0, downloadArchive_1.getJobProgress)(jobId, requesterOid);
        if (!progress) {
            res.send(404, { message: "Job not found, expired, or access denied." });
            return next();
        }
        res.send(200, progress);
    }
    catch (error) {
        res.send(500, { message: `Error fetching progress: ${error.message}` });
    }
    next();
}));
// ── 归档下载：获取文件清单 ──────────────────────────────────────────────────
/**
 * GET /api/downloadArchive/manifest/:jobId
 *
 * 这个接口用于在任务准备完成后返回清单（manifest）。
 * 后端会继续校验任务所有权，确保只有创建任务的用户能读取清单。
 */
server.get("/api/downloadArchive/manifest/:jobId", (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _d;
    try {
        const authResult = yield (0, auth_1.authorizeContainerManageRequest)(req);
        if (!authResult.ok) {
            res.send(authResult.status, authResult.body);
            return next();
        }
        const { jobId } = req.params;
        const requesterOid = (_d = authResult.claims.oid) !== null && _d !== void 0 ? _d : "";
        const progress = (0, downloadArchive_1.getJobProgress)(jobId, requesterOid);
        if (!progress) {
            res.send(404, { message: "Job not found, expired, or access denied." });
            return next();
        }
        if (progress.status !== "ready") {
            res.send(409, {
                message: `Archive manifest not ready yet. Status: ${progress.status}`,
            });
            return next();
        }
        const manifest = (0, downloadArchive_1.getJobManifest)(jobId, requesterOid);
        if (!manifest) {
            res.send(404, { message: "Archive manifest not found." });
            return next();
        }
        res.send(200, manifest);
    }
    catch (error) {
        res.send(500, {
            message: `Error fetching archive manifest: ${error.message}`,
        });
    }
    next();
}));
//# sourceMappingURL=index.js.map