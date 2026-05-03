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
  if (!dateTime) {
    return "";
  }

  const timestamp = new Date(dateTime).getTime();

  if (Number.isNaN(timestamp)) {
    return dateTime;
  }

  const diffMs = nowMs - timestamp;

  if (diffMs >= 0 && diffMs < 24 * 60 * 60 * 1000) {
    const diffSeconds = Math.floor(diffMs / 1000);

    if (diffSeconds < 60) {
      const seconds = Math.max(1, diffSeconds);
      return `${seconds} sec ago`;
    }

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
      return `${diffMinutes} min ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  return new Date(timestamp).toLocaleDateString();
};