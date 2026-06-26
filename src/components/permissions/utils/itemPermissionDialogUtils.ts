/**
 * Item 权限弹窗头部展示状态。
 */
export interface IItemPermissionDialogHeaderState {
  /** 标题区展示的 item 名称。 */
  displayedItemName: string;
  /** 截断后的 item 名称。 */
  truncatedItemName?: string;
  /** 是否禁用“管理容器权限”入口。 */
  isManageContainerPermissionDisabled: boolean;
}

/**
 * 把过长的 item 名称截断到指定长度，避免标题区被撑破。
 *
 * @param itemName 当前 item 名称。
 * @param maxLength 允许展示的最大字符数。
 * @returns 适合放进弹窗标题区的短名称。
 */
const truncateItemName = (itemName: string, maxLength = 32) => {
  if (itemName.length <= maxLength) {
    return itemName;
  }

  return `${itemName.slice(0, Math.max(0, maxLength - 3))}...`;
};

/**
 * 统一生成 Item 权限弹窗头部所需的展示派生值。
 *
 * @param itemName 当前 item 名称。
 * @param isApplyingPermissions 当前是否处于 Apply 中。
 * @returns 头部展示所需的名称和交互状态。
 */
export const buildItemPermissionDialogHeaderState = (
  itemName: string | undefined,
  isApplyingPermissions: boolean,
): IItemPermissionDialogHeaderState => ({
  displayedItemName: itemName ?? "<No item selected>",
  truncatedItemName: itemName ? truncateItemName(itemName) : undefined,
  isManageContainerPermissionDisabled: isApplyingPermissions,
});
