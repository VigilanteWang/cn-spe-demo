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
} from "../services/itemLinkPermissionUiUtils";

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
  const createdLinkSequence = useRef(0);

  useEffect(() => {
    // 切换到新的文件项后，丢弃上一轮 links 编辑会话的所有本地差异。
    createdLinkSequence.current = 0;
    setDiff(createEmptyItemLinkPermissionDiffState());
  }, [resetKey]);

  const addCreatedLink = useCallback(
    (scope: ItemLinkPermissionScope, type: ItemLinkPermissionType): string => {
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

  const removeCreatedLink = useCallback((createdLinkId: string) => {
    setDiff((currentDiff) => ({
      ...currentDiff,
      // 只从“本地新建但尚未提交”的集合里移除，不影响后端已有 link。
      createdLinks: currentDiff.createdLinks.filter(
        (entry) => entry.id !== createdLinkId,
      ),
    }));
  }, []);

  const deletePersistedLink = useCallback((permissionId: string) => {
    setDiff((currentDiff) => {
      // 对后端已有 link，不直接删整条数据，而是记一条 delete 差异。
      const nextDeletedPermissionIds =
        currentDiff.deletedPermissionIds.includes(permissionId)
          ? currentDiff.deletedPermissionIds
          : [...currentDiff.deletedPermissionIds, permissionId];
      const nextGrantsByPermissionId = { ...currentDiff.grantsByPermissionId };
      const nextRevokesByPermissionId = {
        ...currentDiff.revokesByPermissionId,
      };

      // 一条 link 一旦整体删除，它上面的 grant/revoke 差异就失去意义，需要一起清掉。
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

  const addRecipientToCreatedLink = useCallback(
    (
      createdLinkId: string,
      candidate: IItemLinkPermissionRecipientCandidate,
    ) => {
      // 用统一 recipient key 做去重，避免同一个对象因为展示字段不同被重复加入。
      const candidateKey = getItemLinkPermissionRecipientKey(candidate);

      setDiff((currentDiff) => ({
        ...currentDiff,
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
            return entry;
          }

          return {
            ...entry,
            recipients: [...entry.recipients, candidate],
          };
        }),
      }));
    },
    [],
  );

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

  const addGrantRecipient = useCallback(
    (
      permissionId: string,
      candidate: IItemLinkPermissionRecipientCandidate,
    ) => {
      setDiff((currentDiff) => {
        // 同一个对象如果上一拍被标记为 revoke，现在又重新 add，
        // 应优先抵消 revoke，而不是同时留下 grant + revoke 两条相反差异。
        const nextRevokesByPermissionId = {
          ...currentDiff.revokesByPermissionId,
        };
        const existingRevokes = nextRevokesByPermissionId[permissionId] ?? [];
        const candidateKey = getItemLinkPermissionRecipientKey(candidate);
        const filteredRevokes = existingRevokes.filter(
          (recipient) =>
            getItemLinkPermissionRecipientKey(recipient) !== candidateKey,
        );

        if (filteredRevokes.length !== existingRevokes.length) {
          if (filteredRevokes.length === 0) {
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

  const resetDiff = useCallback(() => {
    // 只重置 links 的本地差异，不触碰后端已加载基线。
    setDiff(createEmptyItemLinkPermissionDiffState());
  }, []);

  return {
    diff,
    hasUnsavedChanges: useMemo(
      () => hasItemLinkPermissionDiffChanges(diff),
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
    return recipientMap;
  }

  return {
    ...recipientMap,
    [permissionId]: [...currentRecipients, candidate],
  };
};

const removeCandidateFromRecipientMap = (
  recipientMap: Record<string, IItemLinkPermissionRecipientCandidate[]>,
  permissionId: string,
  candidate: IItemLinkPermissionRecipientCandidate,
) => {
  // 当用户撤回一条尚未提交的 grant 时，直接把它从 map 里删掉即可。
  const currentRecipients = recipientMap[permissionId];

  if (!currentRecipients) {
    return recipientMap;
  }

  const candidateKey = getItemLinkPermissionRecipientKey(candidate);
  const nextRecipients = currentRecipients.filter(
    (recipient) =>
      getItemLinkPermissionRecipientKey(recipient) !== candidateKey,
  );

  if (nextRecipients.length === currentRecipients.length) {
    return recipientMap;
  }

  if (nextRecipients.length === 0) {
    const nextRecipientMap = { ...recipientMap };
    delete nextRecipientMap[permissionId];
    return nextRecipientMap;
  }

  return {
    ...recipientMap,
    [permissionId]: nextRecipients,
  };
};
