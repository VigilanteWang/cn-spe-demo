import { AppError, deserializeAppError } from "../../common/appError";
import type {
  AppErrorShape,
  IErrorResponseBody,
} from "../../common/contracts/errorContracts";

interface IReadApiErrorResponseOptions {
  operationLabel: string;
}

/**
 * 判断任意 JSON 是否满足统一错误对象的最小结构。
 * @param value 待校验的未知值。
 * @returns 如果值满足统一错误对象的最小结构，则返回 `true`。
 */
const isAppErrorShape = (value: unknown): value is AppErrorShape => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  // 这里只校验统一错误对象最稳定的最小字段：name + message。
  return (
    "name" in value &&
    typeof value.name === "string" &&
    "message" in value &&
    typeof value.message === "string"
  );
};

/**
 * 判断任意 JSON 是否满足统一 API 错误响应体的最小结构。
 * @param value 待校验的未知值。
 * @returns 如果值满足统一错误响应体的最小结构，则返回 `true`。
 */
const isApiErrorResponseBody = (
  value: unknown,
): value is IErrorResponseBody => {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }

  // 顶层有 error 还不够，里面也必须至少长得像统一 AppError。
  return isAppErrorShape(value.error);
};

/**
 * 从失败响应头中读取 `Retry-After` 秒数。
 * 当前前端大多数失败响应都来自本项目后端；
 * 当后端捕获到 Graph 节流错误时，会把上游 `Retry-After` 继续写回 HTTP header。
 * 因此这里仍然需要检查 response header，而不是只信任 body。
 */
const readRetryAfterFromHeaders = (headers: Headers): number | undefined => {
  const retryAfter =
    headers.get("Retry-After") ?? headers.get("retry-after") ?? undefined;

  if (!retryAfter) {
    return undefined;
  }

  // header 是字符串，这里统一收敛成前端错误对象里使用的秒数 number。
  const retryAfterSeconds = Number.parseInt(retryAfter, 10);
  return Number.isNaN(retryAfterSeconds) ? undefined : retryAfterSeconds;
};

/**
 * 尝试读取后端返回的结构化错误响应体。
 * @param response 失败的 Fetch 响应对象。
 * @returns 结构化错误响应体；无法解析时返回 `null`。
 */
export const tryReadApiErrorResponse = async (
  response: Response,
): Promise<IErrorResponseBody | null> => {
  try {
    // 先按未知 JSON 读取，再交给类型守卫决定能不能当成统一错误响应体使用。
    const payload = (await response.json()) as unknown;
    return isApiErrorResponseBody(payload) ? payload : null;
  } catch {
    // 非 JSON、空响应体、或 JSON 解析失败时，都回到调用方的兜底错误路径。
    return null;
  }
};

/**
 * 将失败响应转换成统一 `AppError`。
 * @param response 失败的 Fetch 响应对象。
 * @param options 读取错误时使用的兜底配置。
 * @returns 可直接向上抛出的统一错误实例。
 */
export const mapApiErrorResponseToAppError = async (
  response: Response,
  options: IReadApiErrorResponseOptions,
): Promise<AppError> => {
  const payload = await tryReadApiErrorResponse(response);
  // 只有响应体满足 { error: AppErrorShape } 合同时，才直接复用后端错误信息。
  const responseError = payload?.error;

  if (responseError) {
    // 把合同层 plain object 还原成前端统一使用的 AppError 实例。
    const appError = deserializeAppError(responseError);
    const retryAfter = readRetryAfterFromHeaders(response.headers);

    if (retryAfter === undefined) {
      // 后端没有透传节流等待时间时，直接返回反序列化后的原始错误即可。
      return appError;
    }

    return new AppError({
      name: appError.name,
      code: appError.code,
      message: appError.message,
      statusCode: appError.statusCode,
      originError: {
        // 保留后端已有的 originError 字段，只额外补上 header 中的 retryAfter。
        ...appError.originError,
        retryAfter,
      },
      details: appError.details,
    });
  }

  return new AppError({
    name: "AppError",
    // 当后端没有返回结构化错误体时，用“操作名 + HTTP 状态码”构造最小可读错误。
    message: `${options.operationLabel} failed: ${response.status}`,
    statusCode: response.status,
    originError: {
      // 当前 400 视为我们自己的请求/校验问题，其余状态先按网络/服务失败兜底。
      source: response.status === 400 ? "validation" : "network",
      retryAfter: readRetryAfterFromHeaders(response.headers),
    },
  });
};
