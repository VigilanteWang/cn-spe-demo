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
 * 4. 在路由这一层通过 `withErrorHandling()` 做统一异常响应，避免未捕获错误直接导致请求挂起
 * 5. 串联认证、Microsoft Graph 调用、归档下载等多个模块
 *
 * 服务器运行在 http://localhost:3001
 * 这个文件暴露的 API 主要分为四类：
 * - 容器管理：列出容器、创建容器
 * - 容器权限：读取和应用容器级权限
 * - 文件项管理：批量删除指定项目
 * - 下载准备：启动后台任务、查询准备进度、返回下载清单（manifest）
 *
 * 对初级开发者来说，阅读顺序建议是：
 * 1. 先看中间件配置，理解每个请求进入服务器后的公共处理
 * 2. 再看各个路由注释，理解请求参数、调用链和响应结果
 * 3. 最后跳转到 listContainers / createContainer / download / auth 等模块看具体业务实现
 */

import * as restify from "restify"; // HTTP 服务框架
import "./config"; // 加载环境变量配置 (副作用导入)
import { withErrorHandling } from "./common/errorResponse";
import { listContainers } from "./listContainers";
import { createContainer } from "./createContainer";
import {
  applyContainerPermissions,
  listContainerPermissions,
} from "./containerPermissions";
import {
  applyItemLinkPermissionsToGraph,
  applyItemPermissionsToGraph,
  listItemLinkPermissionsFromGraph,
  listItemPermissionsFromGraph,
} from "./itemPermissions";
import {
  deleteItemHistoryVersionsFromGraph,
  deleteItemVersionFromGraph,
  getCurrentItemVersionFromGraph,
  getItemVersionDownloadFromGraph,
  getItemVersionFromGraph,
  listItemVersionsFromGraph,
  restoreItemVersionFromGraph,
} from "./itemVersions";
import { deleteItems } from "./deleteItems";
import {
  getDownloadManifestRequest,
  getDownloadProgressRequest,
  startDownloadRequest,
} from "./downloadHandlers";

/**
 * Handler 风格说明（重要）
 *
 * 从 Restify 9+ 开始，框架区分两种处理器风格：
 * - async/Promise 风格：处理器签名为 `(req, res)` 并返回 Promise（或使用 `async`），框架会等待 Promise 完成并自动捕获未处理的拒绝；在该风格下**不要**接收或调用 `next()`。
 * - callback 风格：处理器签名为 `(req, res, next)`，通过显式调用 `next()` / `next(err)` / `next(false)` 来推进或终止链式执行。
 *
 * 因此请确保路由处理器的参数个数与使用方式一致，避免 `async (req, res, next)` 这类混合写法，会触发 Restify 的运行期断言。
 */

// ─── 服务器初始化 ────────────────────────────────────────────────────────────

/** 创建 Restify 服务器实例。 */
const server = restify.createServer();

/** bodyParser 中间件：自动解析请求体中的 JSON，让路由处理函数可以直接读取 req.body。 */
server.use(restify.plugins.bodyParser());

// ─── 启动服务器 ─────────────────────────────────────────────────────────────

/** 监听端口，优先读取环境变量，回退到 3001。 */
server.listen(process.env.port || process.env.PORT || 3001, () => {
  console.log(
    `\nAPI server started, ${server.name} listening to ${server.url}`,
  );
});

// ─── CORS 配置 ───────────────────────────────────────────────────────────────

/**
 * server.pre 会在路由匹配前拦截每个请求。
 * 这里统一写入跨域响应头，让前端开发服务器可以访问本地后端。
 *
 * 安全内容：仅回显白名单内的 Origin，防止 CORS 头被任意域利用。
 * 兼容对齐：通过 CORS_ALLOWED_ORIGINS 环境变量配置，默认允许 http://localhost:3000。
 */

// 读取允许的跨域来源列表（逗号分隔），默认允许 Vite 开发服务器的地址。
const ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

// 明确声明允许浏览器跨域调用的 HTTP 方法，避免 DELETE 等非简单方法在预检阶段被拦截。
const ALLOWED_CORS_METHODS = "GET, POST, DELETE, OPTIONS";

