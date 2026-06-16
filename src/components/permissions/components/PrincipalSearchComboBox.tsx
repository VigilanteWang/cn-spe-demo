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
import { getPermissionTabTitle } from "../utils/permissionDialogSharedUtils";
import { usePermissionsStyles } from "./permissionsStyles";

/**
 * 主体搜索输入区的输入属性。
 */
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
 * 权限弹窗里的主体搜索输入区。
 *
 * 它负责承载：
 * 1. Combobox 输入行为
 * 2. 搜索状态提示
 * 3. 搜索结果项与重复提示
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
   * 把 Combobox 输入变化同步回外层搜索 Hook。
   */
  const handleComboboxChange: NonNullable<ComboboxProps["onChange"]> = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    onSearchQueryChange(event.target.value);
  };

  /**
   * 把用户选中的结果项 ID 回传给外层搜索 Hook。
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
        {/* 搜索输入框：用户在这里输入 People / Groups 的名称，输入内容会驱动下拉结果刷新。 */}
        <Combobox
          id={searchInputId}
          aria-label={`Add ${getPermissionTabTitle(selectedTab)}`}
          className={styles.principalCombobox}
          expandIcon={null}
          placeholder={`Search for ${getPermissionTabTitle(
            selectedTab,
          )} (type at least 3 characters)`}
          freeform
          disabled={interactionDisabled}
          selectedOptions={[]}
          value={query}
          open={isDropdownOpen && !interactionDisabled}
          onChange={handleComboboxChange}
          onOptionSelect={handleOptionSelect}
        >
          {/* 输入不足时的提示项：告诉用户至少输入 3 个字符后才会开始搜索。 */}
          {searchStatus === "waitingForMoreInput" ? (
            <Option disabled text="Need more input">
              <Text size={200}>
                Keep typing at least 3 characters to search.
              </Text>
            </Option>
          ) : null}

          {/* 防抖中的提示项：表示正在等待输入稳定后再发起搜索。 */}
          {searchStatus === "debouncing" ? (
            <Option disabled text="Debouncing">
              <Text size={200}>Getting ready to search...</Text>
            </Option>
          ) : null}

          {/* 搜索中的提示项：显示加载中的转圈和 Searching 文案。 */}
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

          {/* 搜索成功时的结果列表：每一项都展示头像、名称、次要信息和是否已添加标记。 */}
          {searchStatus === "success"
            ? searchResults.map((candidate) => {
                // 即使已存在于列表里，也保留结果项，方便用户确认命中对象。
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

          {/* 没有结果时的提示项：告诉用户当前搜索不到匹配对象。 */}
          {searchStatus === "empty" ? (
            <Option disabled text="No results">
              <Text size={200} data-testid="directory-search-empty-state">
                No results found. Try a more complete name, email, or group
                name.
              </Text>
            </Option>
          ) : null}

          {/* 搜索失败时的提示项：引导用户查看上方的错误消息。 */}
          {searchStatus === "error" ? (
            <Option disabled text="Search failed">
              <Text size={200}>Please check the error message above.</Text>
            </Option>
          ) : null}
        </Combobox>
      </div>

      {/* 底部说明文案：提示用户从结果里选择一个对象加入，并说明重复项不会被重复添加。 */}
      <Text size={200} className={styles.searchStatusText}>
        Select someone from the results to add them. Duplicates won&apos;t be
        added twice.
      </Text>
    </div>
  );
};
