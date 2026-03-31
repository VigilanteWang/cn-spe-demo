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

import * as restify from "restify"; // HTTP 服务框架
import "./config"; // 加载环境变量配置 (副作用导入)
import { listContainers } from "./listContainers";
import { createContainer } from "./createContainer";

// =============== 服务器创建与中间件配置 ===============

// 创建 Restify 服务器实例
const server = restify.createServer();

// bodyParser 中间件：自动解析请求体中的 JSON 数据
server.use(restify.plugins.bodyParser());

// =============== 启动服务器 ===============

// 监听 3001 端口
server.listen(process.env.port || process.env.PORT || 3001, () => {
  console.log(
    `\nAPI server started, ${server.name} listening to ${server.url}`,
  );
});

// =============== CORS 配置 ===============

// 设置 CORS headers
server.pre((req, res, next) => {
  // 允许跨域请求
  res.header("Access-Control-Allow-Origin", req.header("origin"));
  res.header(
    "Access-Control-Allow-Headers",
    req.header("Access-Control-Request-Headers"),
  );
  res.header("Access-Control-Allow-Credentials", "true");

  // 处理 OPTIONS 预检请求
  if (req.method === "OPTIONS") {
    return res.send(204);
  }

  next();
});

// =============== API 路由定义 ===============

/**
 * GET /api/listContainers 路由
 *
 * 处理流程：
 * 1. 处理函数可能发生未捕获的异常
 * 2. try-catch 捕获并处理，返回 500 错误
 * 3. next() 允许 Restify 继续处理下一个中间件/路由
 */
server.get("/api/listContainers", async (req, res, next) => {
  try {
    await listContainers(req, res);
  } catch (error: any) {
    res.send(500, { message: `Error in API server: ${error.message}` });
  }
  next();
});

/**
 * POST /api/createContainer 路由
 *
 * 处理流程：
 * 1. 调用处理函数
 * 2. 不捕获的异常返回 500
 * 3. next() 清理资源
 */
server.post("/api/createContainer", async (req, res, next) => {
  try {
    await createContainer(req, res);
  } catch (error: any) {
    res.send(500, { message: `Error in API server: ${error.message}` });
  }
  next();
});
