/**
 * 读取 Graph 对象为 Record。
 *
 * 这是边界读取层最基础的一步：先保证“能不能当对象看”，
 * 再决定后面是否去取字符串、数组或嵌套字段。
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
  // item is string 是 TypeScript 的 type predicate，告诉编译器 "如果函数返回 true，那么这个 item 就是 string 类型"。
  return value.filter((item): item is string => typeof item === "string");
};

/**
 * 读取必填非空字符串。
 *
 * 这里集中抛错是为了让解析层和映射层都用同一套失败语义，
 * 避免每个调用点各写一套 if/throw。
 */
export const readRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value === "string" && value) {
    return value;
  }

  throw new Error(`Missing required ${fieldName}.`);
};
