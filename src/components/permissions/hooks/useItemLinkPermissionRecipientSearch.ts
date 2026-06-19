import { useState } from "react";
import type { PermissionTabValue } from "../models/permissionSharedModels";
import type {
  IItemLinkPermissionDerivedEntry,
  IItemLinkPermissionRecipientCandidate,
} from "../models/itemLinkPermissionModels";
import { usePermissionPrincipalSearch } from "./usePermissionPrincipalSearch";
import {
  getItemLinkPermissionRecipientKey,
  mapPermissionCandidateToItemLinkRecipientCandidate,
} from "../services/itemLinkPermissionUiUtils";

interface IUseItemLinkPermissionRecipientSearchOptions {
  entry: IItemLinkPermissionDerivedEntry;
  onAddRecipient: (
    entry: IItemLinkPermissionDerivedEntry,
    candidate: IItemLinkPermissionRecipientCandidate,
  ) => void;
}

/**
 * 管理 specific users/groups link 行内 recipient 搜索状态。
 *
 * 这层 Hook 让行组件只负责展示，把搜索 tab、query 和记候选项桥接留在这里。
 */
export const useItemLinkPermissionRecipientSearch = ({
  entry,
  onAddRecipient,
}: IUseItemLinkPermissionRecipientSearchOptions) => {
  const [searchTab, setSearchTab] = useState<PermissionTabValue>("people");
  const [queryByTab, setQueryByTab] = useState<
    Record<PermissionTabValue, string>
  >({
    people: "",
    groups: "",
  });

  const searchState = usePermissionPrincipalSearch({
    selectedTab: searchTab,
    queryByTab,
    setQuery: (tab, value) => {
      setQueryByTab((currentQueryByTab) => ({
        ...currentQueryByTab,
        [tab]: value,
      }));
    },
    addCandidate: (_tab, candidate) => {
      onAddRecipient(entry, mapPermissionCandidateToItemLinkRecipientCandidate(candidate));
    },
    isCandidateAdded: (_tab, candidate) =>
      entry.recipients.some(
        (recipient) =>
          recipient.key ===
          getItemLinkPermissionRecipientKey({
            objectId: candidate.objectId,
            userPrincipalName: candidate.userPrincipalName,
            mail: candidate.mail,
            name: candidate.name,
          }),
      ),
  });

  return {
    searchTab,
    setSearchTab,
    ...searchState,
  };
};
