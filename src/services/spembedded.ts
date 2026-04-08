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
 *   * GET  /api/downloadArchive/file     - 下载归档文件
 **/

import { Providers, ProviderState } from "@microsoft/mgt-element";
import { clientConfig } from "./../common/config";
import * as Scopes from "./../common/scopes";
import { IContainer } from "../common/types";

/**
 * ZIP 归档任务的进度信息
 *
 * 任务有 5 个状态，按顺序流转：queued → preparing → zipping → ready/failed
 * - queued: 任务已创建，等待处理
 * - preparing: 正在遍历文件/文件夹结构
 * - zipping: 正在压缩文件到 ZIP
 * - ready: 压缩完成，可以下载
 * - failed: 任务失败
 **/
export interface IJobProgress {
  status: "queued" | "preparing" | "zipping" | "ready" | "failed";
  processedFiles: number; // 已处理的文件数
  totalFiles: number; // 总文件数
  currentItem: string; // 当前正在处理的文件名
  errors: string[]; // 错误信息列表（部分文件可能失败）
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
   * 启动 ZIP 归档下载任务
   *
   * 将指定的文件/文件夹打包为 ZIP 归档（后端异步处理）。
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
   * 3. 前端显示“可下载”状态，等待用户点击 Download now
   * 4. triggerArchiveFileDownload(jobId, "SPE-<unixMs>.zip") → 触发浏览器下载
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
   * 触发浏览器下载 ZIP 归档文件
   *
   * 当任务状态为 "ready" 且用户点击下载按钮后调用此方法，
   * 从后端获取 ZIP 文件并触发浏览器下载。
   *
   * @param jobId 任务 ID
   * @param filename 下载文件名，默认值为 "archive.zip"。
   *        当前页面调用方会传入 "SPE-<unixMs>.zip"。
   * @throws 请求失败时抛出错误
   *
   * 实现原理：
   * 1. 从后端获取 ZIP 文件的二进制数据（Blob）
   * 2. 创建临时的 Object URL（blob:// 协议）
   * 3. 动态创建 <a> 标签并设置 download 属性
   * 4. 模拟点击触发浏览器下载
   * 5. 清理临时 DOM 元素和 Object URL（释放内存）
   **/
  async triggerArchiveFileDownload(
    jobId: string,
    filename = "archive.zip",
  ): Promise<void> {
    const api_endpoint = `${clientConfig.apiServerUrl}/api/downloadArchive/file/${encodeURIComponent(jobId)}`;
    const token = await this.getApiAccessToken();
    if (!token) {
      throw new Error("Unable to acquire API access token");
    }

    const startedAt = Date.now();
    const response = await fetch(api_endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Archive download failed: ${response.status}`);
    }

    // 步骤 1: 获取响应的二进制 Blob
    const blob = await response.blob();
    console.info("Archive blob fetched", {
      jobId,
      filename,
      blobSize: blob.size,
      elapsedMs: Date.now() - startedAt,
    });
    // 步骤 2: 创建临时的 Object URL（类似 blob:http://localhost:3000/xxx）
    const url = URL.createObjectURL(blob);
    // 步骤 3: 创建隐藏的 <a> 标签
    const link = document.createElement("a");
    link.href = url;
    link.download = filename; // 设置下载文件名
    document.body.appendChild(link);
    try {
      // 步骤 4: 模拟点击触发浏览器下载对话框
      link.click();
    } finally {
      // 步骤 5: 清理 - 移除 DOM 元素并释放 Object URL 占用的内存
      document.body.removeChild(link);
      // 延迟回收可以降低个别浏览器中下载尚未接管时立即 revoke 的风险
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
}
