/**
 * SharePoint Embedded API 客户端服务类
 *
 * 本模块负责：
 * 1. 获取当前登录用户的 Access Token
 * 2. 与后端 API 通信，执行容器和文件操作
 * 3. 管理文件上传/下载进度和归档操作
 *
 * 核心概念：
 * - Token 获取：复用全局 MGT (Microsoft Graph Toolkit) provider 的 token，
 *   确保与 Login 组件共享同一身份认证状态，避免重复登录
 * - API 调用：所有请求都在 Authorization header 中带上 Bearer token，
 *   由后端验证权限并调用 Microsoft Graph API
 * - 报告进度：对于长时间操作（如文件下载、归档），提供实时进度反馈
 *
 * 使用方式：
 * ```
 * const spEmbedded = new SpEmbedded();
 * const containers = await spEmbedded.listContainers();
 * const newContainer = await spEmbedded.createContainer("My Container", "Description");
 * ```
 *
 * 错误处理：
 * - 所有方法都可能返回 null 或抛出异常
 * - 建议在调用时使用 try-catch 或检查返回值是否为 null
 */

import { Providers, ProviderState } from "@microsoft/mgt-element";
import { clientConfig } from "./../common/config";
import * as Scopes from "./../common/scopes";
import { IContainer } from "../common/types";

/**
 * 文件下载/归档作业的进度信息
 * - status: 当前作业状态（排队中、准备中、压缩中、完成、失败）
 * - processedFiles: 已处理文件数量
 * - totalFiles: 总文件数量
 * - currentItem: 正在处理的文件/文件夹名称
 * - errors: 处理过程中遇到的错误信息列表
 */
export interface IJobProgress {
  status: "queued" | "preparing" | "zipping" | "ready" | "failed";
  processedFiles: number;
  totalFiles: number;
  currentItem: string;
  errors: string[];
}

/**
 * 删除项目操作的结果
 * - successful: 成功删除的项目 ID 列表
 * - failed: 删除失败的项目及其失败原因
 */
export interface IDeleteItemsResult {
  successful: string[];
  failed: Array<{ id: string; reason: string }>;
}

/**
 * SharePoint Embedded API 客户端
 * 提供容器、文件、下载等操作的接口
 */
