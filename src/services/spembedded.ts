/**
 * SharePoint Embedded 前端服务层
 *
 * 本模块是前端与后端 API 之间的桥梁，负责：
 * 1. 从全局 MGT Provider 获取 API Access Token
 * 2. 调用后端 REST API 完成容器的增删查操作
 * 3. 管理 ZIP 归档下载的异步任务（启动、轮询进度、触发下载）
 *
 * 核心概念：
 * - MGT (Microsoft Graph Toolkit): 微软提供的前端身份验证和 Graph API 组件库
 *   * Providers.globalProvider: 全局唯一的身份验证提供者，由 index.tsx 中 Msal2Provider 初始化
 *   * ProviderState.SignedIn: 表示用户已登录，可以获取 token
 *
 * - Access Token 获取流程:
 *   1. 用户通过 <Login /> 组件登录 → globalProvider 状态变为 SignedIn
 *   2. 调用 provider.getAccessToken({ scopes }) 获取 这个后端 API 专用 token，这里后端在AAD上设了一个 custom scope: Container.Manage
 *   3. token 的 scope 格式为 "api://{clientId}/{权限名}"，如 "api://xxx/Container.Manage"
 *   4. 此 token 发送给后端，后端通过 OBO 流程换取 Graph API token
 *
 * - 后端 API 端点:
 *   * GET  /api/listContainers           - 列出容器
 *   * POST /api/createContainer          - 创建容器
 *   * POST /api/deleteItems              - 批量删除文件/文件夹
 *   * POST /api/downloadArchive/start    - 启动 ZIP 归档任务
 *   * GET  /api/downloadArchive/progress - 查询归档进度
 *   * GET  /api/downloadArchive/manifest - 获取归档清单（文件 URL + 路径）
 **/

import { Providers, ProviderState } from "@microsoft/mgt-element";
import { clientConfig } from "./../common/config";
import * as Scopes from "./../common/scopes";
import {
  IArchiveClientProgress,
  IArchiveManifest,
  IContainer,
} from "../common/types";
import { AsyncZipDeflate, Zip } from "fflate";

/**
 * ZIP 归档任务的进度信息
 *
 * 任务有 4 个状态，按顺序流转：queued → preparing → ready/failed
 * - queued: 任务已创建，等待处理
 * - preparing: 正在遍历文件/文件夹结构并准备下载清单
 * - ready: 清单准备完成，可由前端开始流式下载和压缩
 * - failed: 任务失败
 **/
export interface IJobProgress {
  status: "queued" | "preparing" | "ready" | "failed";
  processedFiles: number; // 已处理的文件数
  totalFiles: number; // 总文件数
  currentItem: string; // 当前正在处理的文件名
  preparedBytes: number; // 已准备字节（后端阶段）
  totalBytes: number; // 总字节（后端阶段）
  errors: string[]; // 错误信息列表（部分文件可能失败）
}

interface IShowSaveFilePickerWindow extends Window {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<{
    createWritable: () => Promise<{
      // 这里使用浏览器 FileSystemWritableFileStream.write 的入参语义，
      // 避免将 fflate 的 Uint8Array 误约束为 BlobPart 后触发类型不兼容。
      write: (data: BufferSource | Blob | string) => Promise<void>;
      close: () => Promise<void>;
      abort: () => Promise<void>;
    }>;
  }>;
}

/**
 * 前端归档输出目标。
 *
 * 如果 writable 存在，表示已经在用户手势上下文中获取了磁盘写入流。
 * 如果 writable 为空，则回退到 Blob 下载模式。
 */
export interface IArchiveSaveTarget {
  filename: string;
  writable: {
    // 与上面的 window 声明保持一致，统一写入类型，避免调用点发生赋值冲突。
    write: (data: BufferSource | Blob | string) => Promise<void>;
    close: () => Promise<void>;
    abort: () => Promise<void>;
  } | null;
}

/**
 * 批量删除操作的返回结果
 *
 * 删除操作支持部分成功：即使某些文件删除失败，已成功的不会回滚
 **/
export interface IDeleteItemsResult {
  successful: string[]; // 成功删除的文件 ID 列表
  failed: Array<{ id: string; reason: string }>; // 失败的文件 ID 及原因
}

