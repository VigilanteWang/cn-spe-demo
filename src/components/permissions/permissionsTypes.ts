/**
 * 容器权限弹窗属性。
 */
export interface IContainerPermissionDialogProps {
  open: boolean;
  containerName?: string;
  onClose: () => void;
}
