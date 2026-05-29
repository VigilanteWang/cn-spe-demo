import type { IApiErrorResponseBody } from "../../common/contracts/apiErrorContracts";

/**
 * service 层归一化后的 API 错误信息。
 *
 * 这个结果会被各个前端 service 继续包装成自己的稳定错误类型，
 * 让上层组件不需要重复解析后端响应体。
 */
export interface IApiErrorResponseSummary {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
  requestId?: string;
  retryAfterSeconds?: number;
}

interface IReadApiErrorResponseOptions {
  fallbackCode: string;
  operationLabel: string;
}

/**
 * 判断任意 JSON 是否满足统一 API 错误响应体的最小结构。
 */
const isApiErrorResponseBody = (
  value: unknown,
): value is IApiErrorResponseBody => {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    "message" in value &&
    typeof value.message === "string" &&
    "statusCode" in value &&
    typeof value.statusCode === "number"
  );
};

/**
 * 尝试读取后端返回的结构化错误响应体。
 *
 * 如果响应体不是 JSON，或者 JSON 不满足共享合同结构，则返回 `null`，
 * 交给调用方走统一兜底文案。
 */
export const tryReadApiErrorResponse = async (
  response: Response,
): Promise<IApiErrorResponseBody | null> => {
  try {
    const payload = (await response.json()) as unknown;
    return isApiErrorResponseBody(payload) ? payload : null;
  } catch {
    return null;
  }
};

/**
 * 把失败响应转换成 service 层可复用的统一错误摘要。
 */
export const readApiErrorResponseSummary = async (
  response: Response,
  options: IReadApiErrorResponseOptions,
): Promise<IApiErrorResponseSummary> => {
  const payload = await tryReadApiErrorResponse(response);

  return {
    code: payload?.code ?? options.fallbackCode,
    message:
      payload?.message ??
      `${options.operationLabel} failed: ${response.status}`,
    statusCode: payload?.statusCode ?? response.status,
    details: payload?.details,
    requestId: payload?.requestId,
    retryAfterSeconds: payload?.retryAfterSeconds,
  };
};
