/**
 * 容器权限弹窗属性。
 */
export interface IContainerPermissionDialogProps {
  /** 控制对话框的打开和关闭。*/
  open: boolean;
  /** 当前选中容器的 ID，用于隔离不同容器的草稿状态。*/
  containerId?: string;
  /** 当前选中容器的显示名称。*/
  containerName?: string;
  /** 关闭弹窗时由页面层提供的回调。*/
  onClose: () => void;
}

/**
 * item 权限弹窗属性。
 */
export interface IItemPermissionDialogProps {
  /** 控制对话框的打开和关闭。*/
  open: boolean;
  /** 当前 item 所属 drive 的标识。*/
  driveId?: string;
  /** 当前选中的 item 标识。*/
  itemId?: string;
  /** 当前选中的 item 名称。*/
  itemName?: string;
  /** 关闭弹窗时由页面层提供的回调。*/
  onClose: () => void;
  /** 从 item 权限切换到容器权限时由父层提供的回调。*/
  onManageContainerPermission: () => void;
}