/**
 * SharePoint Embedded 前端服务类
 *
 * 封装所有与后端 API 的交互逻辑，组件层通过实例化此类来调用后端服务。
 * 所有方法内部都会先获取 Access Token，再附加到请求的 Authorization header 中。
 *
 * 使用示例：
 * ```typescript
 * const spe = new SpEmbedded();
 * const containers = await spe.listContainers();
 * const newContainer = await spe.createContainer("My Container", "描述");
 * ```
 **/
export default class SpEmbedded {
  /**
   * 获取 API Access Token
   *
   * 从全局 MGT Provider 获取用于调用后端 API 的 token。
   * 此 token 的 scope 为 "api://{apiClientId}/Container.Manage"，
   * 后端收到后会通过 OBO 流程换取 Graph API token。
   *
   * @returns Access Token 字符串，获取失败时返回 null
   *
   * 流程：
   * 1. 检查全局 Provider 是否已登录
   * 2. 调用 provider.getAccessToken() 请求指定 scope 的 token
   * 3. 如果 MSAL 缓存中有有效 token 则直接返回（静默获取）
   * 4. 如果缓存过期则 MSAL 自动刷新（用户无感知）
   **/
  async getApiAccessToken() {
    // 重用全局 provider 已登录用户的 token，原代码会出现no account selected的错误
    const provider = Providers.globalProvider;
    if (provider.state === ProviderState.SignedIn) {
      try {
        const accessToken = await provider.getAccessToken({
          scopes: [
            `api://${clientConfig.apiEntraAppClientId}/${Scopes.SPEMBEDDED_CONTAINER_MANAGE}`,
          ],
        });
        console.log(`Reusing token: ${accessToken}`);
        return accessToken;
      } catch (error) {
        console.error("Error getting token from global provider", error);
        return null;
      }
    } else {
      console.warn("Global provider is not signed in");
      return null;
    }
  }

  /**
   * 列出当前用户可访问的所有容器
   *
   * @returns 容器数组，失败或未登录时返回 undefined
   *
   * 调用流程：
   * 1. 检查用户是否已登录
   * 2. 获取 API Access Token
   * 3. 发送 GET /api/listContainers 请求
   * 4. 后端验证 token → OBO 换取 Graph token → 查询 Graph API
   * 5. 返回按 containerTypeId 过滤后的容器列表
   **/
  async listContainers(): Promise<IContainer[] | undefined> {
    const api_endpoint = `${clientConfig.apiServerUrl}/api/listContainers`;

    if (Providers.globalProvider.state === ProviderState.SignedIn) {
      const token = await this.getApiAccessToken();
      const containerRequestHeaders = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      const containerRequestOptions = {
        method: "GET",
        headers: containerRequestHeaders,
      };
      const response = await fetch(api_endpoint, containerRequestOptions);

      if (response.ok) {
        const containerResponse = await response.json();
        return containerResponse.value
          ? (containerResponse.value as IContainer[])
          : undefined;
      } else {
        console.error(`Unable to list Containers: ${JSON.stringify(response)}`);
        return undefined;
      }
    }
  }

  /**
   * 创建新的存储容器
   *
   * @param containerName 容器显示名称（必填）
   * @param containerDescription 容器描述（可选，默认为空字符串）
   * @returns 创建成功的容器对象，失败时返回 undefined
   *
   * 调用流程：
   * 1. 检查用户是否已登录
   * 2. 获取 API Access Token
   * 3. 构建请求体（displayName + description）
   * 4. 发送 POST /api/createContainer 请求
   * 5. 后端验证 token → OBO 换取 Graph token → 调用 Graph API 创建容器
   * 6. 返回新容器的完整信息（包括 id、createdDateTime 等）
   **/
  async createContainer(
    containerName: string,
    containerDescription: string = "",
  ): Promise<IContainer | undefined> {
    const api_endpoint = `${clientConfig.apiServerUrl}/api/createContainer`;

    if (Providers.globalProvider.state === ProviderState.SignedIn) {
      const token = await this.getApiAccessToken();
      const containerRequestHeaders = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      const containerRequestData = {
        displayName: containerName,
        description: containerDescription,
      };
      const containerRequestOptions = {
        method: "POST",
        headers: containerRequestHeaders,
        body: JSON.stringify(containerRequestData),
      };

      const response = await fetch(api_endpoint, containerRequestOptions);

      if (response.ok) {
        const containerResponse = await response.json();
        return containerResponse as IContainer;
      } else {
        console.error(
          `Unable to create container: ${JSON.stringify(response)}`,
        );
        return undefined;
      }
    }
  }

