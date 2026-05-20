/**
 * 将 ISO 日期时间格式化为表格友好的文案。
 *
 * 规则：
 * - 24 小时内：仅显示一个层级的相对时间（hour/min/sec）
 * - 超过 24 小时：仅显示日期
 * - 无效值：返回原始输入，避免吞掉后端数据异常
 *
 * @param dateTime ISO 日期时间字符串。
 * @param nowMs 当前时间戳，默认使用系统当前时间，方便测试时注入。
 * @returns 用于表格列展示的时间文案。
 */
export const formatDateTimeColumnValue = (
  dateTime?: string,
  nowMs = Date.now(),
): string => {
  // 空值直接返回空字符串，避免在表格里出现 undefined/null 文案。
  if (!dateTime) {
    return "";
  }

  // 将 ISO 字符串转换为毫秒时间戳，后续所有计算统一用数字更直观。
  const timestamp = new Date(dateTime).getTime();

  // 解析失败时返回原始值，帮助我们在界面上暴露异常数据，方便排查后端问题。
  if (Number.isNaN(timestamp)) {
    return dateTime;
  }

  // 用“当前时间 - 目标时间”得到时间差；正数表示过去，负数表示未来。
  const diffMs = nowMs - timestamp;

  // 仅在“过去 24 小时内”显示相对时间，超过范围统一显示日期，保证表格信息密度稳定。
  if (diffMs >= 0 && diffMs < 24 * 60 * 60 * 1000) {
    // 毫秒转秒并向下取整，确保文案稳定（例如 59.9 秒仍显示 59 sec）。
    const diffSeconds = Math.floor(diffMs / 1000);

    // 小于 1 分钟时显示秒级文案；最小值钳制为 1，避免出现 "0 sec ago"。
    if (diffSeconds < 60) {
      const seconds = Math.max(1, diffSeconds);
      return `${seconds} sec ago`;
    }

    // 满 1 分钟后改为分钟级文案，避免秒级数字快速跳动影响可读性。
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
      return `${diffMinutes} min ago`;
    }

    // 满 1 小时后显示小时级文案，并处理单复数（1 hour / 2 hours）。
    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  // 超出 24 小时（或未来时间）时退回本地日期格式，减少相对时间带来的歧义。
  return new Date(timestamp).toLocaleDateString();
};
