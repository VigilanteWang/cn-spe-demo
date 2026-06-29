import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  IItemLinkPermissionDiffState,
  IItemLinkPermissionRecipientCandidate,
  ItemLinkPermissionScope,
  ItemLinkPermissionType,
} from "../models/itemLinkPermissionModels";
import {
  createItemLinkPermissionCreatedLinkDiff,
  createEmptyItemLinkPermissionDiffState,
  getItemLinkPermissionRecipientKey,
  hasItemLinkPermissionDiffChanges,
} from "../utils/itemLinkPermissionUiUtils";

/**
 * 管理 links 面板的本地差异状态。
 *
 * links 与 people/groups 不同，不直接维护一份“整表草稿快照”，
 * 而是只记录 create/delete/grant/revoke 这四类最小差异。
 *
 * @param resetKey 当前文件项的会话重置键；目标项切换时，用它清空旧差异。
 * @returns links 面板的差异状态、未保存标记，以及所有差异修改方法。
 */
export const useItemLinkPermissionDiff = (resetKey: string) => {
  // 新建一个空的 links diff，里面只记录 create/delete/grant/revoke 差异。
  const [diff, setDiff] = useState<IItemLinkPermissionDiffState>(
    createEmptyItemLinkPermissionDiffState(),
  );
  // 为本地新建但尚未提交的 link 生成稳定 id，便于 UI 在一次编辑会话里持续定位同一行。
  const createdLinkSequence = useRef(0);

  useEffect(() => {
    // 切换到新的文件项后，丢弃上一轮 links 编辑会话的所有本地差异。
    createdLinkSequence.current = 0;
    setDiff(createEmptyItemLinkPermissionDiffState());
  }, [resetKey]);

  /**
   * 记录一条“新建 link”差异。
   *
   * 这里不是立刻请求后端创建 link，而是先往本地 diff 中追加一条 created entry，
   * 让 UI 能先把这条 link 当作草稿行渲染出来，等用户点击 Apply 时再统一提交。
   *
   * @param scope 新建 link 的 scope。
   * @param type 新建 link 的 type。
   * @returns 新建或复用的本地 created link id。
   */
  const addCreatedLink = useCallback(
    (scope: ItemLinkPermissionScope, type: ItemLinkPermissionType): string => {
      // `setDiff` 是异步批量更新的，因此用外层变量把本次生成/复用的 id 带回调用方。
      let createdOrExistingId = "";

      setDiff((currentDiff) => {
        // 同一个 scope/type 组合在本地只允许存在一条新建差异；
        // 如果已经建过，就复用已有 id，避免创建区重复堆积相同 link。
        const existingEntry = currentDiff.createdLinks.find(
          (entry) => entry.scope === scope && entry.type === type,
        );

        if (existingEntry) {
          createdOrExistingId = existingEntry.id;
          return currentDiff;
        }

        // 只有确实需要新增时才推进序号，避免“查重命中”也消耗掉一个编号。
        const nextId = `diff-item-link:${createdLinkSequence.current + 1}`;
        createdLinkSequence.current += 1;
        createdOrExistingId = nextId;

        return {
          ...currentDiff,
          createdLinks: [
            ...currentDiff.createdLinks,
            // 新建 link 先落到本地差异里，真正提交后才会变成 persisted entry。
            createItemLinkPermissionCreatedLinkDiff(nextId, scope, type),
          ],
        };
      });

      return createdOrExistingId;
    },
    [],
  );

  /**
   * 撤回一条尚未提交的新建 link。
   *
   * @param createdLinkId 本地 created link id。
   */
  const removeCreatedLink = useCallback((createdLinkId: string) => {
    setDiff((currentDiff) => ({
      ...currentDiff,
      // 只从“本地新建但尚未提交”的集合里移除，不影响后端已有 link。
      createdLinks: currentDiff.createdLinks.filter(
        (entry) => entry.id !== createdLinkId,
      ),
    }));
  }, []);

  /**
   * 记录一条“删除后端已有 link”的差异。
   *
   * @param permissionId 后端 persisted link 对应的 permission id。
   */
  const deletePersistedLink = useCallback((permissionId: string) => {
    setDiff((currentDiff) => {
      // 对后端已有 link，不直接删整条数据，而是记一条 delete 差异。
      const nextDeletedPermissionIds =
        currentDiff.deletedPermissionIds.includes(permissionId)
          ? currentDiff.deletedPermissionIds
          : [...currentDiff.deletedPermissionIds, permissionId];
      // delete 之后，这条 link 上附着的 grant / revoke 局部改动都不再有意义，
      // 因为整条 link 最终都会被删除。
      const nextGrantsByPermissionId = { ...currentDiff.grantsByPermissionId };
      const nextRevokesByPermissionId = {
        ...currentDiff.revokesByPermissionId,
      };

      // 一条 link 一旦整体删除，它下面的 grant/revoke 差异就失去意义，需要一起清掉。
      delete nextGrantsByPermissionId[permissionId];
      delete nextRevokesByPermissionId[permissionId];

      return {
        ...currentDiff,
        deletedPermissionIds: nextDeletedPermissionIds,
        grantsByPermissionId: nextGrantsByPermissionId,
        revokesByPermissionId: nextRevokesByPermissionId,
      };
    });
  }, []);

  /**
   * 给本地新建的 specific link 追加一个 recipient。
   *
   * @param createdLinkId 本地 created link id。
   * @param candidate 本次要加入的新 recipient。
   */
  const addRecipientToCreatedLink = useCallback(
    (
      createdLinkId: string,
      candidate: IItemLinkPermissionRecipientCandidate,
    ) => {
      // 用统一 recipient key 做去重，避免同一个对象因为展示字段不同被重复加入。
      const candidateKey = getItemLinkPermissionRecipientKey(candidate);

      setDiff((currentDiff) => ({
        ...currentDiff,
        // `createdLinks` 是数组状态，因此这里通过 map 产出一个新数组，
        // 未命中的 entry 复用原对象，命中的 entry 再按需生成新对象。
        createdLinks: currentDiff.createdLinks.map((entry) => {
          if (entry.id !== createdLinkId) {
            return entry;
          }

          // 新建 specific link 的 recipients 直接挂在这条 created diff 上。
          const alreadyExists = entry.recipients.some(
            (recipient) =>
              getItemLinkPermissionRecipientKey(recipient) === candidateKey,
          );

          if (alreadyExists) {
            // 已存在时直接复用原 entry，避免制造无意义的新引用。
            return entry;
          }

          return {
            ...entry,
            // 只在命中目标 created link 且确认未重复时，才把 candidate 挂到 recipients 末尾。
            recipients: [...entry.recipients, candidate],
          };
        }),
      }));
    },
    [],
  );

  /**
   * 从本地新建的 specific link 中移除一个 recipient。
   *
   * @param createdLinkId 本地 created link id。
   * @param recipientKey 要移除的 recipient 稳定 key。
   */
  const removeRecipientFromCreatedLink = useCallback(
    (createdLinkId: string, recipientKey: string) => {
      setDiff((currentDiff) => ({
        ...currentDiff,
        // 从本地新建 link 的 recipients 中移除目标对象。
        createdLinks: currentDiff.createdLinks.map((entry) =>
          entry.id === createdLinkId
            ? {
                ...entry,
                recipients: entry.recipients.filter(
                  (recipient) =>
                    getItemLinkPermissionRecipientKey(recipient) !==
                    recipientKey,
                ),
              }
            : entry,
        ),
      }));
    },
    [],
  );

  /**
   * 给后端已有的 specific link 记录一条 grant 差异。
   *
   * @param permissionId persisted link 的 permission id。
   * @param candidate 本次要新增的 recipient。
   */
  const addGrantRecipient = useCallback(
    (
      permissionId: string,
      candidate: IItemLinkPermissionRecipientCandidate,
    ) => {
      setDiff((currentDiff) => {
        // 常规路径下，“加人”直接记 grant；
        // 只有当前对象已经存在 revoke 差异时，才需要改走“抵消 revoke”的分支。
        const existingRevokes = currentDiff.revokesByPermissionId[permissionId];

        if (!existingRevokes || existingRevokes.length === 0) {
          return {
            ...currentDiff,
            grantsByPermissionId: addCandidateToRecipientMap(
              currentDiff.grantsByPermissionId,
              permissionId,
              candidate,
            ),
          };
        }

        // 同一个对象如果上一拍被标记为 revoke，现在又重新 add，
        // 应优先抵消 revoke，而不是同时留下 grant + revoke 两条相反差异。
        const candidateKey = getItemLinkPermissionRecipientKey(candidate);
        const filteredRevokes = existingRevokes.filter(
          (recipient) =>
            getItemLinkPermissionRecipientKey(recipient) !== candidateKey,
        );

        if (filteredRevokes.length !== existingRevokes.length) {
          // 命中时说明“重新 add”的其实是刚刚本地 revoke 掉的人；
          // 此时不该再补 grant，而应把那条相反的 revoke 差异移除。
          const nextRevokesByPermissionId = {
            ...currentDiff.revokesByPermissionId,
          };

          if (filteredRevokes.length === 0) {
            // 当前 permissionId 下的 revoke 已经被抵消干净时，直接删掉整个 key，
            // 保持 diff map 只保存“仍然存在差异”的项。
            delete nextRevokesByPermissionId[permissionId];
          } else {
            nextRevokesByPermissionId[permissionId] = filteredRevokes;
          }

          return {
            ...currentDiff,
            revokesByPermissionId: nextRevokesByPermissionId,
          };
        }

        return {
          ...currentDiff,
          // 对后端已有 specific link 的“加人”只记 grant 差异。
          grantsByPermissionId: addCandidateToRecipientMap(
            currentDiff.grantsByPermissionId,
            permissionId,
            candidate,
          ),
        };
      });
    },
    [],
  );

  /**
   * 给后端已有的 specific link 记录一条 revoke 差异。
   *
   * 这条路径先尝试从 grant map 中撤回同一个 candidate：
   * 如果能撤回，说明它只是本地刚加、尚未提交；如果撤不回，才说明要真正记 revoke。
   *
   * @param permissionId persisted link 的 permission id。
   * @param candidate 本次要移除的 recipient。
   */
  const addRevokeRecipient = useCallback(
    (
      permissionId: string,
      candidate: IItemLinkPermissionRecipientCandidate,
    ) => {
      setDiff((currentDiff) => {
        // 如果这个对象本来只是本地新增、还没真正提交，
        // 那么移除它时应直接取消 grant，而不是再补一条 revoke。
        const nextGrantsByPermissionId = removeCandidateFromRecipientMap(
          currentDiff.grantsByPermissionId,
          permissionId,
          candidate,
        );

        if (nextGrantsByPermissionId !== currentDiff.grantsByPermissionId) {
          // 这里通过“引用是否变化”判断是否真的删掉了一条未提交 grant。
          return {
            ...currentDiff,
            grantsByPermissionId: nextGrantsByPermissionId,
          };
        }

        return {
          ...currentDiff,
          // 只有对象原本就在后端基线里时，才需要记 revoke 差异。
          revokesByPermissionId: addCandidateToRecipientMap(
            currentDiff.revokesByPermissionId,
            permissionId,
            candidate,
          ),
        };
      });
    },
    [],
  );

  /**
   * 清空 links 面板当前会话里的全部本地差异。
   */
  const resetDiff = useCallback(() => {
    // 只重置 links 的本地差异，不触碰后端已加载基线。
    setDiff(createEmptyItemLinkPermissionDiffState());
  }, []);

  return {
    diff,
    hasUnsavedChanges: useMemo(
      () =>
        // 这个布尔值给外层 UI 判断“是否需要提示未保存”；
        // 只要四类 diff 中任意一类非空，就视为有未提交改动。
        hasItemLinkPermissionDiffChanges(diff),
      [diff],
    ),
    addCreatedLink,
    removeCreatedLink,
    deletePersistedLink,
    addRecipientToCreatedLink,
    removeRecipientFromCreatedLink,
    addGrantRecipient,
    addRevokeRecipient,
    resetDiff,
  };
};

