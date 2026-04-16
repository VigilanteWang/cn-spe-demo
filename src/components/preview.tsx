/**
 * 文件预览组件模块
 *
 * 本模块负责：
 * 1. 在全屏对话框中展示文件预览（通过 iframe 加载 SharePoint 预览 URL）
 * 2. 支持前/后导航切换文件（仅限非文件夹文件）
 * 3. 提供下载、在新标签页打开、删除等操作按钮
 * 4. 处理不同文件类型的预览策略（Office 文档 vs 其他文件）
 *
 * 预览 URL 获取流程：
 * 1. 调用 Graph API POST /drives/{driveId}/items/{fileId}/preview
 * 2. 如果成功，使用返回的 getUrl（附加 &nb=true 去除顶部横幅）
 * 3. 如果失败，回退使用 webUrl
 *
 * 在新标签页打开的策略：
 * - Office/Visio 文档：打开 webUrl（进入 Office Online 编辑器）
 * - 其他文件：打开 previewUrl（只读预览）
 *
 * 组件结构：
 *   <Dialog fullscreen>
 *     <DialogTitle + Close 按钮>
 *     <iframe previewUrl />       ← 文件预览区域
 *     <导航按钮（前/后）>
 *     <操作按钮（下载/新标签页/删除）>
 *   </Dialog>
 **/

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  Button,
  makeStyles,
  tokens,
  Spinner,
} from "@fluentui/react-components";
import {
  ChevronLeftRegular,
  ChevronRightRegular,
  SaveRegular,
  DeleteRegular,
  OpenRegular,
  DismissRegular,
} from "@fluentui/react-icons";
import { DriveItem } from "@microsoft/microsoft-graph-types-beta";
import { Providers } from "@microsoft/mgt-element";
import { IDriveItemExtended } from "../common/types";

/**
 * 预览组件属性接口
 *
 * 父组件 (Files) 通过这些属性控制预览行为：
 * - isOpen / onDismiss: 控制对话框显示/关闭
 * - currentFile / allFiles: 当前预览文件和可导航的文件列表
 * - onNavigate: 点击前/后时回调父组件更新 currentFile
 * - onDownload / onDelete: 操作按钮的回调
 * - containerId: 容器 ID（Drive ID），用于构建 Graph API 路径
 **/
interface IPreviewProps {
  isOpen: boolean;
  onDismiss: () => void;
  currentFile: IDriveItemExtended | null;
  allFiles: IDriveItemExtended[];
  onNavigate: (file: IDriveItemExtended) => void;
  onDownload: (downloadUrl: string) => void;
  onDelete: () => void;
  containerId?: string;
}

const useStyles = makeStyles({
  dialogSurface: {
    width: "95vw",
    height: "95vh",
    maxWidth: "95vw",
    maxHeight: "95vh",
    padding: "0",
  },
  dialogBody: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    padding: "15px",
    maxHeight: "none",
  },
  dialogTitle: {
    marginBottom: "5px",
    fontSize: "20px",
    fontWeight: "600",
  },
  previewContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    position: "relative",
    minHeight: "0",
  },
  previewFrame: {
    flex: 1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: "4px",
    width: "100%",
    minHeight: 0,
    height: "100%",
  },
  navigationContainer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "5px",
    "@media (max-width: 768px)": {
      flexDirection: "column",
      gap: "10px",
    },
  },
  navigationButtons: {
    display: "flex",
    gap: "10px",
  },
  actionButtons: {
    display: "flex",
    gap: "10px",
    "@media (max-width: 768px)": {
      width: "100%",
      justifyContent: "center",
    },
  },
  loadingContainer: {
    flex: 1,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "column",
    gap: "10px",
    minHeight: 0,
    height: "100%",
  },
});

/**
 * 支持预览的 Microsoft Office 文件扩展名
 * 包括 Word、Excel、PowerPoint、Visio 等格式
 * 用于判断“在新标签页打开”时是开 webUrl（Online 编辑器）还是 previewUrl
 **/
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
/** Visio 绘图文件扩展名 */
const VISIO_EXTENSIONS = ["vsd", "vsdx"];

/**
 * 安全地在新标签页打开 URL：
 * - 使用 noopener/noreferrer 防止新页面通过 window.opener 回跳控制当前页面
 * - 避免将来源页面 URL 作为 Referer 传递
 */
