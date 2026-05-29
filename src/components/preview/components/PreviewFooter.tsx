import { Button } from "@fluentui/react-components";
import {
  ChevronLeftRegular,
  ChevronRightRegular,
  DeleteRegular,
  OpenRegular,
  SaveRegular,
} from "@fluentui/react-icons";
import { usePreviewStyles } from "./previewStyles";

interface IPreviewFooterProps {
  hasPrevious: boolean;
  hasNext: boolean;
  isDownloadDisabled: boolean;
  isOpenInNewTabDisabled: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onDownload: () => void;
  onOpenInNewTab: () => void;
  onDelete: () => void;
}

/**
 * 预览弹窗底部操作区。
 *
 * 左侧是前后导航按钮，右侧是下载、新标签页打开和删除按钮。
 *
 * @param props 导航状态和各类操作回调。
 * @returns 预览底部操作区。
 */
export const PreviewFooter = ({
  hasPrevious,
  hasNext,
  isDownloadDisabled,
  isOpenInNewTabDisabled,
  onPrevious,
  onNext,
  onDownload,
  onOpenInNewTab,
  onDelete,
}: IPreviewFooterProps) => {
  const styles = usePreviewStyles();

  return (
    <div className={styles.footerContainer}>
      {/* 左侧：前/后导航按钮，在可导航列表中没有更多文件时禁用。 */}
      <div className={styles.navigationButtons}>
        <Button
          icon={<ChevronLeftRegular />}
          disabled={!hasPrevious}
          onClick={onPrevious}
          aria-label="Previous file"
        />
        <Button
          icon={<ChevronRightRegular />}
          iconPosition="after"
          disabled={!hasNext}
          onClick={onNext}
          aria-label="Next file"
        />
      </div>

      <div className={styles.actionButtons}>
        {/* 下载按钮：使用 `@microsoft.graph.downloadUrl` 直链下载。 */}
        <Button
          icon={<SaveRegular />}
          onClick={onDownload}
          disabled={isDownloadDisabled}
          aria-label="Download file"
        >
          Download
        </Button>

        {/* 新标签页打开时默认优先使用 `webUrl`，减少暴露 preview 临时令牌。 */}
        <Button
          icon={<OpenRegular />}
          onClick={onOpenInNewTab}
          disabled={isOpenInNewTabDisabled}
          aria-label="Open in new tab"
        >
          Open in new tab
        </Button>

        {/* 删除按钮：回调父组件执行删除并关闭预览对话框。 */}
        <Button
          icon={<DeleteRegular />}
          onClick={onDelete}
          aria-label="Delete file"
        >
          Delete
        </Button>
      </div>
    </div>
  );
};
