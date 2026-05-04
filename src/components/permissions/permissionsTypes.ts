/**
 * 容器权限弹窗属性。
 */
export interface IContainerPermissionDialogProps {
  open: boolean;
  containerId?: string;
  containerName?: string;
  onClose: () => void;
}
