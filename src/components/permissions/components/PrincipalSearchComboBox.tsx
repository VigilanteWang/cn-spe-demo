import { type ChangeEvent } from "react";
import {
  Avatar,
  Combobox,
  Option,
  Spinner,
  Text,
} from "@fluentui/react-components";
import type { ComboboxProps } from "@fluentui/react-components";
import type { PermissionPrincipalSearchStatus } from "../hooks/usePermissionPrincipalSearch";
import type {
  IPermissionPrincipalCandidate,
  PermissionTabValue,
} from "../models/permissionSharedModels";
import { usePermissionsStyles } from "./permissionsStyles";

interface IPrincipalSearchComboBoxProps {
  selectedTab: PermissionTabValue;
  interactionDisabled: boolean;
  searchInputId: string;
  query: string;
  searchResults: IPermissionPrincipalCandidate[];
  searchStatus: PermissionPrincipalSearchStatus;
  isDropdownOpen: boolean;
  onSearchQueryChange: (value: string) => void;
  onSearchCandidateSelect: (candidateId: string | undefined) => void;
  isCandidateAdded: (
    tab: PermissionTabValue,
    candidate: IPermissionPrincipalCandidate,
  ) => boolean;
}

/**
 * 根据页签值返回当前界面要显示的标题文案。
 */
const getTabTitle = (tab: PermissionTabValue) =>
  tab === "people" ? "People" : "Groups";

/**
 * 权限对话框里的 principal 搜索输入区。
 *
 * 它负责承载：
 * - Combobox 搜索框
 * - 搜索状态提示
 * - 搜索结果选项与重复提示
 */
export const PrincipalSearchComboBox = ({
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
}: IPrincipalSearchComboBoxProps) => {
  const styles = usePermissionsStyles();

  /**
   * 处理 Combobox 输入变化。
   */
  const handleComboboxChange: NonNullable<ComboboxProps["onChange"]> = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    onSearchQueryChange(event.target.value);
  };

  /**
   * 处理用户从下拉结果中选择候选对象。
   */
  const handleOptionSelect: NonNullable<ComboboxProps["onOptionSelect"]> = (
    _event,
    data,
  ) => {
    onSearchCandidateSelect(data.optionValue);
  };

  return (
    <div className={styles.section}>
      <div className={styles.principalInputWrapper}>
        <Combobox
          id={searchInputId}
          aria-label={`Add ${getTabTitle(selectedTab)}`}
          className={styles.principalCombobox}
          expandIcon={null}
          placeholder={`Search for ${getTabTitle(selectedTab)} (type at least 3 characters)`}
          freeform
          disabled={interactionDisabled}
          selectedOptions={[]}
          value={query}
          open={isDropdownOpen && !interactionDisabled}
          onChange={handleComboboxChange}
          onOptionSelect={handleOptionSelect}
        >
          {searchStatus === "waitingForMoreInput" ? (
            <Option disabled text="Need more input">
              <Text size={200}>
                Keep typing at least 3 characters to search.
              </Text>
            </Option>
          ) : null}

          {searchStatus === "debouncing" ? (
            <Option disabled text="Debouncing">
              <Text size={200}>Getting ready to search...</Text>
            </Option>
          ) : null}

          {searchStatus === "loading" ? (
            <Option disabled text="Searching">
              <div
                className={styles.loadingOption}
                data-testid="directory-search-loading"
              >
                <Spinner size="tiny" />
                <Text>Searching...</Text>
              </div>
            </Option>
          ) : null}

          {searchStatus === "success"
            ? searchResults.map((candidate) => {
                const alreadyAdded = isCandidateAdded(selectedTab, candidate);

                return (
                  <Option
                    key={candidate.id}
                    value={candidate.id}
                    text={candidate.name}
                  >
                    <div
                      className={styles.dropdownOption}
                      data-testid={`candidate-option-${candidate.id}`}
                    >
                      <Avatar
                        name={candidate.name}
                        initials={candidate.initials}
                        size={32}
                      />
                      <div className={styles.dropdownOptionText}>
                        <Text weight="semibold">{candidate.name}</Text>
                        <Text
                          size={200}
                          className={styles.dropdownOptionSecondary}
                        >
                          {candidate.secondaryText}
                        </Text>
                      </div>
                      {alreadyAdded ? (
                        <Text size={200} className={styles.dropdownOptionMeta}>
                          Already added
                        </Text>
                      ) : null}
                    </div>
                  </Option>
                );
              })
            : null}

          {searchStatus === "empty" ? (
            <Option disabled text="No results">
              <Text size={200} data-testid="directory-search-empty-state">
                No results found. Try a more complete name, email, or group
                name.
              </Text>
            </Option>
          ) : null}

          {searchStatus === "error" ? (
            <Option disabled text="Search failed">
              <Text size={200}>Please check the error message above.</Text>
            </Option>
          ) : null}
        </Combobox>
      </div>

      <Text size={200} className={styles.searchStatusText}>
        Select someone from the results to add them. Duplicates won&apos;t be
        added twice.
      </Text>
    </div>
  );
};
