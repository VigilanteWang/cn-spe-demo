import { useCallback, useEffect, useState } from "react";
import {
  ITEM_LINK_PERMISSION_SCOPE_VALUES,
  ITEM_LINK_PERMISSION_TYPES,
  type IItemLinkPermissionComputedEntry,
  type IItemLinkPermissionEntryForUI,
  type IItemLinkPermissionRecipientCandidate,
  type ItemLinkPermissionScope,
  type ItemLinkPermissionType,
} from "../models/itemLinkPermissionModels";
import { useItemLinkPermissionComputedEntries } from "./useItemLinkPermissionComputedEntries";
import { useItemLinkPermissionDiff } from "./useItemLinkPermissionDiff";

interface IUseItemLinkPermissionUIStateOptions {
  /** 当前编辑目标的重置键，用来驱动 diff hook 在切换 item 时清会话状态。 */
  resetKey: string;
  /** 来自请求层的后端确认基线，供 UI 合并本地草稿后渲染。 */
  originalEntries: IItemLinkPermissionEntryForUI[];
  /** 可选的上层重置入口，用来顺手清掉 links 懒加载基线。 */
  onResetLoadState?: () => void;
}

/**
 * 管理 itemLinkPermissionPanel 的本地编辑状态和行级交互。
 *
 * 这一层不直接拥有后端基线，而是把：
 * 1. 创建区的 scope/type 选择
 * 2. 本地 diff 差异
 * 3. 供渲染使用的 computed entries
 * 4. 行级交互事件
 * 统一编排成 links Panel 可直接消费的一组状态。
 *
 * @param options links Panel 当前依赖的基线与重置配置。
 * @returns links tab 需要的渲染数据、创建区状态和交互回调。
 */
