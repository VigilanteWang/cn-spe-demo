import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildPermissionErrorMessages,
  type PermissionApplyFeedbackStatus,
} from "../utils/permissionDialogSharedUtils";
import {
  AppError,
  formatAppErrorMessageForUI,
} from "../../../common/errors.ts";

/**
 * 共享权限弹窗差异结果需要满足的最小结构。
 *
 * 这个 Hook 只关心“是否有 create / update / remove 三类变更”，
 * 不关心每条变更项内部的具体字段。
 */
interface IPermissionDialogChangeSetShape {
  create: unknown[];
  update: unknown[];
  remove: unknown[];
}

/**
 * 通用权限请求状态 Hook 的输入参数。
 *
 * @typeParam TEntriesByTab 按 tab 分组后的权限数据结构。
 * @typeParam TChanges 计算得到的权限变更结构，至少要包含 create/update/remove 三类集合。
 */
interface IUsePermissionDialogApiRequestStateOptions<
  TEntriesByTab,
  TChanges extends IPermissionDialogChangeSetShape,
> {
  /** 弹窗是否打开。 */
  open: boolean;
  /** 当前是否已经具备加载/提交权限所需的目标资源标识。 */
  isTargetReady: boolean;
  /** 来自主体搜索区的错误对象，用于合并成统一状态消息。 */
  searchError: unknown;
  /** 当前操作的是 container 还是 item，用来拼接用户可读提示文案。 */
  resourceLabel: "container" | "item";
  /** 返回一份空的按 tab 分组权限结构，用于缺少目标或加载失败时重置本地状态。 */
  createEmptyEntriesByTab: () => TEntriesByTab;
  /** 当前已确认的后端权限基线。 */
  originalEntriesByTab: TEntriesByTab;
  /** 用户正在编辑的本地权限草稿。 */
  draftEntriesByTab: TEntriesByTab;
  /** 同时替换基线和草稿，保证两份状态重新对齐。 */
  replaceEntries: (entriesByTab: TEntriesByTab) => void;
  /** 从后端读取最新权限快照。 */
  loadPermissions: () => Promise<TEntriesByTab>;
  /** 基于基线和草稿计算本次 Apply 需要提交的变更。 */
  computeChanges: (
    originalEntriesByTab: TEntriesByTab,
    draftEntriesByTab: TEntriesByTab,
  ) => TChanges;
  /** 把差异写回后端，并返回应用后的最新权限快照。 */
  applyChanges: (changes: TChanges) => Promise<TEntriesByTab>;
}

/**
 * 管理权限弹窗的 API 请求生命周期状态。
 *
 * 这个 Hook 统一处理：
 * 1. 弹窗打开后的权限加载
 * 2. Apply 前的差异计算
 * 3. Apply 过程中的成功/失败反馈
 * 4. container / item 共用的状态消息拼装
 *
 * @typeParam TEntriesByTab 按 tab 分组后的权限数据结构。
 * @typeParam TChanges 计算得到的权限变更结构。
 * @param options Hook 运行所需的外层状态与请求能力。
 * @returns 供弹窗界面使用的加载状态、反馈消息和 Apply 处理函数。
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

  // 把缺少目标资源建模成稳定的前端验证错误，避免组件层继续依赖裸字符串判断。
  const missingTargetError = useMemo(
    () => ({
      missingTarget: new AppError({
        name: "PermissionValidationError",
        code: "missingTarget",
        message: `No ${resourceLabel} selected.`,
        originError: {
          source: "validation",
        },
      }),
    }),
    [resourceLabel],
  );

  // load / prepare / apply 三类兜底文案继续单独保留，专门用于请求阶段无法拿到结构化错误时的降级展示。
  const requestFallbackErrorMessages = useMemo(
    () => ({
      loadErrorFallback: `Unable to load current ${resourceLabel} permissions.`,
      prepareErrorFallback: `Unable to prepare ${resourceLabel} permission changes.`,
      applyErrorFallback: `Unable to apply ${resourceLabel} permission changes.`,
    }),
    [resourceLabel],
  );

  // 顶部状态区需要把请求错误和搜索错误合并成统一的展示消息列表。
  const permissionErrorMessages = useMemo(
    () =>
      buildPermissionErrorMessages(permissionRequestErrorMessage, searchError),
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
   *
   * @returns 可提交给后端的权限差异对象。
   */
  const prepareChanges = useCallback(() => {
    return computeChanges(originalEntriesByTab, draftEntriesByTab);
  }, [computeChanges, draftEntriesByTab, originalEntriesByTab]);

  /**
   * 判断这次 Apply 是否真的存在可提交的变化。
   *
   * @param changes 当前准备提交的差异对象。
   * @returns 只要三类变更中任意一类非空，就说明需要调用后端 apply。
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
      // 没有选中 container / item 时，直接回到空状态，并给出明确提示。
      setIsLoadingPermissions(false);
      setIsApplyingPermissions(false);
      resetToEmptyEntries();
      setPermissionRequestErrorMessage(
        formatAppErrorMessageForUI(
          missingTargetError.missingTarget,
          missingTargetError.missingTarget.message,
        ),
      );
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

        // 成功后直接用服务端最新结果同时刷新 original 与 draft，避免沿用过期草稿。
        replaceEntries(entriesByTab);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        // 读取失败时把本地权限清空，避免界面继续显示旧资源或旧请求留下的数据。
        resetToEmptyEntries();
        setPermissionRequestErrorMessage(
          formatAppErrorMessageForUI(
            error,
            requestFallbackErrorMessages.loadErrorFallback,
          ),
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPermissions(false);
        }
      });

    return () => {
      // 弹窗关闭或依赖变化后，阻止过期请求再回写状态。
      cancelled = true;
    };
  }, [
    open,
    isTargetReady,
    missingTargetError,
    requestFallbackErrorMessages,
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
      // 差异计算阶段出错时，不进入真正的保存流程，直接给出 prepare 阶段反馈。
      setPermissionRequestErrorMessage(
        formatAppErrorMessageForUI(
          error,
          requestFallbackErrorMessages.prepareErrorFallback,
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
        formatAppErrorMessageForUI(
          error,
          requestFallbackErrorMessages.applyErrorFallback,
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
    permissionErrorMessages,
    handleApply,
  };
};
