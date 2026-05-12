export type FrontendErrorCategory =
  | "api"
  | "validation"
  | "config"
  | "userAction";

/**
 * 前端业务错误的公共可选字段。
 *
 * 这里只保留最稳定的元信息，避免上层组件依赖某个模块的私有实现细节。
 */
export interface IFrontendBusinessErrorOptions {
  statusCode?: number;
  details?: Record<string, unknown>;
}

interface IFrontendBusinessErrorInit extends IFrontendBusinessErrorOptions {
  name: string;
  category: FrontendErrorCategory;
  code: string;
  message: string;
}

/**
 * 前端业务错误基类。
 *
 * 各模块可以在此基础上继续派生自己的稳定错误类型，
 * 让 UI 层优先根据 code/category 分支，而不是解析 message。
 */
export class FrontendBusinessError extends Error {
  readonly code: string;

  readonly category: FrontendErrorCategory;

  readonly statusCode?: number;

  readonly details?: Record<string, unknown>;

  constructor(init: IFrontendBusinessErrorInit) {
    super(init.message);
    this.name = init.name;
    this.code = init.code;
    this.category = init.category;
    this.statusCode = init.statusCode;
    this.details = init.details;
  }
}

/**
 * 共享 API 错误基类。
 */
export class FrontendApiError extends FrontendBusinessError {
  constructor(
    code: string,
    message: string,
    options?: IFrontendBusinessErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "FrontendApiError",
      category: "api",
      code,
      message,
      statusCode: options?.statusCode,
      details: options?.details,
    });
  }
}

/**
 * 共享验证错误基类。
 */
export class FrontendValidationError extends FrontendBusinessError {
  constructor(
    code: string,
    message: string,
    options?: IFrontendBusinessErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "FrontendValidationError",
      category: "validation",
      code,
      message,
      statusCode: options?.statusCode,
      details: options?.details,
    });
  }
}

/**
 * 共享配置错误基类。
 */
export class FrontendConfigError extends FrontendBusinessError {
  constructor(
    code: string,
    message: string,
    options?: IFrontendBusinessErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "FrontendConfigError",
      category: "config",
      code,
      message,
      statusCode: options?.statusCode,
      details: options?.details,
    });
  }
}

/**
 * 共享用户主动取消类错误基类。
 */
export class FrontendUserActionError extends FrontendBusinessError {
  constructor(
    code: string,
    message: string,
    options?: IFrontendBusinessErrorOptions & { name?: string },
  ) {
    super({
      name: options?.name ?? "FrontendUserActionError",
      category: "userAction",
      code,
      message,
      statusCode: options?.statusCode,
      details: options?.details,
    });
  }
}

/**
 * 读取最适合直接展示给 UI 的错误文案。
 */
export const readErrorMessage = (
  error: unknown,
  fallbackMessage: string,
): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
};
