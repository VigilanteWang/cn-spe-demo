/**
 * 判断文件是否支持 item link share 的所需信息。
 * 原则上，只有 office 文件支持 item link share。
 * 前后端都只依赖这三个字段：
 * - `name`：用于扩展名兜底
 * - `mimeType`：优先判断是否为支持的 Office 文件
 * - `isFolder`：文件夹一律不支持
 */
export interface IItemLinkPermissionTargetInfo {
  name?: string;
  mimeType?: string;
  isFolder: boolean;
}

const SUPPORTED_OFFICE_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  "application/vnd.ms-word.document.macroEnabled.12",
  "application/vnd.ms-word.template.macroEnabled.12",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
  "application/vnd.ms-excel.template.macroEnabled.12",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.presentationml.template",
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
  "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
  "application/vnd.ms-powerpoint.template.macroEnabled.12",
  "application/vnd.ms-powerpoint.slideshow.macroEnabled.12",
]);

const SUPPORTED_OFFICE_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".dotx",
  ".docm",
  ".dotm",
  ".xls",
  ".xlsx",
  ".xltx",
  ".xlsm",
  ".xltm",
  ".ppt",
  ".pptx",
  ".potx",
  ".ppsx",
  ".pptm",
  ".potm",
  ".ppsm",
]);

/**
 * 判断当前 item 是否支持 SharePoint Embedded 的 item-level link share。
 *
 * 规则固定为：
 * 1. 文件夹一律不支持
 * 2. 优先按 MIME 判断
 * 3. MIME 缺失时再按扩展名兜底
 *
 * @param target 目标 item 的最小元数据快照。
 * @returns 若属于受支持的 Office 文件则返回 `true`。
 */
export const isSupportedItemLinkPermissionTarget = (
  target: IItemLinkPermissionTargetInfo,
): boolean => {
  // 文件夹不支持 item-level link share，先在最前面直接拦截。
  if (target.isFolder) {
    return false;
  }

  // 优先使用后端返回的 MIME 类型判断，命中 allowlist 就可以立即确认支持。
  if (target.mimeType && SUPPORTED_OFFICE_MIME_TYPES.has(target.mimeType)) {
    return true;
  }

  // MIME 缺失或不在 allowlist 时，再把文件名统一转成小写做扩展名兜底判断。
  const normalizedName = target.name?.toLowerCase();

  // 连文件名都没有时，无法继续做扩展名判断，只能按不支持处理。
  if (!normalizedName) {
    return false;
  }

  // 只截取最后一个 `.` 之后的扩展名，避免把中间的点误判成文件类型。
  const lastDotIndex = normalizedName.lastIndexOf(".");
  const extension =
    lastDotIndex >= 0 ? normalizedName.slice(lastDotIndex) : undefined;

  // 只有解析出扩展名时才检查扩展名 allowlist，否则视为不支持。
  return extension ? SUPPORTED_OFFICE_EXTENSIONS.has(extension) : false;
};
