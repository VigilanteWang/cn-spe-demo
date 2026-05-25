import { FrontendApiError } from "../common/errors.ts";
import type {
  IPermissionApiErrorBody,
  IPermissionEntryBaseForUI,
} from "../../common/contracts/permissionCommonContracts";
import type { PermissionEntriesByTab } from "../components/permissions/models/permissionSharedModels";

/**
 * 表示权限相关后端 API 失败时的统一前端错误类型。
 *
 * 这个错误类型会在共享服务层补充权限接口常用的上下文，
 * 例如 `retryAfterSeconds` 和 `requestId`，方便上层 UI 统一展示与排障。
 */
export class PermissionApiError extends FrontendApiError {
  readonly retryAfterSeconds?: number;

  readonly requestId?: string;

  /**
   * 创建一个带权限接口上下文的前端错误对象。
   *
   * @param code 后端返回的稳定错误码；缺失时会由共享构建函数提供默认值。
   * @param message 面向前端展示或记录的错误消息。
   * @param options 附加错误上下文，例如重试秒数、请求 ID 和 HTTP 状态码。
   */
  constructor(
    code: string,
    message: string,
    options?: {
      retryAfterSeconds?: number;
      requestId?: string;
      statusCode?: number;
    },
  ) {
    super(code, message, {
      name: "PermissionApiError",
      statusCode: options?.statusCode,
    });
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.requestId = options?.requestId;
  }
}

/**
 * 把权限数组重新按 `people/groups` 页签结构分组。
 *
 * 这里保持一个共享映射入口，避免 container 和 item 权限接口
 * 分别维护重复的前端分组逻辑。
 *
 * @param entries 后端返回或前端流程中流转的扁平权限数组。
 * @returns 供权限对话框直接消费的按页签分组结果。
 */
export const mapPermissionEntriesToTabs = <
  TEntry extends IPermissionEntryBaseForUI,
>(
  entries: TEntry[],
): PermissionEntriesByTab<TEntry> => {
  const nextEntries: PermissionEntriesByTab<TEntry> = {
    people: [],
    groups: [],
  };

  for (const entry of entries) {
    // `principalType` 已经在共享合同层收窄为 people/groups，可直接路由到对应页签。
    nextEntries[entry.principalType].push(entry);
  }

  return nextEntries;
};

/**
 * 把权限接口的失败响应转换成统一的 `PermissionApiError`。
 *
 * 这个函数优先复用后端返回的稳定错误体；如果响应体缺失、不是 JSON，
 * 或字段不完整，则回退到前端可兜底的默认错误码和消息。
 *
 * @param response 权限接口返回的失败响应对象。
 * @param operationLabel 当前操作的人类可读标签，用于生成兜底错误消息。
 * @returns 带状态码、请求 ID、重试秒数等上下文的统一错误对象。
 */
export const buildPermissionApiError = async (
  response: Response,
  operationLabel: string,
): Promise<PermissionApiError> => {
  const payload = await tryReadErrorPayload(response);
  // 后端没有返回标准错误体时，统一回退到共享默认错误码，避免上层分支过碎。
  const code = payload?.code ?? "graphFailure";
  // 兜底消息至少保留操作名和 HTTP 状态，方便前端日志与人工排查。
  const message =
    payload?.message ?? `${operationLabel} failed: ${response.status}`;

  return new PermissionApiError(code, message, {
    retryAfterSeconds: payload?.retryAfterSeconds,
    requestId: payload?.requestId,
    statusCode: payload?.statusCode ?? response.status,
  });
};

/**
 * 尝试把失败响应解析成权限接口约定的错误体。
 *
 * @param response 需要读取响应体的失败响应对象。
 * @returns 解析成功时返回错误体；如果响应不是合法 JSON，则返回 `null`。
 */
const tryReadErrorPayload = async (
  response: Response,
): Promise<IPermissionApiErrorBody | null> => {
  try {
    // 有些失败响应可能只有纯文本或空体，这里捕获解析异常，交给上层走兜底逻辑。
    return (await response.json()) as IPermissionApiErrorBody;
  } catch {
    return null;
  }
};
