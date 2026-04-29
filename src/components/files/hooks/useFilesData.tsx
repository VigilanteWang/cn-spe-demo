import { useCallback, useRef, useState } from "react";
import { Providers } from "@microsoft/mgt-element";
import { DocumentRegular, FolderRegular } from "@fluentui/react-icons";
import {
  DataGridProps,
  OnSelectionChangeData,
  SelectionItemId,
} from "@fluentui/react-components";
import { IDriveItemExtended } from "../../../common/types";
import { IDriveItemWithDownloadUrl } from "../filesTypes";

interface IUseFilesDataOptions {
  /** 当前容器 ID。 */
  containerId: string;
}

/**
 * 管理文件列表和表格选中状态。
 * @param options Hook 初始化参数。
 * @returns 文件列表状态与操作方法。
 */
export const useFilesData = ({ containerId }: IUseFilesDataOptions) => {
  const [driveItems, setDriveItems] = useState<IDriveItemExtended[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<SelectionItemId>>(
    new Set<SelectionItemId>(),
  );
  // 记录 loadItems 的最新请求序号，避免旧请求因为慢一步返回而覆盖新目录数据。
  const [currentFolderId, setCurrentFolderId] = useState("root");
  const loadRequestSequenceRef = useRef(0);

  /**
   * 加载指定目录的子项。
   * @param itemId 目录 ID。
   * @returns Promise。
   *
   * 流程：
   * 1. 调用 Graph API 获取指定文件夹的子项
   * 2. 将 DriveItem 转换为 IDriveItemExtended（添加 UI 辅助属性）
   * 3. 更新 driveItems 状态和当前 folderId
   */
  const loadItems = useCallback(
    async (itemId = "root") => {
      try {
        const graphClient = Providers.globalProvider.graph.client;
        // 为本次请求分配序号；仅允许最新一次请求落盘。
        const requestSequence = ++loadRequestSequenceRef.current;
        const graphResponse = await graphClient
          .api(`/drives/${containerId}/items/${itemId}/children`)
          .get();

        // 如果当前请求不是最新请求，直接丢弃结果，避免覆盖新目录状态。
        if (requestSequence !== loadRequestSequenceRef.current) {
          return;
        }

        const items = (graphResponse.value as IDriveItemWithDownloadUrl[]).map(
          (driveItem) => ({
            ...driveItem,
            isFolder: Boolean(driveItem.folder),
            modifiedByName:
              driveItem.lastModifiedBy?.user?.displayName ?? "unknown",
            iconElement: driveItem.folder ? <FolderRegular /> : <DocumentRegular />,
            downloadUrl: driveItem["@microsoft.graph.downloadUrl"],
          }),
        );

        setDriveItems(items);
        setCurrentFolderId(itemId);
      } catch (error: unknown) {
        console.error(
          `Failed to load items: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    [containerId],
  );

  /**
   * 同步表格选中状态。
   * @param _event 事件对象。
   * @param data DataGrid 选中数据。
   *
   * 将选中的行 ID 集合同步到 selectedRows 状态，供工具栏下载/删除按钮判断是否有选中项。
   */
  const onSelectionChange: DataGridProps["onSelectionChange"] = (
    _event: React.MouseEvent | React.KeyboardEvent,
    data: OnSelectionChangeData,
  ) => {
    setSelectedRows(data.selectedItems);
  };

  /**
   * 清空当前选中项。
   */
  const clearSelection = useCallback(() => {
    setSelectedRows(new Set<SelectionItemId>());
  }, []);

  /**
   * 供外部直接替换选中状态。
   * @param nextSelectedRows 新的选中集合。
   */
  const updateSelectedRows = useCallback(
    (nextSelectedRows: Set<SelectionItemId>) => {
      setSelectedRows(nextSelectedRows);
    },
    [],
  );

  return {
    driveItems,
    selectedRows,
    currentFolderId,
    loadItems,
    onSelectionChange,
    clearSelection,
    updateSelectedRows,
  };
};