/**
 * 向某个 recipient diff map 中追加一个 candidate。
 *
 * 这个工具函数同时服务于 grant / revoke 两类 map：
 * - key: permissionId
 * - value: 该 permissionId 下需要额外处理的一组 recipients
 *
 * @param recipientMap 目标 recipient diff map。
 * @param permissionId 本次要写入的 permission id。
 * @param candidate 本次要追加的 recipient。
 * @returns 追加后的新 map；若已存在同一 candidate，则返回原 map 引用。
 */
const addCandidateToRecipientMap = (
  recipientMap: Record<string, IItemLinkPermissionRecipientCandidate[]>,
  permissionId: string,
  candidate: IItemLinkPermissionRecipientCandidate,
) => {
  // grant / revoke 两类 recipient map 共用同一套去重追加逻辑。
  const candidateKey = getItemLinkPermissionRecipientKey(candidate);
  const currentRecipients = recipientMap[permissionId] ?? [];
  const alreadyExists = currentRecipients.some(
    (recipient) =>
      getItemLinkPermissionRecipientKey(recipient) === candidateKey,
  );

  if (alreadyExists) {
    // 已存在时直接返回原引用，让调用方知道“这次没有产生实际变化”。
    return recipientMap;
  }

  return {
    ...recipientMap,
    // 若该 permissionId 之前还没有数组，这里会从空数组开始追加第一项。
    [permissionId]: [...currentRecipients, candidate],
  };
};

