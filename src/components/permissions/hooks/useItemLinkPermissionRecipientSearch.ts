import { useState } from "react";
import type { PermissionTabValue } from "../models/permissionSharedModels";
import type {
  IItemLinkPermissionComputedEntry,
  IItemLinkPermissionRecipientCandidate,
} from "../models/itemLinkPermissionModels";
import { usePermissionPrincipalSearch } from "./usePermissionPrincipalSearch";
import {
  getItemLinkPermissionRecipientKey,
  mapPermissionCandidateToItemLinkRecipientCandidate,
} from "../utils/itemLinkPermissionUiUtils";

interface IUseItemLinkPermissionRecipientSearchOptions {
  entry: IItemLinkPermissionComputedEntry;
  onAddRecipient: (
    entry: IItemLinkPermissionComputedEntry,
    candidate: IItemLinkPermissionRecipientCandidate,
  ) => void;
}

/**
 * 管理 specific link 行内 recipient 搜索状态。
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
      onAddRecipient(
        entry,
        mapPermissionCandidateToItemLinkRecipientCandidate(candidate),
      );
    },
    isCandidateAdded: (_tab, candidate) =>
      entry.recipients.some(
        (recipient) =>
          recipient.key === getItemLinkPermissionRecipientKey(candidate),
      ),
  });

  return {
    searchTab,
    setSearchTab,
    ...searchState,
  };
};
