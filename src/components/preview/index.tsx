import { useCallback } from "react";
import { PreviewDialogFrame } from "./components/PreviewDialogFrame";
import type { IPreviewProps } from "./models/previewTypes";
import { usePreviewNavigation } from "./hooks/usePreviewNavigation";
import { usePreviewUrl } from "./hooks/usePreviewUrl";
import {
  openInIsolatedTab,
  resolveOpenInNewTabUrl,
} from "./services/previewUrl";

/**
 * 文件预览组件模块。
 *
 * 本模块负责：
 * 1. 在全屏对话框中展示文件预览（通过 iframe 加载 SharePoint 预览 URL）
 * 2. 支持前/后导航切换文件（仅限非文件夹文件）
 * 3. 提供下载、在新标签页打开、删除等操作按钮
 * 4. 处理不同文件类型的预览策略（Office 文档 vs 其他文件）
 *
 * 当前结构按和 `files`、`permissions` 一致的目录模块组织：
 * - `index.tsx` 负责页面级编排
 * - `hooks/` 管理预览 URL 与导航状态
 * - `services/` 放纯函数和浏览器辅助函数
 * - `components/` 承载 Dialog 骨架与内容区
 */

/**
 * Preview 模块入口组件。
 *
 * 这里负责把页面层传入的文件上下文、导航能力和各类操作回调
 * 组装成可复用的预览弹窗骨架。
 *
 * @param props 预览弹窗的外部属性。
 * @returns 渲染后的文件预览弹窗；没有当前文件时不渲染。
 */
export const Preview = ({
  isOpen,
  onDismiss,
  currentFile,
  allFiles,
  onNavigate,
  onDownload,
  onDelete,
  containerId,
  actionError = null,
}: IPreviewProps) => {
  // 统一管理当前文件的预览地址、加载态和错误态。
  const previewState = usePreviewUrl({
    isOpen,
    currentFile,
    containerId,
  });

  // 基于当前文件在列表中的位置，计算前后切换能力和导航回调。
  const navigationState = usePreviewNavigation({
    allFiles,
    currentFile,
    onNavigate,
  });

  /**
   * 触发文件下载。
   *
   * 通过 `onDownload` 回调传入文件的直链 URL，由父组件 Files
   * 调用隐藏 `<a>` 标签触发浏览器下载。
   */
  const handleDownload = useCallback(() => {
    if (currentFile?.downloadUrl) {
      onDownload(currentFile.downloadUrl);
    }
  }, [currentFile?.downloadUrl, onDownload]);

  /**
   * 在新标签页打开文件。
   *
   * Office/Visio 文档优先打开 `webUrl`；
   * 其他文件也优先使用 `webUrl`，只有缺失时才回退 `previewUrl`。
   */
  const handleOpenInNewTab = useCallback(() => {
    const targetUrl = resolveOpenInNewTabUrl(
      currentFile,
      previewState.previewUrl,
    );

    // 只在能够解析出有效目标地址时才打开独立标签页。
    if (targetUrl) {
      openInIsolatedTab(targetUrl);
    }
  }, [currentFile, previewState.previewUrl]);

  // 没有选中文件时不渲染弹窗，避免展示残留标题或操作按钮。
  if (!currentFile) {
    return null;
  }

  // 提前计算“新标签页打开”目标地址，供按钮禁用态和点击行为共用。
  const openInNewTabTarget = resolveOpenInNewTabUrl(
    currentFile,
    previewState.previewUrl,
  );

  return (
    <PreviewDialogFrame
      open={isOpen}
      fileName={currentFile.name || ""}
      previewState={previewState}
      actionError={actionError}
      navigationState={navigationState}
      // 下载依赖 Graph 返回的 downloadUrl，缺失时禁用按钮。
      isDownloadDisabled={!currentFile.downloadUrl}
      // 无法解析出可打开地址时禁用“在新标签页打开”。
      isOpenInNewTabDisabled={!openInNewTabTarget}
      onDismiss={onDismiss}
      onDownload={handleDownload}
      onOpenInNewTab={handleOpenInNewTab}
      onDelete={onDelete}
    />
  );
};

export type { IPreviewProps } from "./models/previewTypes";
export default Preview;