server.pre((req, res, next) => {
  const origin = req.header("origin") ?? "";
  // 仅回显白名单中的 Origin，防止 CORS 头被任意域利用。
  if (ALLOWED_ORIGINS.has(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Methods", ALLOWED_CORS_METHODS);
  res.header(
    "Access-Control-Allow-Headers",
    req.header("Access-Control-Request-Headers"),
  );
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
 * 3. 如果业务函数抛错，则交给统一错误层转换成稳定的 API 错误响应
 * 4. 在 async 处理器中不要调用 `next()`；请使用 `async (req, res)` 或非 async 的 `function(req, res, next)` 两类风格之一
 *
 * 这种分层方式的好处是：
 * - 路由文件保持薄，容易快速浏览所有接口
 * - 业务逻辑集中在单独模块里，更容易测试和复用
 */
server.get("/api/listContainers", withErrorHandling(listContainers));

/**
 * POST /api/createContainer 路由
 *
 * 这个接口用于创建一个新的容器。
 * 一般由前端表单提交触发，例如用户输入容器名称后点击“创建”。
 *
 * 和 listContainers 一样，当前路由只负责 HTTP 层面的编排：
 * 1. 从客户端接收创建请求
 * 2. 调用 createContainer 模块执行业务逻辑
 * 3. 如果底层实现抛错，则交给统一错误层输出稳定响应，避免请求无响应
 * 4. 在 async 处理器中不要调用 `next()`；请使用 `async (req, res)` 或非 async 的 `function(req, res, next)` 两类风格之一
 *
 * 对初级开发者来说，可以把这里理解为 controller，
 * createContainer 则更接近 service 层或 use-case 层。
 */
server.post("/api/createContainer", withErrorHandling(createContainer));

/**
 * GET /api/containerPermissions/:containerId
 *
 * 这个接口用于读取指定容器当前的容器级权限，并把 Graph 原始 permission
 * 映射成前端 access list 可直接消费的最小字段。
 *
 * 前端不会直接连接 Graph，而是继续通过后端 OBO：
 * 1. 统一做 token 校验和 OBO 令牌交换
 * 2. 集中处理 Graph 节流、错误映射和最小字段收敛
 * 3. 避免把容器权限写回细节散落到前端
 */
server.get(
  "/api/containerPermissions/:containerId",
  withErrorHandling(listContainerPermissions),
);

/**
 * POST /api/containerPermissions/:containerId/apply
 *
 * 这个接口接收前端已经拆好的新增 / 更新 / 删除差异，
 * 再由服务端顺序写入 Graph，并在成功后返回最新权限列表。
 *
 * 这里继续把权限写入编排留在服务端，原因是：
 * 1. 前端只负责表达“想改成什么”
 * 2. 服务端统一负责 OBO、Graph 写入顺序、错误映射和最终结果收敛
 */
server.post(
  "/api/containerPermissions/:containerId/apply",
  withErrorHandling(applyContainerPermissions),
);

/**
 * GET /api/itemPermissions/:driveId/:itemId
 *
 * 这个接口读取指定 item 的 effective permissions，
 * 再由服务端把它们分类成：
 * 1. explicit additive permissions
 * 2. inherited permissions
 *
 * 分类逻辑统一放在后端，原因是：
 * 1. 需要继续走 OBO 读取 Graph
 * 2. inherited 判别依赖当前项与父项的权限集合比对
 * 3. 只想把稳定的对话框模型返回给前端，而不是把 Graph shape 直接暴露出去
 */
server.get(
  "/api/itemPermissions/:driveId/:itemId",
  withErrorHandling(listItemPermissionsFromGraph),
);

/**
 * POST /api/itemPermissions/:driveId/:itemId/apply
 *
 * 这个接口接收 item 权限草稿差异，
 * 再由服务端统一执行 invite / patch / delete 等 Graph 写操作。
 *
 * 这样可以继续保持当前项目已经稳定下来的边界：
 * 前端只负责草稿与交互，真正写 Graph 始终走后端 OBO。
 */
server.post(
  "/api/itemPermissions/:driveId/:itemId/apply",
  withErrorHandling(applyItemPermissionsToGraph),
);

/**
 * GET /api/itemPermissions/:driveId/:itemId/links
 *
 * 这个接口专门读取 item-level link share，
 * 与 people/groups 的显式权限列表保持并列，而不是混入同一套 entry 模型。
 */
server.get(
  "/api/itemPermissions/:driveId/:itemId/links",
  withErrorHandling(listItemLinkPermissionsFromGraph),
);

/**
 * POST /api/itemPermissions/:driveId/:itemId/links/apply
 *
 * 这个接口统一编排 link 的 delete / create / grant / revoke，
 * 让前端只提交业务语义差异，真正的 Graph 写入顺序仍由后端收口。
 */
server.post(
  "/api/itemPermissions/:driveId/:itemId/links/apply",
  withErrorHandling(applyItemLinkPermissionsToGraph),
);

/**
 * GET /api/itemVersions/:driveId/:itemId
 *
 * 这个接口读取指定文件的版本历史列表，
 * 由服务端统一走 OBO 调 Graph，并把返回字段收敛成 Versions Dialog 所需的最小模型。
 */
server.get(
  "/api/itemVersions/:driveId/:itemId",
  withErrorHandling(listItemVersionsFromGraph),
);

/**
 * GET /api/itemVersions/:driveId/:itemId/current
 *
 * 这个接口直接读取 Graph `versions/current`，
 * 用来返回文件当前版本的单条元数据。
 */
server.get(
  "/api/itemVersions/:driveId/:itemId/current",
  withErrorHandling(getCurrentItemVersionFromGraph),
);

/**
 * DELETE /api/itemVersions/:driveId/:itemId/history
 *
 * 这个接口批量删除历史版本，但会显式跳过当前最新版本。
 * 之所以把“跳过第一项”的规则放在后端，是为了让前端只表达业务动作，而不是自己编排删除序列。
 */
server.del(
  "/api/itemVersions/:driveId/:itemId/history",
  withErrorHandling(deleteItemHistoryVersionsFromGraph),
);

/**
 * GET /api/itemVersions/:driveId/:itemId/:versionId/download
 *
 * 这个接口返回指定版本的下载直链；
 * 后端不会代理文件流，而是继续沿用当前项目已有的“后端解析 URL，前端触发下载”边界。
 */
server.get(
  "/api/itemVersions/:driveId/:itemId/:versionId/download",
  withErrorHandling(getItemVersionDownloadFromGraph),
);

/**
 * POST /api/itemVersions/:driveId/:itemId/:versionId/restore
 *
 * 这个接口把指定历史版本恢复为当前版本。
 * Graph 成功时返回 204，这里保持同样的响应语义，不额外包一层响应体。
 */
server.post(
  "/api/itemVersions/:driveId/:itemId/:versionId/restore",
  withErrorHandling(restoreItemVersionFromGraph),
);

/**
 * GET /api/itemVersions/:driveId/:itemId/:versionId
 *
 * 这个接口读取单条版本元数据。
 * 当前前端 Phase 2 可以先不单独消费，但后端能力先完整提供出来。
 */
server.get(
  "/api/itemVersions/:driveId/:itemId/:versionId",
  withErrorHandling(getItemVersionFromGraph),
);

/**
 * DELETE /api/itemVersions/:driveId/:itemId/:versionId
 *
 * 这个接口删除单条历史版本。
 * 写操作成功后统一返回 204，避免前端依赖无意义的空对象响应体。
 */
server.del(
  "/api/itemVersions/:driveId/:itemId/:versionId",
  withErrorHandling(deleteItemVersionFromGraph),
);

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
server.post("/api/deleteItems", withErrorHandling(deleteItems));

// ── 归档下载：启动任务 ──────────────────────────────────────────────────────
/**
 * POST /api/download/start
 *
 * 这个接口用于“发起一个后台下载准备任务”，而不是直接把 ZIP 文件同步返回给浏览器。
 * 之所以分成异步任务，是因为当用户选择的文件较多时，目录展开与链接解析可能持续数秒甚至更久，
 * 如果在一个 HTTP 请求里同步完成，体验会差，也更容易超时。
 *
 * 请求体: { containerId: string, itemIds: string[] }
 * 响应体: { jobId: string }
 *
 * 返回的 jobId 是后续整个下载流程的关键：
 * - 前端用它轮询准备进度
 * - 准备完成后通过 manifest 接口获取下载清单
 *
 * 当前实现里真正的 ZIP 压缩不在后端完成：
 * 1. 后端只负责展开目录、校验限制、解析下载地址、维护任务状态
 * 2. 前端拿到 manifest 后再逐项下载并流式压缩成 ZIP
 */
server.post("/api/download/start", withErrorHandling(startDownloadRequest));

// ── 归档下载：查询进度 ─────────────────────────────────────────────────────
/**
 * GET /api/download/progress/:jobId
 *
 * 这个接口用于查询某个下载准备任务当前进展。
 * 前端通常会在用户点击“下载选中项”后，周期性轮询这个接口，
 * 从而更新页面上的进度条、状态文案或 loading 提示。
 *
 * 响应: JobProgress
 *
 * 如果请求失败，常见原因包括：
 * - jobId 本身无效
 * - 任务已经过期并从内存中清理掉
 * - 当前用户不是任务创建者
 */
server.get(
  "/api/download/progress/:jobId",
  withErrorHandling(getDownloadProgressRequest),
);

// ── 归档下载：获取文件清单 ──────────────────────────────────────────────────
/**
 * GET /api/download/manifest/:jobId
 *
 * 这个接口用于在任务准备完成后返回清单（manifest）。
 * 后端会继续校验任务所有权，确保只有创建任务的用户能读取清单。
 *
 * 这里不会返回 ZIP 二进制，而是返回一个最小清单：
 * - 每个文件在 ZIP 内的相对路径
 * - 文件大小和 MIME 类型
 * - 前端可直接下载的 URL
 *
 * 如果任务还没到 `ready`，download 模块会抛出 `409 conflict`，
 * 提示前端继续轮询而不是提前开始下载。
 */
server.get(
  "/api/download/manifest/:jobId",
  withErrorHandling(getDownloadManifestRequest),
);