const openInIsolatedTab = (url: string) => {
  const newWindow = window.open(url, "_blank", "noopener,noreferrer");
  if (newWindow) {
    newWindow.opener = null;
  }
};

/**
 * 文件预览组件
 *
 * 状态管理：
 * - previewUrl: 当前文件的预览 URL（加载到 iframe 中）
 * - isLoading: 是否正在获取预览 URL
 * - error: 错误信息（如预览不可用）
 *
 * 导航逻辑：
 * - 通过 allFiles 数组的 index 判断是否有前/后文件
 * - 点击前/后按钮时调用 onNavigate 回调父组件
 **/
export const Preview: React.FC<IPreviewProps> = ({
  isOpen,
  onDismiss,
  currentFile,
  allFiles,
  onNavigate,
  onDownload,
  onDelete,
  containerId,
}) => {
  const styles = useStyles();
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // 当前文件在 allFiles 中的索引（用于前/后导航）
  const currentIndex = currentFile
    ? allFiles.findIndex((file) => file.id === currentFile.id)
    : -1;

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < allFiles.length - 1;

  // 当文件变化或对话框打开时，重新加载预览 URL
  useEffect(() => {
    if (currentFile && isOpen) {
      loadPreviewUrl();
    }
  }, [currentFile, isOpen]);

  /**
   * 加载文件预览 URL
   *
   * 流程：
   * 1. 调用 Graph API /preview 端点获取预览 URL
   * 2. 成功时附加 &nb=true 参数（去除 SharePoint 顶部横幅）
   * 3. 失败时回退使用 webUrl
   **/
  const loadPreviewUrl = async () => {
    if (!currentFile) return;

    setIsLoading(true);
    setError("");

    try {
      const graphClient = Providers.globalProvider.graph.client;

      // Use the container ID passed from parent or get from file's parent reference
      const driveId = containerId || currentFile.parentReference?.driveId;
      const fileId = currentFile.id;

      if (!driveId || !fileId) {
        setError("Unable to get drive or file information");
        setIsLoading(false);
        return;
      }

      // Try to get preview URL using Graph API
      try {
        const previewResponse = await graphClient
          .api(`/drives/${driveId}/items/${fileId}/preview`)
          .post({});

        if (previewResponse.getUrl) {
          // Add &nb=true parameter to remove the top banner
          const urlWithNoBanner = previewResponse.getUrl.includes("?")
            ? `${previewResponse.getUrl}&nb=true`
            : `${previewResponse.getUrl}?nb=true`;
          setPreviewUrl(urlWithNoBanner);
        } else {
          // Fallback to webUrl if preview is not available
          if (currentFile.webUrl) {
            // Also add &nb=true to webUrl for consistency
            const urlWithNoBanner = currentFile.webUrl.includes("?")
              ? `${currentFile.webUrl}&nb=true`
              : `${currentFile.webUrl}?nb=true`;
            setPreviewUrl(urlWithNoBanner);
          } else {
            setError("Preview not available for this file");
          }
        }
      } catch (previewError) {
        console.warn(
          "Preview API failed, falling back to webUrl:",
          previewError,
        );
        // Fallback to webUrl
        if (currentFile.webUrl) {
          // Add &nb=true parameter to remove the top banner
          const urlWithNoBanner = currentFile.webUrl.includes("?")
            ? `${currentFile.webUrl}&nb=true`
            : `${currentFile.webUrl}?nb=true`;
          setPreviewUrl(urlWithNoBanner);
        } else {
          setError("Preview not available for this file");
        }
      }
    } catch (err) {
      console.error("Error loading preview:", err);
      setError("Failed to load preview");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 导航到上一个文件
   * 通过 onNavigate 回调通知父组件更新 currentFile，触发预览 URL 重载
   **/
  const handlePrevious = () => {
    if (hasPrevious) {
      const previousFile = allFiles[currentIndex - 1];
      onNavigate(previousFile);
    }
  };

  /**
   * 导航到下一个文件
   * 通过 onNavigate 回调通知父组件更新 currentFile，触发预览 URL 重载
   **/
  const handleNext = () => {
    if (hasNext) {
      const nextFile = allFiles[currentIndex + 1];
      onNavigate(nextFile);
    }
  };

  /**
   * 在新标签页打开文件
   * - Office/Visio 文档：打开 webUrl（进入 Office Online 编辑模式）
   * - 其他文件：打开 previewUrl（只读预览）
   **/
  const handleOpenInNewTab = () => {
    if (!currentFile) return;

    const fileExtension =
      currentFile.name?.split(".").pop()?.toLowerCase() || "";

    const isOfficeOrVisio =
      OFFICE_EXTENSIONS.includes(fileExtension) ||
      VISIO_EXTENSIONS.includes(fileExtension);

    // 优先使用 webUrl，减少在地址栏暴露 preview 临时令牌的概率；不可用时再回退 previewUrl
    const targetUrl = isOfficeOrVisio
      ? currentFile.webUrl
      : currentFile.webUrl || previewUrl;

    if (targetUrl) {
      openInIsolatedTab(targetUrl);
    }
  };

  /**
   * 触发文件下载
   * 通过 onDownload 回调传入文件的直链 URL，由父组件 Files 调用隐藏 <a> 标签触发浏览器下载
   **/
  const handleDownload = () => {
    if (currentFile?.downloadUrl) {
      onDownload(currentFile.downloadUrl);
    }
  };

  if (!currentFile) return null;

  // 渲染全屏对话框：关闭时调用 onDismiss，并清空预览状态
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(event, data) => !data.open && onDismiss()}
    >
      <DialogSurface className={styles.dialogSurface}>
        <DialogBody className={styles.dialogBody}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <DialogTitle className={styles.dialogTitle}>
              {currentFile.name}
            </DialogTitle>
            <Button
              appearance="subtle"
              icon={<DismissRegular />}
              onClick={onDismiss}
              aria-label="Close preview"
            />
          </div>

          <div className={styles.previewContainer}>
            {/* isLoading: 显示加载转轮 | error: 显示错误信息 | previewUrl: 渲染 iframe | 否则提示无预览 */}
            {isLoading ? (
              <div className={styles.loadingContainer}>
                <Spinner size="large" />
                <div>Loading preview...</div>
              </div>
            ) : error ? (
              <div className={styles.loadingContainer}>
                <div>Error: {error}</div>
              </div>
            ) : previewUrl ? (
              <>
                {/*  sandbox：保留预览必需能力，避免弹窗逃逸并减少跨域隔离削弱 */}
                <iframe
                  src={previewUrl}
                  className={styles.previewFrame}
                  title={`Preview of ${currentFile.name}`}
                  sandbox="allow-same-origin allow-scripts allow-forms allow-downloads allow-popups"
                  referrerPolicy="no-referrer"
                />
              </>
            ) : (
              <div className={styles.loadingContainer}>
                <div>No preview available</div>
              </div>
            )}
          </div>

          <div className={styles.navigationContainer}>
            {/* 左侧：前/后导航按钮，在 allFiles 中没有更多文件时禁用 */}
            <div className={styles.navigationButtons}>
              <Button
                icon={<ChevronLeftRegular />}
                disabled={!hasPrevious}
                onClick={handlePrevious}
                aria-label="Previous file"
              ></Button>
              <Button
                icon={<ChevronRightRegular />}
                iconPosition="after" // 图标在文字右侧
                disabled={!hasNext}
                onClick={handleNext}
                aria-label="Next file"
              ></Button>
            </div>

            <div className={styles.actionButtons}>
              {/* 下载按钮：使用 @microsoft.graph.downloadUrl 直链下载 */}
              <Button
                icon={<SaveRegular />}
                onClick={handleDownload}
                aria-label="Download file"
              >
                Download
              </Button>
              {/* 新标签页打开，默认webUrl（编辑模式）, 非Office文件会显示access denied，只有在没有webUrl时才使用previewUrl，保证文件安全 */}
              <Button
                icon={<OpenRegular />}
                onClick={handleOpenInNewTab}
                aria-label="Open in new tab"
              >
                Open in new tab
              </Button>
              {/* 删除按钮：回调父组件执行删除并关闭预览对话框 */}
              <Button
                icon={<DeleteRegular />}
                onClick={onDelete}
                aria-label="Delete file"
              >
                Delete
              </Button>
            </div>
          </div>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

export default Preview;
