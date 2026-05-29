import { Spinner } from "@fluentui/react-components";
import { usePreviewStyles } from "./previewStyles";
import type { IPreviewContentState } from "../models/previewTypes";

interface IPreviewContentProps extends IPreviewContentState {
  fileName: string;
}

/**
 * 预览内容区。
 *
 * 这里集中处理四种显示状态：
 * 1. 正在加载预览地址
 * 2. 预览加载失败
 * 3. 已获取 iframe 预览地址
 * 4. 当前文件没有可用预览
 *
 * @param props 当前文件名和预览状态。
 * @returns 对应状态下的内容区域。
 */
export const PreviewContent = ({
  fileName,
  previewUrl,
  isLoading,
  error,
}: IPreviewContentProps) => {
  const styles = usePreviewStyles();

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <Spinner size="large" />
        <div>Loading preview...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.loadingContainer}>
        <div>Error: {error}</div>
      </div>
    );
  }

  if (previewUrl) {
    return (
      <iframe
        src={previewUrl}
        className={styles.previewFrame}
        title={`Preview of ${fileName}`}
        sandbox="allow-same-origin allow-scripts allow-forms allow-downloads allow-popups"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div className={styles.loadingContainer}>
      <div>No preview available</div>
    </div>
  );
};
