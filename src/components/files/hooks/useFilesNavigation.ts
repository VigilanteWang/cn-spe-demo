import { useCallback, useEffect, useState } from "react";
import { IFilesBreadcrumbItem } from "../filesTypes";

interface IUseFilesNavigationOptions {
  /** 加载指定目录内容的方法。 */
  loadItems: (itemId?: string) => Promise<void>;
  /** 清空表格选中状态的方法。 */
  clearSelection: () => void;
}

/**
 * 管理当前目录和面包屑导航。
 * @param options Hook 初始化参数。
 * @returns 当前目录与导航方法。
 */
export const useFilesNavigation = ({
  loadItems,
  clearSelection,
}: IUseFilesNavigationOptions) => {
  const [folderId, setFolderId] = useState("root");
  const [breadcrumbPath, setBreadcrumbPath] = useState<IFilesBreadcrumbItem[]>([
    { id: "root", name: "Root" },
  ]);

  /**
   * 切换到指定目录。
   * @param targetFolderId 目标目录 ID。
   * @param targetFolderName 目标目录名称。
   *
   * 流程：
   * 1. 清空当前行选择状态，避免跨目录保留选中项。
   * 2. 异步加载目标目录内容并更新当前目录 ID。
   * 3. 通过函数式 setState 更新面包屑，避免 await 之后读取到过期 breadcrumbPath：
   *    - 目标为 root：重置为 Root 单节点。
   *    - 目标已存在于路径：截断到目标节点（后退导航）。
   *    - 目标不在路径中：追加到末尾（前进导航）。
   */
  const navigateToFolder = useCallback(
    async (targetFolderId: string, targetFolderName: string) => {
      clearSelection();
      await loadItems(targetFolderId);
      setFolderId(targetFolderId);
      setBreadcrumbPath((previousPath) => {
        if (targetFolderId === "root") {
          return [{ id: "root", name: "Root" }];
        }

        // 判断该文件夹是否已在路径中（后退导航场景）。
        const existingIndex = previousPath.findIndex(
          (item) => item.id === targetFolderId,
        );

        if (existingIndex !== -1) {
          // 后退导航：截断路径。
          return previousPath.slice(0, existingIndex + 1);
        }

        // 前进导航：追加路径。
        return [
          ...previousPath,
          { id: targetFolderId, name: targetFolderName },
        ];
      });
    },
    [clearSelection, loadItems],
  );

  /**
   * 返回上一级目录。
   */
  const navigateToParentFolder = useCallback(async () => {
    if (breadcrumbPath.length <= 1) {
      return;
    }

    const parentFolder = breadcrumbPath[breadcrumbPath.length - 2];
    await navigateToFolder(parentFolder.id, parentFolder.name);
  }, [breadcrumbPath, navigateToFolder]);

  /**
   * 面包屑点击处理。
   * @param targetFolderId 目标目录 ID。
   * @param targetFolderName 目标目录名称。
   */
  const onBreadcrumbClick = useCallback(
    async (targetFolderId: string, targetFolderName: string) => {
      await navigateToFolder(targetFolderId, targetFolderName);
    },
    [navigateToFolder],
  );

  useEffect(() => {
    setFolderId("root");
    setBreadcrumbPath([{ id: "root", name: "Root" }]);
    clearSelection();
    void loadItems("root");
  }, [clearSelection, loadItems]);

  return {
    folderId,
    breadcrumbPath,
    navigateToFolder,
    navigateToParentFolder,
    onBreadcrumbClick,
  };
};
