/**
 * 处理容器列表查询请求。
 *
 * 这个模块对应 GET /api/listContainers 路由，负责把一个前端查询请求
 * 转换成一次经过认证的 Microsoft Graph 容器列表查询。
 *
 * 它本身不负责启动服务器或定义 URL，而是专注在单个业务动作上：
 *
 * 1. 校验当前用户是否具备容器管理权限。
 * 2. 通过 OBO 流程换取可访问 Microsoft Graph 的令牌。
 * 3. 按服务端配置过滤出当前应用关心的容器类型。
 * 4. 把结果或错误转换成 HTTP 响应。
 */

import { Request, Response } from "restify";
import {
  authorizeContainerManageRequest,
  createGraphClient,
  getGraphToken,
} from "./auth";
import { serverConfig } from "./config";

/**
 * 列出当前用户可访问的容器。
 *
 * 前端通常会在页面初始化或刷新容器列表时调用这个函数对应的接口。
 *
 * @param req Restify 请求对象。要求请求头中包含 Bearer Token。
 * @param res Restify 响应对象。用于返回容器列表或错误信息。
 * @returns Promise<void>
 */
export const listContainers = async (req: Request, res: Response) => {
  /** 先做权限校验，避免未授权请求访问下游服务。 */
  const authorizationResult = await authorizeContainerManageRequest(req);

  if (!authorizationResult.ok) {
    res.send(authorizationResult.status, authorizationResult.body);
    return;
  }

  try {
    /** 当前 API 使用的令牌需要先交换成 Graph 令牌。 */
    const graphToken = await getGraphToken(authorizationResult.token);

    /** Graph 客户端负责封装认证和请求链式调用。 */
    const graphClient = createGraphClient(graphToken);

    /**
     * 只返回当前应用所属的容器类型。
     * 这里在 Graph 层过滤，能减少无关数据返回到服务端。
     */
    const graphResponse = await graphClient
      .api("/storage/fileStorage/containers")
      .version("v1.0")
      .filter(`containerTypeId eq ${serverConfig.containerTypeId}`)
      .get();

    res.send(200, graphResponse);
    return;
  } catch (error: any) {
    res.send(500, { message: `Unable to list containers: ${error.message}` });
    return;
  }
};
