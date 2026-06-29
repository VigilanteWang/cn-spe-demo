import { type ReactNode } from "react";
import { PrincipalSearchComboBox } from "./PrincipalSearchComboBox";
import {
  UserPermissionAccessListTable,
  type IUserPermissionAccessListTableProps,
  type UserPermissionAccessListEntryWithRole,
} from "./UserPermissionAccessListTable";
import type { PermissionPrincipalSearchStatus } from "../hooks/usePermissionPrincipalSearch";
import type {
  IPermissionPrincipalSearchCandidate,
  PermissionTabValue,
} from "../models/permissionSharedModels";

export interface IUserPermissionPanelProps<
  TEntry extends UserPermissionAccessListEntryWithRole,
> {
  selectedTab: PermissionTabValue;
  interactionDisabled: boolean;
  searchInputId: string;
  query: string;
  searchResults: IPermissionPrincipalSearchCandidate[];
  searchStatus: PermissionPrincipalSearchStatus;
  isDropdownOpen: boolean;
  onSearchQueryChange: (value: string) => void;
  onSearchCandidateSelect: (candidateId: string | undefined) => void;
  isCandidateAdded: (
    tab: PermissionTabValue,
    candidate: IPermissionPrincipalSearchCandidate,
  ) => boolean;
  beforeAccessListContent?: ReactNode;
  accessListProps: Omit<
    IUserPermissionAccessListTableProps<TEntry>,
    "selectedTab"
  >;
}

/**
 * people/groups 显式权限面板。
 *
 * 它统一承载搜索入口、可选的前置说明和 access list 表格，
 * 让 container 与 item 的显式权限页都复用同一套主体结构。
 */
export const UserPermissionPanel = <
  TEntry extends UserPermissionAccessListEntryWithRole,
>({
  selectedTab,
  interactionDisabled,
  searchInputId,
  query,
  searchResults,
  searchStatus,
  isDropdownOpen,
  onSearchQueryChange,
  onSearchCandidateSelect,
  isCandidateAdded,
  beforeAccessListContent,
  accessListProps,
}: IUserPermissionPanelProps<TEntry>) => {
  return (
    <>
      <PrincipalSearchComboBox
        selectedTab={selectedTab}
        interactionDisabled={interactionDisabled}
        searchInputId={searchInputId}
        query={query}
        searchResults={searchResults}
        searchStatus={searchStatus}
        isDropdownOpen={isDropdownOpen}
        onSearchQueryChange={onSearchQueryChange}
        onSearchCandidateSelect={onSearchCandidateSelect}
        isCandidateAdded={isCandidateAdded}
      />

      {beforeAccessListContent}

      <UserPermissionAccessListTable
        selectedTab={selectedTab}
        {...accessListProps}
      />
    </>
  );
};
