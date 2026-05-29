import {
  Button,
  Dialog,
  DialogBody,
  DialogSurface,
  DialogTitle,
} from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { PreviewContent } from "./PreviewContent";
import { PreviewFooter } from "./PreviewFooter";
import { usePreviewStyles } from "./previewStyles";
import type {
  IPreviewContentState,
  IPreviewNavigationState,
} from "../models/previewTypes";

/**
 * Preview 弹窗骨架的属性接口。
 */
interface IPreviewDialogFrameProps {
  /** 弹窗是否打开。 */
  open: boolean;
  /** 当前预览文件的显示名称。 */
  fileName: string;
  /** 预览内容的加载/错误/URL 状态。 */
  previewState: IPreviewContentState;
  /** 上一页/下一页导航能力和回调。 */
  navigationState: Pick<
    IPreviewNavigationState,
    "hasPrevious" | "hasNext" | "goToPrevious" | "goToNext"
  >;
  /** 下载按钮是否禁用。 */
  isDownloadDisabled: boolean;
  /** 在新标签页打开按钮是否禁用。 */
  isOpenInNewTabDisabled: boolean;
  /** 弹窗关闭时的回调。 */
  onDismiss: () => void;
  /** 下载文件时的回调。 */
  onDownload: () => void;
  /** 在新标签页打开文件时的回调。 */
  onOpenInNewTab: () => void;
  /** 删除文件时的回调。 */
  onDelete: () => void;
}

/**
 * Preview 弹窗骨架组件。
 *
 * 职责：统一承载 Dialog 布局、标题行、关闭按钮、预览内容和底部操作栏。
 *
 * 设计原则：
 * - 只负责布局和样式组织，不涉及预览 URL 加载、状态管理逻辑。
 * - 所有状态和回调都从外层入口组件（PreviewEntry）传入。
 * - 子组件（PreviewContent、PreviewFooter）内部各自管理自己的行为和样式。
 *
 * @param props 弹窗布局所需的状态和事件。
 * @returns 渲染后的 Preview 弹窗。
 */
export const PreviewDialogFrame = ({
  open,
  fileName,
  previewState,
  navigationState,
  isDownloadDisabled,
  isOpenInNewTabDisabled,
  onDismiss,
  onDownload,
  onOpenInNewTab,
  onDelete,
}: IPreviewDialogFrameProps) => {
  const styles = usePreviewStyles();

  return (
    <Dialog
      open={open}
      onOpenChange={(_event, data) => {
        // 用户通过 Esc 或点击遮罩触发关闭时，调用上层的 onDismiss 回调。
        if (!data.open) {
          onDismiss();
        }
      }}
    >
      <DialogSurface className={styles.dialogSurface}>
        <DialogBody className={styles.dialogBody}>
          {/* 弹窗头部：文件名标题 + 关闭按钮。 */}
          <div className={styles.headerRow}>
            <DialogTitle className={styles.dialogTitle}>{fileName}</DialogTitle>
            {/* 右侧关闭按钮，同时支持 Esc 和鼠标点击关闭。 */}
            <Button
              appearance="subtle"
              icon={<DismissRegular />}
              onClick={onDismiss}
              aria-label="Close preview"
            />
          </div>

          {/* 预览内容区域：根据加载态、错误态和 URL 展示对应的界面状态。 */}
          <div className={styles.previewContainer}>
            <PreviewContent fileName={fileName} {...previewState} />
          </div>

          {/* 底部操作栏：导航按钮、下载、新标签页打开、删除等功能。 */}
          <PreviewFooter
            hasPrevious={navigationState.hasPrevious}
            hasNext={navigationState.hasNext}
            isDownloadDisabled={isDownloadDisabled}
            isOpenInNewTabDisabled={isOpenInNewTabDisabled}
            onPrevious={navigationState.goToPrevious}
            onNext={navigationState.goToNext}
            onDownload={onDownload}
            onOpenInNewTab={onOpenInNewTab}
            onDelete={onDelete}
          />
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
