"use strict";
/**
 * 处理容器创建请求。
 *
 * 这个模块对应 POST /api/createContainer 路由。
 * 当前端提交新建容器表单后，请求会进入这里。
 *
 * 它的核心职责是把外部输入整理成一个受控的创建操作：
 *
 * 1. 校验当前用户权限。
 * 2. 换取可访问 Microsoft Graph 的令牌。
 * 3. 使用服务端配置补全安全字段。
 * 4. 调用 Graph 创建容器并返回结果。
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createContainer = void 0;
const auth_1 = require("./auth");
const config_1 = require("./config");
/**
 * 创建一个新的 SharePoint Embedded 容器。
 *
 * 这里不直接信任客户端提交的完整对象，而是只接收必要字段，
 * 并由服务端强制写入 containerTypeId，避免前端越权创建错误类型的容器。
 *
 * @param req Restify 请求对象。请求体中应包含 displayName，可选 description。
 * @param res Restify 响应对象。用于返回创建结果或错误信息。
 * @returns Promise<void>
 */
const createContainer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    /** 所有创建操作都先经过统一权限校验。 */
    const authorizationResult = yield (0, auth_1.authorizeContainerManageRequest)(req);
    if (!authorizationResult.ok) {
        res.send(authorizationResult.status, authorizationResult.body);
        return;
    }
    try {
        /** API 令牌需要先交换成 Microsoft Graph 可接受的令牌。 */
        const graphToken = yield (0, auth_1.getGraphToken)(authorizationResult.token);
        /** 使用统一工厂创建 Graph 客户端，保持调用方式一致。 */
        const graphClient = (0, auth_1.createGraphClient)(graphToken);
        /**
         * 请求体只允许前端控制名称和描述。
         * 容器类型由服务端配置决定，避免客户端绕过约束。
         */
        const containerRequestData = {
            displayName: req.body.displayName,
            description: ((_a = req.body) === null || _a === void 0 ? void 0 : _a.description) ? req.body.description : "",
            containerTypeId: config_1.serverConfig.containerTypeId,
        };
        const graphResponse = yield graphClient
            .api("/storage/fileStorage/containers")
            .version("v1.0")
            .post(containerRequestData);
        res.send(200, graphResponse);
        return;
    }
    catch (error) {
        res.send(500, { message: `Failed to create container: ${error.message}` });
        return;
    }
});
exports.createContainer = createContainer;
//# sourceMappingURL=createContainer.js.map