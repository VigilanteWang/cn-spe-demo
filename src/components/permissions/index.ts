/**
 * 权限模块统一导出入口。
 *
 * 页面层从这里拿容器和 Item 两类弹窗，
 * 不需要关心内部组件、Hook 和工具函数的拆分细节。
 */
export { ContainerPermissionDialog } from "./ContainerPermissionDialog";
export { ItemPermissionDialog } from "./ItemPermissionDialog";
export type {
  IContainerPermissionDialogProps,
  IItemPermissionDialogProps,
} from "./components/permissionsTypes";
