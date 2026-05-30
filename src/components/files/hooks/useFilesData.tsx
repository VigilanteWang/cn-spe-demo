import { useCallback, useEffect, useRef, useState } from "react";
import { Providers } from "@microsoft/mgt-element";
import { DocumentRegular, FolderRegular } from "@fluentui/react-icons";
import {
  DataGridProps,
  OnSelectionChangeData,
  SelectionItemId,
} from "@fluentui/react-components";
import { IDriveItemExtended } from "../../../common/types";
import { IDriveItemWithDownloadUrl } from "../filesTypes";
import {
  collectModifiedByUserIds,
  fetchUserPhotoUrlMap,
  fetchUserPresenceMap,
} from "../services/peopleEnrichment";
import { normalizeFilesOperationError } from "../services/filesErrors";

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
  // driveItems 是表格主数据源，任何列表渲染都以它为准。
  const [driveItems, setDriveItems] = useState<IDriveItemExtended[]>([]);
  // selectedRows 保存 DataGrid 当前多选结果，供批量操作按钮使用。
  const [selectedRows, setSelectedRows] = useState<Set<SelectionItemId>>(
    new Set<SelectionItemId>(),
  );
  // 记录 loadItems 的最新请求序号，避免旧请求因为慢一步返回而覆盖新目录数据。
  const [currentFolderId, setCurrentFolderId] = useState("root");
  // ref 不会触发重渲染，适合保存“跨异步请求共享”的可变状态。
  const loadRequestSequenceRef = useRef(0);
  // userId -> object URL 缓存，减少重复请求头像并降低 Graph 压力。
  const photoCacheRef = useRef(new Map<string, string>());
  // 列表主加载失败会暴露给页面层，在进度区域统一展示。
  const [loadError, setLoadError] = useState<ReturnType<
    typeof normalizeFilesOperationError
  > | null>(null);

  /**
   * 释放当前 hook 生命周期内缓存的头像 object URL。
   * 这里不再按“每次切目录”清理，而是在组件卸载时统一释放，
   * 从而允许同一批用户头像在多个目录切换中复用。
   */
  const revokeCachedPhotoUrls = useCallback(() => {
    // 逐个释放浏览器内存中的 Blob URL，避免长时间使用后内存增长。
    photoCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
    // 释放后立刻清空缓存，确保后续不会继续引用失效 URL。
    photoCacheRef.current.clear();
  }, []);

  // effect 返回清理函数：组件卸载时自动执行 revokeCachedPhotoUrls。
  useEffect(() => revokeCachedPhotoUrls, [revokeCachedPhotoUrls]);

  /**
   * 加载指定目录的子项。
   * @param itemId 目录 ID。
   * @returns Promise。
   *
   * 流程：
   * 1. 调用 Graph API 获取指定文件夹的子项
   * 2. 将 DriveItem 转换为 IDriveItemExtended（添加 UI 辅助属性）
   * 3. 批量拉取修改者的 Teams Presence 状态，失败时静默降级
   * 4. 更新 driveItems 状态和当前 folderId
   */
  const loadItems = useCallback(
    async (itemId = "root"): Promise<boolean> => {
      // 每次新请求开始时先清掉旧错误，避免成功重试后还残留旧提示。
      setLoadError(null);

      // 复用 MGT Provider 中已登录态的 Graph client，避免重复初始化客户端。
      const graphClient = Providers.globalProvider.graph.client;
      // 为本次请求分配序号；仅允许最新一次请求落盘。
      const requestSequence = ++loadRequestSequenceRef.current;

      try {
        const graphResponse = await graphClient
          .api(`/drives/${containerId}/items/${itemId}/children`)
          .get();

        // 如果当前请求不是最新请求，直接丢弃结果，避免覆盖新目录状态。
        if (requestSequence !== loadRequestSequenceRef.current) {
          return false;
        }

        // 将 Graph 原始 DriveItem 扩展为 UI 直接可用的数据结构（图标、下载链接、展示名称等）。
        const items = (graphResponse.value as IDriveItemWithDownloadUrl[]).map(
          (driveItem) => ({
            ...driveItem,
            // folder 字段存在即视为文件夹，后续用于点击行为和图标渲染。
            isFolder: Boolean(driveItem.folder),
            // 用户名缺失时兜底为 unknown，避免界面出现空白。
            modifiedByName:
              driveItem.lastModifiedBy?.user?.displayName ?? "unknown",
            modifiedById: driveItem.lastModifiedBy?.user?.id ?? undefined,
            iconElement: driveItem.folder ? (
              <FolderRegular />
            ) : (
              <DocumentRegular />
            ),
            // Graph 的下载直链字段名包含特殊字符，这里统一映射到更友好的键名。
            downloadUrl: driveItem["@microsoft.graph.downloadUrl"],
          }),
        );
        // 收集唯一用户 ID，后续用于批量请求头像和 presence，避免 N 次重复查询。
        const uniqueUserIds = collectModifiedByUserIds(items);

        // 先落盘核心列表数据，让导航、返回按钮、面包屑等依赖 loadItems 完成的 UI 立即更新。
        setDriveItems(items);
        setCurrentFolderId(itemId);

        // 头像缩略图与 presence 都是增强信息，不阻塞首屏列表展示。
        // 它们在后台异步回填，本次 loadItems 只负责尽快让核心列表和导航状态就绪。

        void (async () => {
          try {
            // 没有可查询用户时直接返回，省掉一次无意义网络请求。
            if (uniqueUserIds.length === 0) {
              return;
            }

            const photoMap = await fetchUserPhotoUrlMap({
              userIds: uniqueUserIds,
              graphClient,
              photoCache: photoCacheRef.current,
            });

            if (requestSequence !== loadRequestSequenceRef.current) {
              return;
            }

            // 仅当本次确实拿到头像数据时才触发状态更新，减少不必要重渲染。
            if (photoMap.size > 0) {
              setDriveItems((prev) =>
                prev.map((item) =>
                  item.modifiedById && photoMap.has(item.modifiedById)
                    ? {
                        ...item,
                        modifiedByPhotoUrl: photoMap.get(item.modifiedById),
                      }
                    : item,
                ),
              );
            }
          } catch (photoError: unknown) {
            console.warn(
              `Failed to fetch user photos: ${photoError instanceof Error ? photoError.message : String(photoError)}`,
            );
          }
        })();

        // 批量拉取修改者的 Teams 在线状态。
        // 失败时静默降级——presence 不影响文件列表核心功能，只是丰富展示信息。
        void (async () => {
          try {
            if (uniqueUserIds.length === 0) {
              return;
            }

            const presenceMap = await fetchUserPresenceMap(
              graphClient,
              uniqueUserIds,
            );

            // 再次检查序号，确保仍然是最新请求，防止旧 presence 覆盖新目录状态
            if (requestSequence !== loadRequestSequenceRef.current) {
              return;
            }

            // 将 presence 状态回写到各条目，触发二次渲染更新 Avatar badge
            setDriveItems((prev) =>
              prev.map((item) =>
                item.modifiedById && presenceMap.has(item.modifiedById)
                  ? {
                      ...item,
                      // 将 Presence 状态回填到每一行，供 PersonCell 显示在线状态徽标。
                      modifiedByPresence: presenceMap.get(item.modifiedById),
                    }
                  : item,
              ),
            );
          } catch (presenceError: unknown) {
            // presence 拉取失败不影响文件列表，仅记录警告
            console.warn(
              `Failed to fetch presence data: ${presenceError instanceof Error ? presenceError.message : String(presenceError)}`,
            );
          }
        })();
        return true;
      } catch (error: unknown) {
        // 过期请求失败时不再覆盖较新的成功或错误状态。
        if (requestSequence !== loadRequestSequenceRef.current) {
          return false;
        }

        const loadItemsError = normalizeFilesOperationError(error, {
          code: "loadItemsFailed",
          fallbackMessage: "Failed to load items.",
          name: "FilesLoadError",
          details: { itemId },
        });
        console.error("Failed to load items:", loadItemsError);
        setLoadError(loadItemsError);
        return false;
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
    // DataGrid 已经算好了选中集合，这里只做一次状态同步。
    setSelectedRows(data.selectedItems);
  };

  /**
   * 清空当前选中项。
   */
  const clearSelection = useCallback(() => {
    // 用全新 Set 替换旧引用，确保 React 感知到状态变化并刷新 UI。
    setSelectedRows(new Set<SelectionItemId>());
  }, []);

  /**
   * 供外部直接替换选中状态。
   * @param nextSelectedRows 新的选中集合。
   */
  const updateSelectedRows = useCallback(
    (nextSelectedRows: Set<SelectionItemId>) => {
      // 允许外部在批量操作后手动回写选中状态，保持交互一致。
      setSelectedRows(nextSelectedRows);
    },
    [],
  );

  return {
    driveItems,
    selectedRows,
    currentFolderId,
    loadError,
    loadItems,
    onSelectionChange,
    clearSelection,
    updateSelectedRows,
  };
};
