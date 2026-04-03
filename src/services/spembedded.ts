import { Providers, ProviderState } from "@microsoft/mgt-element";
import { clientConfig } from "./../common/config";
import * as Scopes from "./../common/scopes";
import { IContainer } from "../common/types";

export interface IJobProgress {
  status: "queued" | "preparing" | "zipping" | "ready" | "failed";
  processedFiles: number;
  totalFiles: number;
  currentItem: string;
  errors: string[];
}

export interface IDeleteItemsResult {
  successful: string[];
  failed: Array<{ id: string; reason: string }>;
}

export default class SpEmbedded {
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

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
