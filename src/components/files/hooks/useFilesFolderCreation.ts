import { useCallback, useState, type ChangeEvent } from "react";
import { Providers } from "@microsoft/mgt-element";
import {
  type InputOnChangeData,
  type InputProps,
} from "@fluentui/react-components";
import type { AppError } from "../../../../common/appError";
import { normalizeFilesOperationError } from "../services/filesErrors";

interface IUseFilesFolderCreationOptions {
  /** 当前容器 ID。 */
  containerId: string;
  /** 当前目录 ID。 */
  folderId: string;
  /** 创建成功后重载当前目录。 */
  reloadCurrentFolder: () => Promise<boolean>;
}

/**
 * 管理“新建文件夹”弹窗背后的业务状态。
 *
 * 页面层只负责控制弹窗开关，本 hook 负责输入、请求和错误归一化。
 *
 * @param options Hook 初始化参数。
 * @returns 新建文件夹相关状态与操作。
 */
export const useFilesFolderCreation = ({
  containerId,
  folderId,
  reloadCurrentFolder,
}: IUseFilesFolderCreationOptions) => {
  const [folderName, setFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderError, setNewFolderError] = useState<AppError | null>(null);

  /**
   * 重置弹窗内部输入和错误状态。
   */
  const resetFolderCreationState = useCallback(() => {
    setFolderName("");
    setNewFolderError(null);
  }, []);

  /**
   * 同步输入框内容。
   * @param _event 输入事件。
   * @param data 输入数据。
   */
  const onFolderNameChange: InputProps["onChange"] = useCallback(
    (_event: ChangeEvent<HTMLInputElement>, data: InputOnChangeData) => {
      // 用户重新输入时，先清掉上一次创建失败留下的错误提示，避免旧错误持续干扰当前输入。
      if (newFolderError) {
        setNewFolderError(null);
      }

      setFolderName(data.value);
    },
    [newFolderError],
  );

  /**
   * 创建新文件夹。
   *
   * @returns 是否创建成功；成功时由页面层决定是否关闭弹窗。
   */
  const createFolder = useCallback(async () => {
    // 发起创建前先进入提交中状态，并清理旧错误，确保弹窗展示的是本次请求结果。
    setCreatingFolder(true);
    setNewFolderError(null);

    try {
      // 这里直接复用当前全局 Graph client，在当前目录下创建一个新的子文件夹。
      const graphClient = Providers.globalProvider.graph.client;
      const endpoint = `/drives/${containerId}/items/${folderId}/children`;

      // 如果同名文件夹已存在，Graph 会自动改名，而不是直接让请求失败。
      await graphClient.api(endpoint).post({
        name: folderName,
        folder: {},
        "@microsoft.graph.conflictBehavior": "rename",
      });

      // 创建成功后重新加载当前目录，让列表立即反映最新结果，并顺手清空输入框。
      await reloadCurrentFolder();
      setFolderName("");
      return true;
    } catch (error: unknown) {
      // 将 Graph 或运行时异常统一整理成前端稳定可展示的错误对象。
      const createFolderError = normalizeFilesOperationError(error, {
        code: "createFolderFailed",
        fallbackMessage: "Failed to create folder.",
        name: "FilesCreateFolderError",
        context: { folderId, folderName },
      });
      console.error("Create folder failed:", createFolderError);
      setNewFolderError(createFolderError);
      return false;
    } finally {
      // 不论成功还是失败，都要结束“正在创建”的加载态。
      setCreatingFolder(false);
    }
  }, [containerId, folderId, folderName, reloadCurrentFolder]);

  return {
    folderName,
    creatingFolder,
    newFolderError,
    onFolderNameChange,
    createFolder,
    resetFolderCreationState,
  };
};
