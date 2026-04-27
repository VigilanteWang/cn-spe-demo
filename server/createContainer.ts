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

import { Request, Response } from "restify";
import {
  authorizeContainerManageRequest,
  createGraphClient,
  getGraphToken,
} from "./auth";
import { serverConfig } from "./config";

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
export const createContainer = async (req: Request, res: Response) => {
  /** 所有创建操作都先经过统一权限校验。 */
  const authorizationResult = await authorizeContainerManageRequest(req);

  if (!authorizationResult.ok) {
    res.send(authorizationResult.status, authorizationResult.body);
    return;
  }

  try {
    /** API 令牌需要先交换成 Microsoft Graph 可接受的令牌。 */
    const graphToken = await getGraphToken(authorizationResult.token);

    /** 使用统一工厂创建 Graph 客户端，保持调用方式一致。 */
    const graphClient = createGraphClient(graphToken);

    /**
     * 请求体只允许前端控制名称和描述。
     * 容器类型由服务端配置决定，避免客户端绕过约束。
     */
    const containerRequestData = {
      displayName: req.body!.displayName,
      description: req.body?.description ? req.body.description : "",
      containerTypeId: serverConfig.containerTypeId,
    };

    const graphResponse = await graphClient
      .api("/storage/fileStorage/containers")
      .version("v1.0")
      .post(containerRequestData);

    res.send(200, graphResponse);
    return;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.send(500, { message: `Failed to create container: ${msg}` });
    return;
  }
};
