/**
 * 把 unknown 安全收窄成可索引对象。
 *
 * Graph SDK 的错误或响应对象没有在本模块里使用完整类型，因此所有入口先经过这个小工具。
 */
export const readRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
};

/**
 * 读取可选字符串字段。
 */
export const readOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

/**
 * 读取可选布尔字段。
 */
export const readOptionalBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

/**
 * 读取字符串数组字段；Graph 缺字段时统一降级为空数组。
 */
export const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
};
