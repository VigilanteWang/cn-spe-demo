import type { Request } from "restify";
import { createValidationError } from "./appErrorHelpers";

/**
 * 读取 Graph 返回值为普通对象。
 */
export const readGraphToRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
};

/**
 * 读取可选非空字符串。
 */
export const readOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

/**
 * 读取字符串数组，并过滤掉非字符串项。
 */
export const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
};

/**
 * 读取必填非空字符串。
 */
export const readRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value === "string" && value) {
    return value;
  }

  throw createValidationError(`Missing required ${fieldName}.`);
};

/**
 * 读取可选数字。
 *
 * Graph 正常会返回 number，但测试桩或边界场景里也可能是可解析字符串，
 * 这里统一做一次宽松收窄，保证最终使用方拿到稳定 number。
 */
export const readOptionalNumberLike = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

/**
 * 从请求路由参数中读取 driveId。
 *
 * @param req Restify 请求对象。
 * @returns driveId；如果不存在或类型不合法则返回 `undefined`。
 */
export const readDriveId = (req: Request): string | undefined => {
  const paramsRecord = readGraphToRecord(req.params);
  return readOptionalString(paramsRecord.driveId);
};

/**
 * 从请求路由参数中读取 itemId。
 *
 * @param req Restify 请求对象。
 * @returns itemId；如果不存在或类型不合法则返回 `undefined`。
 */
export const readItemId = (req: Request): string | undefined => {
  const paramsRecord = readGraphToRecord(req.params);
  return readOptionalString(paramsRecord.itemId);
};
