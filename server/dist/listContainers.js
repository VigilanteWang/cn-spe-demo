"use strict";
/**
 * 列表容器的 API 路由处理器
 *
 * 此模块处理 GET /api/listContainers 请求，执行以下步骤：
 * 1. 检查请求是否带有有效的 access token
 * 2. 检查 token 是否有 Container.Manage 权限
 * 3. 用 OBO 流程互换一个 Graph API token
 * 4. 用 Graph token 调用 Microsoft Graph API 查询容器
 * 5. 根据 containerTypeId 对应用户的所有容器过滤
 * 6. 返回容器列表或错误
 *
 * 请求示例：
 * ```bash
 * curl -X GET http://localhost:3001/api/listContainers \
 *   -H "Authorization: Bearer <access_token>"
 * ```
 *
 * 响应示例：
 * - 200: { value: [ { id: "...", displayName: "...", ... }, ... ] }
 * - 401: { message: "No access token provided." }
 * - 403: { message: "Access token is missing required scope..." }
 * - 500: { message: "Unable to list containers: ..." }
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
exports.listContainers = void 0;
const auth_1 = require("./auth");
const config_1 = require("./config");
/**
 * GET /api/listContainers 路由处理函数
 *
 * @param req Restify Request 对象
 *   - req.headers.authorization: 需要是 "Bearer <token>" 格式
 * @param res Restify Response 对象，用于返回 HTTP 响应
 *
 * 执行流程：
 * 1. 检查身份验证（token 有效 + 有 Container.Manage 权限）
 * 2. 如果验证失败，直接返回错误（401/403）
 * 3. 对验证成功的 token 执行 OBO （互换 Graph API token）
 * 4. 创建 Graph 客户端，调用 /storage/fileStorage/containers API
 * 5. 使用 OData 穾滤（filter）过滤：攵返整个 containerTypeId 匹配的容器
 * 6. 返回容器列表（椭轉数组）
 * 7. 如果任何步骤失败，返回 500 错误
 **/
const listContainers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // 步骤 1: 检查 token 验证
    const authorizationResult = yield (0, auth_1.authorizeContainerManageRequest)(req);
    // 步骤 2: 处理验证失败的情况
    if (!authorizationResult.ok) {
        // ok === false 表示验证失败
        res.send(authorizationResult.status, authorizationResult.body);
        return;
    }
    try {
        // 步骤 3: OBO 流程 - 悟换 Graph API token
        const graphToken = yield (0, auth_1.getGraphToken)(authorizationResult.token);
        // 步骤 4: 创建 Graph 客户端实例
        const graphClient = (0, auth_1.createGraphClient)(graphToken);
        // 步骤 5: 使用 OData 穾滤齦出结果
        // OData 是一种查询语言（不是 SQL！）
        // 例子：ト接返 containerTypeId 等于 "我们配置的 type"的容器
        // 穾滤语法： "fieldName op value"，其中 op 是比较操作符（eq/ne/gt/lt 等）
        const graphResponse = yield graphClient
            .api("/storage/fileStorage/containers") // SharePoint Embedded 容器 API
            .version("v1.0") // 使用稳定 v1.0 API
            .filter(`containerTypeId eq ${config_1.serverConfig.containerTypeId}`) // OData 筛选
            .get(); // 发送 GET 请求
        // 步骤 6: 返回成功响应 (200 OK + 容器列表)
        res.send(200, graphResponse);
        return;
    }
    catch (error) {
        // 步骤 7: 处理意外失败
        res.send(500, { message: `Unable to list containers: ${error.message}` });
        return;
    }
});
exports.listContainers = listContainers;
