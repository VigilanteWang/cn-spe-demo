import { BackendValidationError } from "../common/errors";

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

  throw new BackendValidationError(`Missing required ${fieldName}.`);
};
