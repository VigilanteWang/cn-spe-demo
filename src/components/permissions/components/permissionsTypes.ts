/**
 * 容器权限弹窗的输入属性。
 */
export interface IContainerPermissionDialogProps {
  /** 控制对话框是否打开。 */
  open: boolean;
  /** 当前正在管理的容器 ID。 */
  containerId?: string;
  /** 当前正在管理的容器显示名。 */
  containerName?: string;
  /** 请求关闭弹窗时由页面层执行的回调。 */
  onClose: () => void;
}

/**
 * Item 权限弹窗的输入属性。
 */
export interface IItemPermissionDialogProps {
  /** 控制对话框是否打开。 */
  open: boolean;
  /** 当前 item 所属 drive 的 ID。 */
  driveId?: string;
  /** 当前正在管理的 item ID。 */
  itemId?: string;
  /** 当前正在管理的 item 显示名。 */
  itemName?: string;
  /** 请求关闭弹窗时由页面层执行的回调。 */
  onClose: () => void;
  /** 从 item 权限切换到容器权限时触发的回调。 */
  onManageContainerPermission: () => void;
}