  /**
   * 批量删除容器内的文件或文件夹
   *
   * @param containerId 容器 ID（即 Drive ID）
   * @param itemIds 要删除的文件/文件夹 ID 数组
   * @returns 删除结果，包含成功和失败的 ID 列表
   * @throws 请求失败时抛出错误
   *
   * 注意：删除支持部分成功，result.failed 数组记录失败的项目及原因
   **/
  async deleteItems(
    containerId: string,
    itemIds: string[],
  ): Promise<IDeleteItemsResult> {
    const api_endpoint = `${clientConfig.apiServerUrl}/api/deleteItems`;
    const token = await this.getApiAccessToken();
    const response = await fetch(api_endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ containerId, itemIds }),
    });

    if (response.ok) {
      return (await response.json()) as IDeleteItemsResult;
    }
    throw new Error(`deleteItems failed: ${response.status}`);
  }

  /**
   * 启动归档下载准备任务
   *
   * 后端会异步展开目录并生成下载清单（manifest），
   * 真正的 ZIP 压缩由前端在 downloadArchiveFromManifest() 中流式完成。
   * 返回 jobId 后需要轮询 getDownloadProgress() 查看进度。
   *
   * @param containerId 容器 ID（即 Drive ID）
   * @param itemIds 要打包的文件/文件夹 ID 数组
   * @returns 任务 ID（jobId），用于后续查询进度和下载
   * @throws 请求失败时抛出错误
   *
   * 完整下载流程：
   * 1. startDownloadArchive() → 获取 jobId
   * 2. 轮询 getDownloadProgress(jobId) → 等待 status === "ready"
   * 3. 调用 getDownloadManifest(jobId) 获取后端准备好的文件清单
   * 4. 调用 downloadArchiveFromManifest() 在前端流式下载并压缩
   **/
  async startDownloadArchive(
    containerId: string,
    itemIds: string[],
  ): Promise<string> {
    const api_endpoint = `${clientConfig.apiServerUrl}/api/downloadArchive/start`;
    const token = await this.getApiAccessToken();
    const response = await fetch(api_endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ containerId, itemIds }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.jobId as string;
    }
    throw new Error(`startDownloadArchive failed: ${response.status}`);
  }

  /**
   * 查询 ZIP 归档任务的进度
   *
   * @param jobId 任务 ID（由 startDownloadArchive 返回）
   * @returns 任务进度信息，包含状态、已处理文件数、当前处理项等
   * @throws 请求失败时抛出错误
   **/
  async getDownloadProgress(jobId: string): Promise<IJobProgress> {
    const api_endpoint = `${clientConfig.apiServerUrl}/api/downloadArchive/progress/${encodeURIComponent(jobId)}`;
    const token = await this.getApiAccessToken();
    const response = await fetch(api_endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      return (await response.json()) as IJobProgress;
    }
    throw new Error(`getDownloadProgress failed: ${response.status}`);
  }

  /**
   * 获取归档下载清单。
   *
   * @param jobId 任务 ID。
   * @returns Promise<IArchiveManifest> 后端准备好的下载清单。
   * @throws 请求失败时抛出错误。
   */
  async getDownloadManifest(jobId: string): Promise<IArchiveManifest> {
    const api_endpoint = `${clientConfig.apiServerUrl}/api/downloadArchive/manifest/${encodeURIComponent(jobId)}`;
    const token = await this.getApiAccessToken();
    const response = await fetch(api_endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      return (await response.json()) as IArchiveManifest;
    }
    throw new Error(`getDownloadManifest failed: ${response.status}`);
  }

  /**
   * 在用户点击手势上下文中预先申请归档输出目标。
   *
   * 这样可以避免在异步轮询回调中调用 showSaveFilePicker 导致手势校验失败。
   * @param filename 建议下载文件名。
   * @returns Promise<IArchiveSaveTarget> 归档输出目标。
   */
  async selectArchiveSaveTarget(filename: string): Promise<IArchiveSaveTarget> {
    const canWriteDirectly =
      typeof window !== "undefined" &&
      typeof (window as IShowSaveFilePickerWindow).showSaveFilePicker ===
        "function";

    if (!canWriteDirectly) {
      return { filename, writable: null };
    }

    const pickerWindow = window as IShowSaveFilePickerWindow;
    const savePicker = pickerWindow.showSaveFilePicker;
    if (!savePicker) {
      return { filename, writable: null };
    }

    try {
      const handle = await savePicker({
        suggestedName: filename,
        types: [
          {
            description: "ZIP Archive",
            accept: { "application/zip": [".zip"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      return { filename, writable };
    } catch (error: any) {
      // 用户取消保存对话框时，不应继续后续下载流程。
      if (error?.name === "AbortError") {
        throw new Error("Download cancelled by user.");
      }
      throw error;
    }
  }

  /**
   * 在前端流式下载并压缩归档，完成后自动触发浏览器下载。
   *
   * 该实现会边读取远程文件流边推入 ZIP 压缩器，避免把每个文件完整加载到内存中。
   * 在支持 File System Access API 的浏览器中，ZIP 输出会直接写入磁盘流，进一步降低内存峰值。
   *
   * @param manifest 后端返回的下载清单。
   * @param saveTarget 归档输出目标。
   * @param onProgress 进度回调，用于更新下载与压缩进度。
   * @returns Promise<void>
   **/
  async downloadArchiveFromManifest(
    manifest: IArchiveManifest,
    saveTarget: IArchiveSaveTarget,
    onProgress: (progress: IArchiveClientProgress) => void,
  ): Promise<void> {
    const totalFiles = manifest.totalFiles;
    const totalBytes = manifest.totalBytes;

    let downloadedBytes = 0;
    let zippedBytes = 0;
    let processedFiles = 0;
    // Blob 构造参数要求的是稳定的二进制片段类型；这里统一收集 ArrayBuffer。
    const fallbackChunks: ArrayBuffer[] = [];

    const toArrayBuffer = (chunk: Uint8Array): ArrayBuffer => {
      // 报错根因：fflate 回调中的 data 在类型上可能携带 ArrayBufferLike，
      // 直接传入 write/Blob 时会与严格类型定义冲突；这里拷贝为标准 ArrayBuffer。
      const copy = new Uint8Array(chunk.byteLength);
      copy.set(chunk);
      return copy.buffer;
    };

    const writable = saveTarget.writable;

    const emitProgress = (
      stage: IArchiveClientProgress["stage"],
      currentItem: string,
    ) => {
      onProgress({
        stage,
        totalFiles,
        processedFiles,
        totalBytes,
        downloadedBytes,
        zippedBytes,
        currentItem,
      });
    };

    let writeChain: Promise<void> = Promise.resolve();

    try {
      await new Promise<void>(async (resolve, reject) => {
        let resolved = false;

        const zip = new Zip((error, data, final) => {
          if (error) {
            reject(error);
            return;
          }

          writeChain = writeChain
            .then(async () => {
              zippedBytes += data.length;
              emitProgress("zipping", "");
              if (writable) {
                // 先转成标准 ArrayBuffer，再写入磁盘流，规避 Uint8Array 泛型缓冲区差异。
                await writable.write(toArrayBuffer(data));
              } else {
                // 回退路径同样存放 ArrayBuffer，确保 new Blob(...) 的参数类型稳定。
                fallbackChunks.push(toArrayBuffer(data));
              }
            })
            .catch(reject);

          if (final && !resolved) {
            resolved = true;
            writeChain.then(resolve).catch(reject);
          }
        });

        for (const item of manifest.items) {
          emitProgress("downloading", item.relativePath);

          const entry = new AsyncZipDeflate(item.relativePath, { level: 6 });
          zip.add(entry);

          const response = await fetch(item.downloadUrl, {
            method: "GET",
          });

          if (!response.ok) {
            throw new Error(
              `Failed to download ${item.relativePath}. HTTP ${response.status}`,
            );
          }

          if (!response.body) {
            const buffer = new Uint8Array(await response.arrayBuffer());
            downloadedBytes += buffer.length;
            emitProgress("downloading", item.relativePath);
            entry.push(buffer, true);
            processedFiles += 1;
            continue;
          }

          const reader = response.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            if (value) {
              downloadedBytes += value.length;
              emitProgress("downloading", item.relativePath);
              entry.push(value, false);
            }
          }

          entry.push(new Uint8Array(0), true);
          processedFiles += 1;
        }

        zip.end();
      });

      if (writable) {
        await writable.close();
      } else {
        const zipBlob = new Blob(fallbackChunks, { type: "application/zip" });
        const blobUrl = URL.createObjectURL(zipBlob);
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download = saveTarget.filename;
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(blobUrl);
      }

      emitProgress("done", "");
    } catch (error) {
      if (writable) {
        await writable.abort();
      }
      throw error;
    }
  }
}
