"use strict";
/**
 * 创建容器的 API 路由处理器
 *
 * 此模块处理 POST /api/createContainer 请求，执行以下步骤：
 * 1. 检查请求是否带有有效的 access token
 * 2. 检查 token 是否有 Container.Manage 权限
 * 3. 用 OBO 流程互换一个 Graph API token
 * 4. 用 Graph token 调用 Microsoft Graph API 创建容器
 * 5. 返回创建结果或错误
 *
 * 请求示例：
 * ```bash
 * curl -X POST http://localhost:3001/api/createContainer \
 *   -H "Authorization: Bearer <access_token>" \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "displayName": "My Container",
 *     "description": "A test container",
 *     "containerTypeId": "<type-id>"
 *   }'
 * ```
 *
 * 响应示例：
 * - 200: { id, createdDateTime, description, displayName, ... }
 * - 401: { message: "No access token provided." }
 * - 403: { message: "Access token is missing required scope..." }
 * - 500: { message: "Failed to create container: ..." }
 **/
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
exports.createContainer = void 0;
const auth_1 = require("./auth");
const config_1 = require("./config");
/**
 * POST /api/createContainer 路由处理函数
 *
 * @param req Restify Request 对象
 *   - req.headers.authorization: "需要是 "Bearer <token>" 格式
 *   - req.body: { displayName, description?, containerTypeId }
 * @param res Restify Response 对象，用于返回 HTTP 响应
 *
 * 执行流程：
 * 1. 检查身份验证（token 有效 + 有 Container.Manage 权限）
 * 2. 如果验证失败，直接返回错误（401/403）
 * 3. 对验证成功的 token 执行 OBO （互换 Graph API token）
 * 4. 创建 Graph 客户端，调用 /storage/fileStorage/containers API
 * 5. 返回 API 响应（新容器信息）
 * 6. 如果任何步骤失败，返回 500 错误
 **/
const createContainer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    // 步骤 1: 检查 token 验证
    const authorizationResult = yield (0, auth_1.authorizeContainerManageRequest)(req);
    // 步骤 2: 处理验证失败的情况
    if (!authorizationResult.ok) {
        // ok === false 表示验证失败
        // status 是 HTTP 状态码（401 或 403）
        // body 是不错信息
        res.send(authorizationResult.status, authorizationResult.body);
        return; // 提前返回，不执行后面的代码
    }
    try {
        // 步骤 3: OBO 流程 - 操作成功的 token（authorizationResult.token）
        // 勞换为 Graph API token，使用后端 API app 的身份
        const graphToken = yield (0, auth_1.getGraphToken)(authorizationResult.token);
        // 步骤 4: 创建 Graph 客户端实例并指定 token
        const graphClient = (0, auth_1.createGraphClient)(graphToken);
        // 步骤 5: 构建请求体
        // 来自客户端 POST 请求体，例如：{
        //   displayName: "My Container",
        //   description: "A test",
        //   containerTypeId: "standard"
        // }
        const containerRequestData = {
            displayName: req.body.displayName,
            description: ((_a = req.body) === null || _a === void 0 ? void 0 : _a.description) ? req.body.description : "",
            containerTypeId: config_1.serverConfig.containerTypeId, // 来自执葛路网配置，表示容器类型
        };
        // 步骤 6: 调用 Graph API 创建容器
        // .api("/storage/fileStorage/containers"): 库上才学的 SharePoint Embedded API 路径
        // .version("v1.0"): 使用 v1.0 稳定版，不用 beta
        // .post(data): 发送 POST 请求，体体是 containerRequestData
        const graphResponse = yield graphClient
            .api("/storage/fileStorage/containers")
            .version("v1.0")
            .post(containerRequestData);
        // 步骤 7: 返回成功响应 (200 OK + 新容器信息)
        res.send(200, graphResponse);
        return;
    }
    catch (error) {
        // 步骤 8: 处理意外失败
        // 没有捕获到这里的错误即为服务器错误，返回 500
        res.send(500, { message: `Failed to create container: ${error.message}` });
        return;
    }
});
exports.createContainer = createContainer;
