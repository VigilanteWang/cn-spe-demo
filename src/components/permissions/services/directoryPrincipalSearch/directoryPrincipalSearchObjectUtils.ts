/**
 * 把 graph 的 response 转换成 Record<string, unknown>，这样可以接纳任意数量属性的对象，相当于
 * type value = {
 *   [key: string]: unknown;
 * };
 */
/**
 * Graph SDK 响应形状不一，本模块又没有把它们的完整类型
 * 全部引进来，所以先将属性类型全设为 unknown，要求读取前，必须进行显式 Type Narrowing ，保证后续
 * 代码能安全使用。
 *
 * 例如，它接纳以下返回值，因为是 index signature，可以接纳无限数量属性，类型也可任意
 * 但是，使用前，必须像下面几个 function 那样进行 Type Narrowing ：
 * {
 *   objectId: "123",
 *   upn: "alice@contoso.com",
 *   enabled: true
 * }
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