export default class SpEmbedded {
  /**
   * 获取当前登录用户的 API Access Token
   *
   * 流程：
   * 1. 检查全局 provider（MGT Login 组件维护）是否已登录
   * 2. 如已登录，向 provider 请求 Container.Manage 权限范围的 token
   * 3. 返回 token 字符串，用于后续 API 调用的 Authorization header
   *
   * @returns {Promise<string | null>} Access token 字符串，失败或未登录时返回 null
   *
   * 设计考量：
   * - 复用全局 provider token 而非创建新的 MSAL 实例，确保登录状态一致
   * - 如果 provider 未登录，返回 null；调用者应检查返回值
   * - token 由 Entra ID 签发，包含 Container.Manage 权限声明
   */
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
   * 获取当前用户有权访问的所有 SharePoint Embedded 容器列表
   *
   * API 调用流程：
   * 1. 通过 getApiAccessToken() 获取 token
   * 2. 发送 GET 请求到后端 /api/listContainers 端点
   * 3. 后端会使用 OBO 流程获取 Graph token，调用 /storage/fileStorage/containers API
   * 4. 返回容器列表（包含 id、displayName、containerTypeId、createdDateTime）
   *
   * @returns {Promise<IContainer[] | undefined>} 容器数组；失败或用户未登录时返回 undefined
   *
   * 错误处理：
   * - 如果 HTTP 响应状态码非 200，记录错误并返回 undefined
   * - 调用者应检查返回值是否为 undefined
   *
   * 示例响应：
   * ```json
   * {
   *   "value": [
   *     {
   *       "id": "b!abc123...",
   *       "displayName": "my-container",
   *       "containerTypeId": "...",
   *       "createdDateTime": "2024-01-01T00:00:00Z"
   *     }
   *   ]
   * }
   * ```
   */
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
   * 创建新的 SharePoint Embedded 容器
   *
   * 容器创建流程：
   * 1. 验证用户已登录并获有有效 token
   * 2. 发送 POST 请求到 /api/createContainer，传入容器名称和描述
   * 3. 后端验证权限后，调用 Microsoft Graph /storage/fileStorage/containers 创建新容器
   * 4. 返回新创建的容器对象，包含生成的容器 ID
   *
   * @param {string} containerName - 容器名称，用户可见的显示名称
   * @param {string} [containerDescription=""] - 可选的容器描述
   * @returns {Promise<IContainer | undefined>} 创建成功时返回容器对象，失败或用户未登录时返回 undefined
   *
   * 权限要求：
   * - 用户的 token 必须包含 Container.Manage 权限范围
   * - 此权限由管理员在 Entra ID 中为应用分配给用户
   *
   * 示例：
   * ```
   * const newContainer = await spEmbedded.createContainer(
   *   "Project Documents",
   *   "Storage for 2024 project files"
   * );
   * ```
   */
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
   * 删除一个或多个文件/文件夹项目
   *
   * 删除流程：
   * 1. 获取 token
   * 2. 发送 POST 请求到 /api/deleteItems，传入容器 ID 和项目 ID 列表
   * 3. 后端逐个删除这些项目，收集成功和失败的结果
   * 4. 返回 IDeleteItemsResult 对象，包含删除成功和失败的项目列表
   *
   * @param {string} containerId - 容器 ID（文件所在的存储容器）
   * @param {string[]} itemIds - 要删除的项目 ID 数组（可以是文件或文件夹）
   * @returns {Promise<IDeleteItemsResult>} 删除操作结果对象
   * @throws {Error} 如果 HTTP 响应状态码非 200，抛出异常
   *
   * 返回结果示例：
   * ```json
   * {
   *   "successful": ["item-id-1", "item-id-2"],
   *   "failed": [
   *     { "id": "item-id-3", "reason": "Permission denied" }
   *   ]
   * }
   * ```
   *
   * 注意：
   * - 删除文件夹会递归删除其所有子项目
   * - 即使某些项目删除失败，其他项目仍会尝试删除
   */
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
   * 启动文件下载归档任务
   *
   * 此方法用于将一个或多个文件/文件夹打包成 ZIP 文件供下载。
   * 由于归档可能需要较长时间，使用异步 job-based 的方式：
   *
   * 操作流程：
   * 1. 发送 POST 请求到 /api/downloadArchive/start，指定要归档的项目
   * 2. 后端返回 jobId，表示一个异步的归档作业
   * 3. 客户端使用 getDownloadProgress(jobId) 轮询作业进度
   * 4. 等待状态变为 "ready"
   * 5. 调用 triggerArchiveFileDownload(jobId) 下载最终的 ZIP 文件
   *
   * @param {string} containerId - 容器 ID
   * @param {string[]} itemIds - 要下载/归档的项目 ID 列表
   * @returns {Promise<string>} 作业 ID，用于后续进度查询和文件下载
   * @throws {Error} 如果请求失败，抛出异常
   *
   * 示例：
   * ```
   * const jobId = await spEmbedded.startDownloadArchive("container-id", ["item-1", "item-2"]);
   * // 然后轮询进度直到完成
   * ```
   */
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
   * 查询文件下载归档作业的进度
   *
   * 流程：
   * 1. 用 jobId 查询作业的当前状态
   * 2. 返回 IJobProgress 对象，包含：
   *    - status: 当前阶段（排队中、准备中、压缩中、完成、失败）
   *    - processedFiles: 已处理的文件个数
   *    - totalFiles: 总共需要处理的文件个数
   *    - currentItem: 正在处理的文件/文件夹名称
   *    - errors: 过程中遇到的错误列表
   *
   * 使用场景：
   * - 前端轮询此方法来获取实时进度
   * - 显示进度条、当前处理文件名、错误信息等
   *
   * @param {string} jobId - 作业 ID（由 startDownloadArchive 返回）
   * @returns {Promise<IJobProgress>} 当前的作业进度信息
   * @throws {Error} 如果请求失败或 jobId 不存在，抛出异常
   *
   * 进度对象示例：
   * ```json
   * {
   *   "status": "zipping",
   *   "processedFiles": 45,
   *   "totalFiles": 100,
   *   "currentItem": "document.pdf",
   *   "errors": []
   * }
   * ```
   */
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
   * 下载已完成的归档 ZIP 文件
   *
   * 典型使用流程（完整示例）：
   * ```
   * // 1. 启动归档任务
   * const jobId = await spEmbedded.startDownloadArchive(containerId, itemIds);
   *
   * // 2. 轮询进度，等待完成
   * let progress = await spEmbedded.getDownloadProgress(jobId);
   * while (progress.status !== "ready" && progress.status !== "failed") {
   *   await sleep(1000); // 等待 1 秒
   *   progress = await spEmbedded.getDownloadProgress(jobId);
   * }
   *
   * // 3. 如果完成，下载 ZIP 文件
   * if (progress.status === "ready") {
   *   await spEmbedded.triggerArchiveFileDownload(jobId, "my-archive.zip");
   * }
   * ```
   *
   * @param {string} jobId - 已完成的作业 ID
   * @param {string} [filename="archive.zip"] - 下载时保存的文件名
   * @returns {Promise<void>} 不返回任何值；文件会直接下载到用户的 Downloads 文件夹
   * @throws {Error} 如果 HTTP 响应失败，抛出异常
   *
   * 实现细节：
   * - 从后端获取 ZIP 文件的二进制数据
   * - 创建临时的 Blob 对象 URL
   * - 通过隐藏的 <a> 标签触发浏览器下载
   * - 最后清理临时 URL
   */
  async triggerArchiveFileDownload(
    jobId: string,
    filename = "archive.zip",
  ): Promise<void> {
    const api_endpoint = `${clientConfig.apiServerUrl}/api/downloadArchive/file/${encodeURIComponent(jobId)}`;
    const token = await this.getApiAccessToken();
    const response = await fetch(api_endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Archive download failed: ${response.status}`);
    }

    // ── 下载文件到本地 ──────────────────────────────────────────────────
    // 使用 Blob URL 和隐藏的 <a> 标签实现文件下载
    const blob = await response.blob();
    const url = URL.createObjectURL(blob); // 将 blob 转换为可下载的 URL
    const link = document.createElement("a");
    link.href = url;
    link.download = filename; // 指定下载时的文件名
    document.body.appendChild(link);
    link.click(); // 触发下载
    document.body.removeChild(link);
    URL.revokeObjectURL(url); // 释放内存
  }
}
