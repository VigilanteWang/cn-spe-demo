import type { IDriveItemExtended } from "../../../common/types";

/**
 * Preview 模块对页面层暴露的属性接口。
 *
 * Files 页面通过这些属性控制预览弹窗的显示、导航和操作行为。
 */
export interface IPreviewProps {
  /** 控制预览弹窗是否打开。 */
  isOpen: boolean;
  /** 请求关闭预览弹窗。 */
  onDismiss: () => void;
  /** 当前正在预览的文件。 */
  currentFile: IDriveItemExtended | null;
  /** 当前可参与前后导航的文件列表。 */
  allFiles: IDriveItemExtended[];
  /** 请求切换到前一个或后一个文件时触发。 */
  onNavigate: (file: IDriveItemExtended) => void;
  /** 请求下载当前文件时触发。 */
  onDownload: (downloadUrl: string) => void;
  /** 请求删除当前文件时触发。 */
  onDelete: () => void;
  /** 当前容器 ID，可作为 driveId 的优先来源。 */
  containerId?: string;
}

/**
 * 预览内容区的状态模型。
 *
 * 这个类型把 iframe 区域真正关心的三类状态集中起来，
 * 让入口组件只负责编排，不直接混写渲染判断。
 */
export interface IPreviewContentState {
  /** 最终要加载到 iframe 里的预览地址。 */
  previewUrl: string;
  /** 是否正在请求预览地址。 */
  isLoading: boolean;
  /** 当前预览加载阶段的错误信息。 */
  error: string;
}

/**
 * 预览底部导航区的状态模型。
 */
export interface IPreviewNavigationState {
  /** 当前文件在可导航列表里的位置。 */
  currentIndex: number;
  /** 是否存在前一个文件。 */
  hasPrevious: boolean;
  /** 是否存在后一个文件。 */
  hasNext: boolean;
  /** 切换到前一个文件。 */
  goToPrevious: () => void;
  /** 切换到后一个文件。 */
  goToNext: () => void;
}
