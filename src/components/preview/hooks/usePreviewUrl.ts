import { useEffect, useState } from "react";
import { Providers } from "@microsoft/mgt-element";
import type { IPreviewContentState } from "../models/previewTypes";
import type { IDriveItemExtended } from "../../../common/types";
import {
  appendNoBannerParam,
  resolvePreviewFallbackUrl,
  resolvePreviewRequestTarget,
} from "../services/previewUrl";

interface IUsePreviewUrlOptions {
  isOpen: boolean;
  currentFile: IDriveItemExtended | null;
  containerId?: string;
}

/**
 * 加载并维护当前文件的预览地址状态。
 *
 * 预览 URL 获取流程：
 * 1. 调用 Graph API `POST /drives/{driveId}/items/{fileId}/preview`
 * 2. 如果成功，优先使用返回的 `getUrl` 并附加 `nb=true`
 * 3. 如果失败，回退使用 `webUrl`
 *
 * 这个 Hook 还会在弹窗关闭或文件切换时清理旧状态，
 * 避免上一份文件的 iframe 内容在下一次打开前短暂残留。
 *
 * @param options 是否打开、当前文件以及容器 ID。
 * @returns 预览内容区需要的 URL、加载态和错误态。
 */
export const usePreviewUrl = ({
  isOpen,
  currentFile,
  containerId,
}: IUsePreviewUrlOptions): IPreviewContentState => {
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!isOpen || !currentFile) {
      // 窗口关闭或文件切换时，立即清理旧预览 URL 和错误状态，避免下次打开时残留。
      setPreviewUrl("");
      setIsLoading(false);
      setError("");
      return;
    }

    // 使用 isCancelled 标志支持在异步加载过程中取消更新，防止 stale state。
    let isCancelled = false;

    const loadPreviewUrl = async () => {
      setPreviewUrl("");
      setIsLoading(true);
      setError("");

      const requestTarget = resolvePreviewRequestTarget(
        currentFile,
        containerId,
      );
      if (!requestTarget) {
        // 无法从文件对象解析出 driveId 和 fileId，说明数据不完整，无法继续调用预览 API。
        if (!isCancelled) {
          setError("Unable to get drive or file information");
          setIsLoading(false);
        }
        return;
      }

      try {
        const graphClient = Providers.globalProvider.graph.client;

        try {
          // 先调用预览 API 获取最高质量的预览 URL（支持 Office 文件等特殊格式）。
          const previewResponse = await graphClient
            .api(
              `/drives/${requestTarget.driveId}/items/${requestTarget.fileId}/preview`,
            )
            .post({});

          if (previewResponse.getUrl) {
            // 预览 API 返回了高质量 URL，附加 nb=true 移除 banner 后直接使用。
            if (!isCancelled) {
              setPreviewUrl(appendNoBannerParam(previewResponse.getUrl));
            }
            return;
          }

          // 预览 API 未返回 getUrl（如权限不足或不支持预览），回退到文件的 webUrl。
          const fallbackUrl = resolvePreviewFallbackUrl(currentFile);
          if (!isCancelled) {
            if (fallbackUrl) {
              setPreviewUrl(fallbackUrl);
            } else {
              setError("Preview not available for this file");
            }
          }
        } catch (previewError) {
          // 预览 API 调用失败，记录警告并回退到 webUrl。
          console.warn(
            "Preview API failed, falling back to webUrl:",
            previewError,
          );

          const fallbackUrl = resolvePreviewFallbackUrl(currentFile);
          if (!isCancelled) {
            if (fallbackUrl) {
              setPreviewUrl(fallbackUrl);
            } else {
              setError("Preview not available for this file");
            }
          }
        }
      } catch (loadError) {
        // Graph 客户端初始化或其他未预期的错误。
        console.error("Error loading preview:", loadError);
        if (!isCancelled) {
          setError("Failed to load preview");
        }
      } finally {
        // 清理加载态（除非此次加载已被后续变更取消）。
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadPreviewUrl();

    // Hook 卸载或依赖变化时，标记本轮加载为已取消，防止竞态条件。
    return () => {
      isCancelled = true;
    };
  }, [containerId, currentFile, isOpen]); // 文件、容器或打开状态变化时重新加载。

  return {
    previewUrl,
    isLoading,
    error,
  };
};
