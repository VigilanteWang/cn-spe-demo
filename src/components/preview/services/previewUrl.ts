import type { IDriveItemExtended } from "../../../common/types";

/**
 * 支持预览的 Microsoft Office 文件扩展名。
 *
 * 用于判断“在新标签页打开”时是否优先跳转到 Office Online 的 `webUrl`。
 */
const OFFICE_EXTENSIONS = [
  "csv",
  "dic",
  "doc",
  "docm",
  "docx",
  "dotm",
  "dotx",
  "pot",
  "potm",
  "potx",
  "pps",
  "ppsm",
  "ppsx",
  "ppt",
  "pptm",
  "pptx",
  "xd",
  "xls",
  "xlsb",
  "xlsx",
  "sltx",
];

/** Visio 绘图文件扩展名。 */
const VISIO_EXTENSIONS = ["vsd", "vsdx"];

/**
 * 为 SharePoint 预览地址补上 `nb=true`，去除顶部横幅。
 *
 * 这里保持原组件的拼接策略：只负责附加参数，不额外改写或去重已有 query。
 *
 * @param url 原始预览地址。
 * @returns 附加 `nb=true` 后的地址。
 */
export const appendNoBannerParam = (url: string): string => {
  return url.includes("?") ? `${url}&nb=true` : `${url}?nb=true`;
};

/**
 * 解析本次预览请求真正要访问的 drive 和 file 标识。
 *
 * driveId 优先使用外层传入的 `containerId`，否则回退到文件自身的 parentReference。
 *
 * @param currentFile 当前正在预览的文件。
 * @param containerId 外层传入的容器 ID。
 * @returns 可用于 Graph `/preview` 请求的目标；缺少关键信息时返回 `null`。
 */
export const resolvePreviewRequestTarget = (
  currentFile: IDriveItemExtended | null,
  containerId?: string,
): { driveId: string; fileId: string } | null => {
  const driveId = containerId || currentFile?.parentReference?.driveId;
  const fileId = currentFile?.id;

  if (!driveId || !fileId) {
    return null;
  }

  return { driveId, fileId };
};

/**
 * 当 `/preview` 接口不可用时，回退到文件的 `webUrl`。
 *
 * @param currentFile 当前正在预览的文件。
 * @returns 可直接渲染的回退地址；没有 `webUrl` 时返回 `null`。
 */
export const resolvePreviewFallbackUrl = (
  currentFile: IDriveItemExtended | null,
): string | null => {
  if (!currentFile?.webUrl) {
    return null;
  }

  return appendNoBannerParam(currentFile.webUrl);
};

/**
 * 判断文件名是否属于 Office 或 Visio 格式。
 *
 * @param fileName 当前文件名。
 * @returns 是否应优先走 Office Online / Visio Online 的打开策略。
 */
export const isOfficeOrVisioFile = (fileName?: string | null): boolean => {
  const fileExtension = fileName?.split(".").pop()?.toLowerCase() || "";

  return (
    OFFICE_EXTENSIONS.includes(fileExtension) ||
    VISIO_EXTENSIONS.includes(fileExtension)
  );
};

/**
 * 解析“在新标签页打开”时真正要跳转的地址。
 *
 * 当前实现保持原组件的安全策略：
 * 1. Office/Visio 文件始终优先使用 `webUrl`
 * 2. 其他文件也优先使用 `webUrl`，只有没有 `webUrl` 时才回退 `previewUrl`
 *
 * 这样能尽量减少把 preview 临时令牌直接暴露在地址栏中的概率。
 *
 * @param currentFile 当前文件。
 * @param previewUrl 当前 iframe 使用的预览地址。
 * @returns 真正要打开的地址；无法打开时返回 `null`。
 */
export const resolveOpenInNewTabUrl = (
  currentFile: IDriveItemExtended | null,
  previewUrl: string,
): string | null => {
  if (!currentFile) {
    return null;
  }

  if (isOfficeOrVisioFile(currentFile.name)) {
    return currentFile.webUrl ?? null;
  }

  return currentFile.webUrl || previewUrl || null;
};

/**
 * 安全地在新标签页打开 URL。
 *
 * - 使用 `noopener,noreferrer` 防止新页面通过 `window.opener` 控制当前页面
 * - 尽量避免把来源页地址作为 Referer 传递
 *
 * @param url 目标地址。
 */
export const openInIsolatedTab = (url: string) => {
  const newWindow = window.open(url, "_blank", "noopener,noreferrer");
  if (newWindow) {
    newWindow.opener = null;
  }
};
