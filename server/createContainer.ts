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
  createGraphClient,
  getGraphOBOToken,
  requireContainerManageRequest,
} from "./auth";
import {
  createValidationError,
  sendGraphRequest,
} from "./common/appErrorHelpers";
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
  const authorizationResult = await requireContainerManageRequest(req);

  if (
    typeof req.body?.displayName !== "string" ||
    !req.body.displayName.trim()
  ) {
    throw createValidationError("displayName is required.");
  }

  const containerRequestData = {
    displayName: req.body.displayName.trim(),
    description: req.body?.description ? req.body.description : "",
    containerTypeId: serverConfig.containerTypeId,
  };

  const graphToken = await getGraphOBOToken(authorizationResult.token);
  const graphClient = createGraphClient(graphToken);
  const createContainerRequest = graphClient
    .api("/storage/fileStorage/containers")
    .version("v1.0");

  const graphResponse = await sendGraphRequest(
    () => createContainerRequest.post(containerRequestData),
    "Failed to create container.",
  );

  res.send(200, graphResponse);
};
