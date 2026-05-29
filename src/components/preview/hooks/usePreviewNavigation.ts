import { useCallback } from "react";
import type { IPreviewNavigationState } from "../models/previewTypes";
import type { IDriveItemExtended } from "../../../common/types";

interface IUsePreviewNavigationOptions {
  allFiles: IDriveItemExtended[];
  currentFile: IDriveItemExtended | null;
  onNavigate: (file: IDriveItemExtended) => void;
}

/**
 * 管理 Preview 弹窗里的前后导航边界和切换动作。
 *
 * 这个 Hook 只负责“当前文件在列表中的位置”和“能否切换”，
 * 真正的当前文件状态仍由父层 `Files` 页面持有。
 *
 * @param options 导航所需的文件列表、当前文件和切换回调。
 * @returns 导航按钮所需的索引、禁用状态和跳转方法。
 */
export const usePreviewNavigation = ({
  allFiles,
  currentFile,
  onNavigate,
}: IUsePreviewNavigationOptions): IPreviewNavigationState => {
  const currentIndex = currentFile
    ? allFiles.findIndex((file) => file.id === currentFile.id)
    : -1;

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < allFiles.length - 1;

  /**
   * 导航到上一个文件。
   */
  const goToPrevious = useCallback(() => {
    if (!hasPrevious) {
      return;
    }

    onNavigate(allFiles[currentIndex - 1]);
  }, [allFiles, currentIndex, hasPrevious, onNavigate]);

  /**
   * 导航到下一个文件。
   */
  const goToNext = useCallback(() => {
    if (!hasNext) {
      return;
    }

    onNavigate(allFiles[currentIndex + 1]);
  }, [allFiles, currentIndex, hasNext, onNavigate]);

  return {
    currentIndex,
    hasPrevious,
    hasNext,
    goToPrevious,
    goToNext,
  };
};
