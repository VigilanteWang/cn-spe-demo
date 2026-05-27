import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildPermissionStatusMessages,
  formatPermissionRequestErrorMessage,
  type PermissionApplyFeedbackStatus,
} from "../utils/permissionDialogSharedUtils";

interface IPermissionDialogChangeSetShape {
  create: unknown[];
  update: unknown[];
  remove: unknown[];
}

/**
 * 通用权限请求状态 Hook 的输入参数。
 */
interface IUsePermissionDialogApiRequestStateOptions<
  TEntriesByTab,
  TChanges extends IPermissionDialogChangeSetShape,
> {
  open: boolean;
  isTargetReady: boolean;
  searchError: unknown;
  resourceLabel: "container" | "item";
  createEmptyEntriesByTab: () => TEntriesByTab;
  originalEntriesByTab: TEntriesByTab;
  draftEntriesByTab: TEntriesByTab;
  replaceEntries: (entriesByTab: TEntriesByTab) => void;
  loadPermissions: () => Promise<TEntriesByTab>;
  computeChanges: (
    originalEntriesByTab: TEntriesByTab,
    draftEntriesByTab: TEntriesByTab,
  ) => TChanges;
  applyChanges: (changes: TChanges) => Promise<TEntriesByTab>;
}

/**
 * 管理权限弹窗的 API 请求生命周期状态。
 *
 * 这个 Hook 统一处理：
 * 1. 弹窗打开后的权限加载
 * 2. Apply 前的差异计算
 * 3. Apply 过程中的成功/失败反馈
 * 4. container / item 两类弹窗共用的状态消息拼装
 */
export const usePermissionDialogApiRequestState = <
  TEntriesByTab,
  TChanges extends IPermissionDialogChangeSetShape,
>({
  open,
  isTargetReady,
  searchError,
  resourceLabel,
  createEmptyEntriesByTab,
  originalEntriesByTab,
  draftEntriesByTab,
  replaceEntries,
  loadPermissions,
  computeChanges,
  applyChanges,
}: IUsePermissionDialogApiRequestStateOptions<TEntriesByTab, TChanges>) => {
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [isApplyingPermissions, setIsApplyingPermissions] = useState(false);
  const [permissionRequestErrorMessage, setPermissionRequestErrorMessage] =
    useState<string | null>(null);
  const [applyFeedbackStatus, setApplyFeedbackStatus] =
    useState<PermissionApplyFeedbackStatus>(null);

  const requestMessages = useMemo(
    () => ({
      missingTarget: `No ${resourceLabel} selected.`,
      loadErrorFallback: `Unable to load current ${resourceLabel} permissions.`,
      prepareErrorFallback: `Unable to prepare ${resourceLabel} permission changes.`,
      applyErrorFallback: `Unable to apply ${resourceLabel} permission changes.`,
    }),
    [resourceLabel],
  );

  const permissionStatusMessages = useMemo(
    () =>
      buildPermissionStatusMessages(permissionRequestErrorMessage, searchError),
    [permissionRequestErrorMessage, searchError],
  );

  /**
   * 缺少目标资源或加载失败时，用空列表重置本地基线与草稿。
   */
  const resetToEmptyEntries = useCallback(() => {
    replaceEntries(createEmptyEntriesByTab());
  }, [createEmptyEntriesByTab, replaceEntries]);

  /**
   * 计算当前草稿相对最近一次已确认基线的差异。
   */
  const prepareChanges = useCallback(() => {
    return computeChanges(originalEntriesByTab, draftEntriesByTab);
  }, [computeChanges, draftEntriesByTab, originalEntriesByTab]);

  /**
   * 判断这次 Apply 是否真的存在可提交的变化。
   */
  const hasChanges = useCallback((changes: TChanges) => {
    return (
      changes.create.length > 0 ||
      changes.update.length > 0 ||
      changes.remove.length > 0
    );
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!isTargetReady) {
      setIsLoadingPermissions(false);
      setIsApplyingPermissions(false);
      resetToEmptyEntries();
      setPermissionRequestErrorMessage(requestMessages.missingTarget);
      setApplyFeedbackStatus(null);
      return;
    }

    let cancelled = false;
    setIsLoadingPermissions(true);
    setPermissionRequestErrorMessage(null);
    setApplyFeedbackStatus(null);

    void loadPermissions()
      .then((entriesByTab) => {
        if (cancelled) {
          return;
        }

        // 成功后直接用服务端最新结果同时刷新 original 与 draft。
        replaceEntries(entriesByTab);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        resetToEmptyEntries();
        setPermissionRequestErrorMessage(
          formatPermissionRequestErrorMessage(
            error,
            requestMessages.loadErrorFallback,
          ),
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPermissions(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    open,
    isTargetReady,
    requestMessages,
    resetToEmptyEntries,
    replaceEntries,
    loadPermissions,
  ]);

  /**
   * 计算并提交当前草稿相对基线的权限差异。
   */
  const handleApply = async () => {
    let changes: TChanges;

    try {
      changes = prepareChanges();
    } catch (error: unknown) {
      setPermissionRequestErrorMessage(
        formatPermissionRequestErrorMessage(
          error,
          requestMessages.prepareErrorFallback,
        ),
      );
      setApplyFeedbackStatus("error");
      return;
    }

    if (!hasChanges(changes)) {
      return;
    }

    setIsApplyingPermissions(true);
    setPermissionRequestErrorMessage(null);
    setApplyFeedbackStatus(null);

    try {
      const refreshedEntries = await applyChanges(changes);
      // Apply 成功后用后端返回值重建基线，顺便清掉本地脏状态。
      replaceEntries(refreshedEntries);
      setApplyFeedbackStatus("success");
    } catch (error: unknown) {
      setPermissionRequestErrorMessage(
        formatPermissionRequestErrorMessage(
          error,
          requestMessages.applyErrorFallback,
        ),
      );
      setApplyFeedbackStatus("error");
    } finally {
      setIsApplyingPermissions(false);
    }
  };

  return {
    isLoadingPermissions,
    isApplyingPermissions,
    permissionRequestErrorMessage,
    applyFeedbackStatus,
    permissionStatusMessages,
    handleApply,
  };
};
