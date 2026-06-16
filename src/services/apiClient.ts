/**
 * API 客户端公共基础层
 *
 * 本模块是所有后端 API 服务模块的通用基础，负责：
 * 1. 获取后端 API 专用 Access Token（通过 MGT globalProvider）
 * 2. 封装带 Bearer Token 的授权请求，统一注入 Authorization header
 *
 * 所有后端服务模块（backendApi、containerPermissionApi、downloadApi）
 * 都应从此处 import，不要各自重复实现 token 获取逻辑。
 */

import { Providers, ProviderState } from "@microsoft/mgt-element";
import { AppError, ensureErrorCause } from "../../common/appError";
import { clientConfig } from "../common/config";
import * as Scopes from "../common/scopes";

/**
 * 可选请求参数：用于透传 AbortSignal 到 fetch，支持统一取消链路。
 *
 * 各归档 API 函数通过此接口接收调用方传入的 AbortSignal，
 * 实现轮询/请求/流读取的统一中止。
 */
export interface IAbortRequestOptions {
  requestAbortSignal?: AbortSignal;
}

/**
 * 获取后端 API 专用 Access Token。
 *
 * 从全局 MGT Provider 获取 token，scope 为 "api://{apiClientId}/Container.Manage"。
 * 后端收到后通过 OBO 流程换取 Graph API token。
 *
 * @returns Access Token 字符串
 * @throws FrontendApiError 未登录或 token 获取失败时抛出
 *
 * 流程：
 * 1. 检查全局 Provider 是否已登录（ProviderState.SignedIn）
 * 2. 调用 provider.getAccessToken() 请求指定 scope 的 token
 * 3. MSAL 缓存命中则直接返回（静默获取）；过期则自动刷新（用户无感知）
 */
export async function getApiAccessToken(): Promise<string> {
  // 重用全局 provider 已登录用户的 token，避免 "no account selected" 错误
  const provider = Providers.globalProvider;
  if (provider.state !== ProviderState.SignedIn) {
    throw new AppError({
      name: "ApiClientError",
      code: "unauthorized",
      message: "You are not signed in.",
      statusCode: 401,
      originError: {
        source: "app",
      },
    });
  }

  try {
    const accessToken = await provider.getAccessToken({
      scopes: [
        `api://${clientConfig.apiEntraAppClientId}/${Scopes.SPEMBEDDED_CONTAINER_MANAGE}`,
      ],
    });
    return accessToken;
  } catch (error: unknown) {
    // 将底层鉴权异常标准化为稳定业务错误，避免 UI/调用方依赖控制台日志排查。
    throw new AppError({
      name: "ApiClientError",
      code: "token_acquisition_failed",
      message: "Failed to get access token.",
      statusCode: 401,
      originError: {
        source: "app",
        cause: ensureErrorCause(
          error,
          "Failed to get access token.",
          "ApiClientError",
        ),
      },
    });
  }
}

/**
 * 发送带 Bearer Token 的授权请求。
 *
 * 统一处理 token 获取和 Authorization header 注入；
 * 不判断 response.ok，由各领域模块根据自身错误类型自行处理。
 *
 * @param path   API 路径（以 "/" 开头，如 "/api/listContainers"）
 * @param init   fetch RequestInit（不含 Authorization，此处自动注入）
 * @param signal 可选 AbortSignal，透传到 fetch
 * @returns 原始 Response 对象
 * @throws 未登录或 token 获取失败时抛出 FrontendApiError（code: "unauthorized" 或 "token_acquisition_failed"）
 */
export async function sendAuthorizedRequest(
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  const token = await getApiAccessToken();

  return fetch(`${clientConfig.apiServerUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
    signal,
  });
}
