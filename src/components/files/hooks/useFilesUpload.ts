import { useCallback, useRef, useState } from "react";
import { Providers } from "@microsoft/mgt-element";
import { DriveItem } from "@microsoft/microsoft-graph-types-beta";
import {
  IFileWithRelativePath,
  IFilesUploadItem,
  IGraphApiClient,
  IUploadProgress,
} from "../filesTypes";
import { formatFileSize } from "../filesUtils";

interface IUseFilesUploadOptions {
  /** 当前容器 ID。 */
  containerId: string;
  /** 当前目录 ID。 */
  currentFolderId: string;
  /** 上传完成后刷新当前目录。 */
  reloadCurrentFolder: () => Promise<void>;
}

const initialUploadProgress: IUploadProgress = {
  isUploading: false,
  currentFile: "",
  currentIndex: 0,
  successfulFiles: 0,
  failedFiles: 0,
  totalFiles: 0,
  fileSize: "",
  isCompleted: false,
};

/**
 * 管理文件和文件夹上传逻辑。
 * @param options Hook 初始化参数。
 * @returns 上传状态、引用和处理函数。
 */
export const useFilesUpload = ({
  containerId,
  currentFolderId,
  reloadCurrentFolder,
}: IUseFilesUploadOptions) => {
  const uploadFileRef = useRef<HTMLInputElement>(null);
  const uploadFolderRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<IUploadProgress>(
    initialUploadProgress,
  );

  /* 示例：
   * 输入 (伪表示 FileList 中的三项)：
   *   files[0] => { name: "readme.txt", webkitRelativePath: "" }
   *   files[1] => { name: "img1.jpg", webkitRelativePath: "photos/img1.jpg" }
   *   files[2] => { name: "document.pdf", webkitRelativePath: "documents/reports/document.pdf" }
   *
   * 返回值（函数输出）：
   *   [
   *     { file: File(readme.txt), relativePath: "readme.txt" },
   *     { file: File(img1.jpg), relativePath: "photos/img1.jpg" },
   *     { file: File(document.pdf), relativePath: "documents/reports/document.pdf" }
   *   ]
   * */
  /**
   * 将 FileList 整理为统一结构。
   * @param files 原始 FileList。
   * @returns 含相对路径的文件列表。
   *
   * 这段代码的作用是将从本地计算机中选中的文件整理成一个包含“相对路径”的列表，以便后续上传时能够保留文件夹结构。
   * 对于文件夹上传（webkitdirectory），会保留完整的相对路径结构。
   * 对于单文件上传，relativePath 就是文件名。
   */
  const getFolderStructure = useCallback(
    (files: FileList): IFilesUploadItem[] => {
      const result: IFilesUploadItem[] = [];

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const fileWithRelativePath = file as IFileWithRelativePath;
        // 文件夹上传时使用 webkitRelativePath，单文件上传时使用文件名。
        const relativePath =
          fileWithRelativePath.webkitRelativePath || file.name;
        result.push({ file, relativePath });
      }

      return result;
    },
    [],
  );

  /**
   * 确保目标文件夹存在。
   * @param graphClient Graph 客户端。
   * @param parentId 父目录 ID。
   * @param folderName 文件夹名称。
   * @returns 目标文件夹 ID。
   *
   * 上传文件夹结构时，递归确保每层中间文件夹都存在。
   */
  const createFolderIfNotExists = useCallback(
    async (
      graphClient: IGraphApiClient,
      parentId: string,
      folderName: string,
    ): Promise<string> => {
      try {
        // 先检查目标文件夹是否已存在。
        const endpoint = `/drives/${containerId}/items/${parentId}/children`;
        const response = await graphClient.api(endpoint).get();

        const existingFolder = (response.value as DriveItem[]).find(
          (item) => item.folder !== undefined && item.name === folderName,
        );

        if (existingFolder?.id) {
          return existingFolder.id;
        }

        // 若不存在则创建。
        const newFolder = await graphClient.api(endpoint).post({
          name: folderName,
          folder: {},
          "@microsoft.graph.conflictBehavior": "rename",
        });

        return newFolder.id as string;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to create folder ${folderName}: ${message}`);
        throw error;
      }
    },
    [containerId],
  );

  /**
   * 上传文件列表。
   * @param files 用户选择的文件列表。
   *
   * 流程：
   * 1. 解析文件列表及其相对路径（支持文件夹结构）。
   * 2. 在异步上传开始前快照当前文件夹 ID，确保整批上传及最终刷新基于同一目录上下文。
   * 3. 遍历每个文件，按路径逐级确保中间文件夹存在。
   * 4. 使用 Graph API PUT 请求上传文件内容，并实时更新上传进度状态。
   * 5. 全部完成后展示完成提示，并刷新快照目录对应的文件列表。
   */
  const uploadFiles = useCallback(
    async (files: FileList) => {
      const fileStructure = getFolderStructure(files);
      const totalFiles = fileStructure.length;
      const folderIdSnapshot = currentFolderId || "root";

      setUploadProgress({
        ...initialUploadProgress,
        isUploading: true,
        totalFiles,
      });

      const graphClient = Providers.globalProvider.graph
        .client as IGraphApiClient;

      for (let index = 0; index < fileStructure.length; index += 1) {
        const { file, relativePath } = fileStructure[index];

        // 更新上传进度。
        setUploadProgress((previousState) => ({
          ...previousState,
          currentFile: relativePath,
          currentIndex: index + 1,
          fileSize: formatFileSize(file.size),
        }));

        try {
          // 如果文件属于文件夹结构，先确保目标路径中的各级文件夹存在。
          const pathParts = relativePath.split("/");
          let targetFolderId = folderIdSnapshot;

          for (
            let folderIndex = 0;
            folderIndex < pathParts.length - 1;
            folderIndex += 1
          ) {
            targetFolderId = await createFolderIfNotExists(
              graphClient,
              targetFolderId,
              pathParts[folderIndex],
            );
          }

          // 将文件上传到最终目标路径。
          const fileName = pathParts[pathParts.length - 1];
          const endpoint = `/drives/${containerId}/items/${targetFolderId}:/${fileName}:/content`;
          const fileData = await file.arrayBuffer();

          await graphClient.api(endpoint).putStream(fileData);
          setUploadProgress((previousState) => ({
            ...previousState,
            successfulFiles: previousState.successfulFiles + 1,
          }));
        } catch (error: unknown) {
          setUploadProgress((previousState) => ({
            ...previousState,
            failedFiles: previousState.failedFiles + 1,
          }));
          console.error(
            `Failed to upload file ${relativePath}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      // 展示上传完成状态。
      setUploadProgress((previousState) => ({
        ...previousState,
        isUploading: false,
        isCompleted: true,
      }));

      // 3 秒后隐藏完成提示。
      setTimeout(() => {
        setUploadProgress((previousState) => ({
          ...previousState,
          isCompleted: false,
        }));
      }, 3000);

      // 刷新文件列表。
      await reloadCurrentFolder();
    },
    [
      containerId,
      createFolderIfNotExists,
      currentFolderId,
      getFolderStructure,
      reloadCurrentFolder,
    ],
  );

  /**
   * 触发文件选择框。
   */
  const onUploadFileClick = useCallback(() => {
    uploadFileRef.current?.click();
  }, []);

  /**
   * 触发文件夹选择框。
   */
  const onUploadFolderClick = useCallback(() => {
    uploadFolderRef.current?.click();
  }, []);

  /**
   * 处理文件选择事件。
   * @param event 输入事件。
   *
   * 处理完成后重置 input value，允许重复选择相同文件。
   */
  const onUploadFileSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;

      if (!files || files.length === 0) {
        return;
      }

      await uploadFiles(files);
      event.target.value = "";
    },
    [uploadFiles],
  );

  /**
   * 处理文件夹选择事件。
   * @param event 输入事件。
   *
   * webkitdirectory 模式下，FileList 包含完整文件夹结构及相对路径。
   */
  const onUploadFolderSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;

      if (!files || files.length === 0) {
        return;
      }

      await uploadFiles(files);
      event.target.value = "";
    },
    [uploadFiles],
  );

  return {
    uploadFileRef,
    uploadFolderRef,
    uploadProgress,
    onUploadFileClick,
    onUploadFolderClick,
    onUploadFileSelected,
    onUploadFolderSelected,
  };
};