/**
 * 从某个 recipient diff map 中移除一个 candidate。
 *
 * 这个函数只关心“这个 candidate 是否存在于传入 map 里”，
 * 不关心它在 persisted 基线里原本是否存在。调用方会根据“是否删成功”
 * 来判断这次操作应该视为“撤回未提交 grant”还是“补一条 revoke diff”。
 *
 * @param recipientMap 目标 recipient diff map。
 * @param permissionId 本次要处理的 permission id。
 * @param candidate 本次要移除的 recipient。
 * @returns 移除后的新 map；若没找到 candidate，则返回原 map 引用。
 */
const removeCandidateFromRecipientMap = (
  recipientMap: Record<string, IItemLinkPermissionRecipientCandidate[]>,
  permissionId: string,
  candidate: IItemLinkPermissionRecipientCandidate,
) => {
  const currentRecipients = recipientMap[permissionId];

  if (!currentRecipients) {
    // 当前 permissionId 在 map 里没有记录，说明这里根本没有可撤回的本地 diff。
    return recipientMap;
  }

  const candidateKey = getItemLinkPermissionRecipientKey(candidate);
  const nextRecipients = currentRecipients.filter(
    (recipient) =>
      getItemLinkPermissionRecipientKey(recipient) !== candidateKey,
  );

  if (nextRecipients.length === currentRecipients.length) {
    // 长度不变说明目标 candidate 不在这个 map 里；
    // 返回原引用，让调用方按“未命中 grant”继续后续分支判断。
    return recipientMap;
  }

  if (nextRecipients.length === 0) {
    // 这个 permissionId 下的 recipient 已经删空时，直接移除整条 key，
    // 避免在 diff map 里留下一个语义上无意义的空数组。
    const nextRecipientMap = { ...recipientMap };
    delete nextRecipientMap[permissionId];
    return nextRecipientMap;
  }

  return {
    ...recipientMap,
    // 若删完后还剩其他 recipient，则只更新这一个 permissionId 对应的数组。
    [permissionId]: nextRecipients,
  };
};