export const useItemLinkPermissionUIState = ({
  resetKey,
  originalEntries,
  onResetLoadState,
}: IUseItemLinkPermissionUIStateOptions) => {
  // 创建区当前选中的 scope。新增 link 时会直接使用这个值参与生成 diff entry。
  const [createLinkScope, setCreateLinkScope] =
    useState<ItemLinkPermissionScope>(ITEM_LINK_PERMISSION_SCOPE_VALUES[0]);
  // 创建区当前选中的 type。它和 scope 一起组成“准备新增哪一种 link”的组合。
  const [createLinkType, setCreateLinkType] = useState<ItemLinkPermissionType>(
    ITEM_LINK_PERMISSION_TYPES[0],
  );
  // 这一层只接管 links 草稿本身的增删改语义，不直接碰后端基线。
  const {
    diff,
    hasUnsavedChanges,
    addCreatedLink,
    removeCreatedLink,
    deletePersistedLink,
    addRecipientToCreatedLink,
    removeRecipientFromCreatedLink,
    addGrantRecipient,
    addRevokeRecipient,
    resetDiff,
  } = useItemLinkPermissionDiff(resetKey);

  // 把“后端基线 + 本地 diff”合并成真正供列表渲染的 entries，
  // 并顺手算出是否存在阻塞 Apply 的校验错误。
  const computedPermissions = useItemLinkPermissionComputedEntries(
    originalEntries,
    diff,
  );

  /**
   * 重置 links 区当前会话里的本地 diff，并把创建区选择恢复到稳定默认值。
   *
   * 这个回调用于“放弃本地编辑”一类场景。它只处理前端草稿态，
   * 不负责清理上层请求层缓存或重新拉取后端基线。
   */
  const resetDiffState = useCallback(() => {
    // “放弃本地编辑”时，同时把新增区的默认选择恢复到首个可选项。
    resetDiff();
    setCreateLinkScope(ITEM_LINK_PERMISSION_SCOPE_VALUES[0]);
    setCreateLinkType(ITEM_LINK_PERMISSION_TYPES[0]);
  }, [resetDiff]);

  /**
   * 重置整个 links section 的本地状态，并按需通知上层清掉加载基线。
   *
   * 这个回调比 `resetDiffState` 多做一层 orchestration：
   * 除了清本地 diff，还会调用可选的 `onResetLoadState`，
   * 让上层在切 item 或关闭弹窗时一起丢掉懒加载出来的 links 基线。
   */
  const resetSectionState = useCallback(() => {
    // 这一层负责 links 区整体重置：既清差异，也允许上层顺手清掉加载基线。
    resetDiffState();
    onResetLoadState?.();
  }, [onResetLoadState, resetDiffState]);

  /**
   * 按创建区当前选中的 scope/type 新增一条 link 草稿。
   *
   * 返回值是新建 diff entry 的本地 id，供面板层在需要时做后续 UI 行为，
   * 比如新增 specific link 后自动展开 recipients 区域。
   *
   * @returns 新建 link 草稿的本地 entry id。
   */
  const onAddLink = useCallback(() => {
    // 新建 link 时，使用创建区当前选中的 scope/type 生成 diff entry。
    return addCreatedLink(createLinkScope, createLinkType);
  }, [addCreatedLink, createLinkScope, createLinkType]);

  /**
   * 删除一条当前列表里的 link。
   *
   * 对 diff 行和 persisted 行，这里的删除语义不同：
   * diff 行直接从本地 createdLinks 草稿里移除；
   * persisted 行则记录 delete 差异，等待用户点击 Apply 后再真正写回后端。
   *
   * @param entry 当前准备删除的 link 行。
   */
  const onDeleteLink = useCallback(
    (entry: IItemLinkPermissionComputedEntry) => {
      // diff 行和 persisted 行的删除语义不同：
      // - diff 行：直接从 createdLinks 中拿掉
      // - persisted 行：记录 delete 差异，等待 Apply
      if (entry.source === "diff") {
        removeCreatedLink(entry.id);
        return;
      }

      if (entry.permissionId) {
        deletePersistedLink(entry.permissionId);
      }
    },
    [deletePersistedLink, removeCreatedLink],
  );

  /**
   * 为指定 link 添加一个 recipient。
   *
   * 新建 link 的 recipient 仍属于本地草稿，因此直接写入 created diff；
   * 已存在 link 的 recipient 则会被转成 grant 差异，等待统一 Apply。
   *
   * @param entry 当前要加人的 link 行。
   * @param candidate 当前选中的 people/group 候选对象。
   */
  const onAddRecipient = useCallback(
    (
      entry: IItemLinkPermissionComputedEntry,
      candidate: IItemLinkPermissionRecipientCandidate,
    ) => {
      // 新建 link 的 recipient 直接写进 created diff；
      // 已存在 link 的 recipient 则记成 grant 差异。
      if (entry.source === "diff") {
        addRecipientToCreatedLink(entry.id, candidate);
        return;
      }

      if (entry.permissionId) {
        addGrantRecipient(entry.permissionId, candidate);
      }
    },
    [addGrantRecipient, addRecipientToCreatedLink],
  );

  /**
   * 从指定 link 移除一个 recipient。
   *
   * 对新建 link，会直接修改本地 created diff；
   * 对 persisted link，则先根据 recipientKey 在当前 UI entry 中找到对应对象，
   * 再把这次操作转成 revoke 差异，而不是直接改写原始基线。
   *
   * @param entry 当前要删人的 link 行。
   * @param recipientKey 当前准备移除的 recipient 唯一键。
   */
  const onRemoveRecipient = useCallback(
    (entry: IItemLinkPermissionComputedEntry, recipientKey: string) => {
      // 新建 link 里的 recipient 还只存在于本地草稿，因此直接从 created diff 里删除。
      if (entry.source === "diff") {
        removeRecipientFromCreatedLink(entry.id, recipientKey);
        return;
      }

      // persisted 行必须有真实 permissionId，后续 revoke 才能精确指向后端对象。
      if (!entry.permissionId) {
        return;
      }

      // 先从当前 UI entry 中找到要删除的 recipient，
      // 再把它转成 revoke 语义写进 diff，而不是直接篡改 originalEntries。
      const recipient = entry.recipients.find(
        (currentRecipient) => currentRecipient.key === recipientKey,
      );

      if (!recipient) {
        return;
      }

      // persisted 行里的“删人”不是立即改原始列表，而是记一条 revoke 差异。
      addRevokeRecipient(entry.permissionId, recipient.candidate);
    },
    [addRevokeRecipient, removeRecipientFromCreatedLink],
  );

  useEffect(() => {
    // 这个 effect 的职责不是“只跟着 scope 变动”，
    // 而是持续校验“当前 scope + type 组合是否仍然可新增”。
    // 只要已存在 entries 变了，或者用户当前选择变了，都重新跑一轮纠正逻辑。
    const nextAvailableCombo = resolveNextAvailableCreateLinkCombo(
      computedPermissions.entries,
      createLinkScope,
      createLinkType,
    );

    // 所有 scope:type 都被占满时，保留现状并把“不可新增”的判断交给 Panel 层处理。
    if (!nextAvailableCombo) {
      return;
    }

    // 只有当 resolver 计算出的更正值与当前选择不同，才真正触发状态更新，
    // 这样 effect 会快速收敛，不会因为依赖包含 scope/type 而无限循环。
    if (nextAvailableCombo.scope !== createLinkScope) {
      setCreateLinkScope(nextAvailableCombo.scope);
    }

    if (nextAvailableCombo.type !== createLinkType) {
      setCreateLinkType(nextAvailableCombo.type);
    }
  }, [createLinkScope, createLinkType, computedPermissions.entries]);

  return {
    // 列表真正渲染的 entries 来自“基线 + diff”合并结果，而不是原始基线本身。
    entries: computedPermissions.entries,
    createLinkScope,
    createLinkType,
    setCreateLinkScope,
    setCreateLinkType,
    diff,
    hasUnsavedChanges,
    hasBlockingValidationError: computedPermissions.hasBlockingValidationError,
    resetDiffState,
    resetSectionState,
    onAddLink,
    onDeleteLink,
    onCopyLink: (webUrl: string) => {
      // links  Panel 不额外包一层提示，复制行为保持为尽力写入剪贴板。
      void navigator.clipboard?.writeText(webUrl);
    },
    onAddRecipient,
    onRemoveRecipient,
  };
};

/**
 * 为 links 创建区解析下一个可用的 scope/type 组合。
 *
 * 选择顺序遵循“尽量少改动当前选择”的原则：
 * 1. 当前组合还能用时，直接保留当前 scope 和 type。
 * 2. 当前组合已占用时，优先只在当前 scope 下切换到下一个可用 type。
 * 3. 当前 scope 已经没有可用 type 时，再按常量顺序扫描其他 scope。
 * 4. 如果所有组合都已占满，则返回 null，让上层知道已经没有可新增的 link。
 *
 * @param entries 当前 Panel 里已经存在的 link 条目，包含后端基线和前端草稿。
 * @param currentScope 当前创建区选中的 scope。
 * @param currentType 当前创建区选中的 type。
 * @returns 下一个可用的创建组合；如果所有组合都已占用，则返回 null。
 */
const resolveNextAvailableCreateLinkCombo = (
  entries: IItemLinkPermissionComputedEntry[],
  currentScope: ItemLinkPermissionScope,
  currentType: ItemLinkPermissionType,
): { scope: ItemLinkPermissionScope; type: ItemLinkPermissionType } | null => {
  // 先把已存在的 scope:type 组合收敛成集合，方便后面统一做占用判断。
  const occupiedKeys = new Set(
    entries.map((entry) => createScopeTypeKey(entry.scope, entry.type)),
  );

  // 当前组合还没被占用时，不调整用户选择，直接继续使用它。
  if (!occupiedKeys.has(createScopeTypeKey(currentScope, currentType))) {
    return {
      scope: currentScope,
      type: currentType,
    };
  }

  // 当前组合已占用时，优先保留当前 scope，只在同一个 scope 下寻找下一个可用 type。
  const currentScopeAvailableType = ITEM_LINK_PERMISSION_TYPES.find(
    (type) => !occupiedKeys.has(createScopeTypeKey(currentScope, type)),
  );

  if (currentScopeAvailableType) {
    // 这里显式保留 currentScope，表达的是“优先尊重用户刚选中的 scope，
    // 只有 type 撞车时，才在同 scope 下替换成下一个可用 type”。
    return {
      scope: currentScope,
      type: currentScopeAvailableType,
    };
  }

  // 当前 scope 已经没有空位后，再按既定顺序扫描其他 scope，取全局第一个可用组合。
  for (const scope of ITEM_LINK_PERMISSION_SCOPE_VALUES) {
    const availableType = ITEM_LINK_PERMISSION_TYPES.find(
      (type) => !occupiedKeys.has(createScopeTypeKey(scope, type)),
    );

    if (availableType) {
      return {
        scope,
        type: availableType,
      };
    }
  }

  // 所有 scope:type 组合都已占用时，返回 null 交给上层处理“不可新增”的状态。
  return null;
};

/**
 * 用 `scope:type` 组合生成稳定键，统一用于占用判断和去重比较。
 *
 * @param scope link 的分享范围。
 * @param type link 的权限类型。
 * @returns 适合放入 `Set` 做组合占用判断的字符串键。
 */
const createScopeTypeKey = (
  scope: ItemLinkPermissionScope,
  type: ItemLinkPermissionType,
) => `${scope}:${type}`;
