import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Button,
  Tab,
  TabList,
  Text,
} from "@fluentui/react-components";
import { DeleteRegular } from "@fluentui/react-icons";
import { formatAppErrorMessageForUI } from "../../../../common/appError";
import type { PermissionTabValue } from "../../../../common/contracts/permissionCommonContracts";
import { useItemLinkPermissionRecipientSearch } from "../hooks/useItemLinkPermissionRecipientSearch";
import type {
  IItemLinkPermissionDerivedEntry,
  IItemLinkPermissionRecipientCandidate,
} from "../models/itemLinkPermissionModels";
import { getItemLinkPermissionRecipientKey } from "../services/itemLinkPermissionUiUtils";
import { PrincipalSearchComboBox } from "./PrincipalSearchComboBox";
import { ItemLinkPermissionRowShell } from "./itemLinkPermissionRowShared";
import { usePermissionsStyles } from "./permissionsStyles";

/**
 * specific item link 行组件的输入属性。
 */
export interface IItemLinkSpecificPermissionRowProps {
  entry: IItemLinkPermissionDerivedEntry;
  interactionDisabled: boolean;
  autoExpand: boolean;
  onCopyLink: (webUrl: string) => void;
  onDeleteLink: (entry: IItemLinkPermissionDerivedEntry) => void;
  onAddRecipient: (
    entry: IItemLinkPermissionDerivedEntry,
    candidate: IItemLinkPermissionRecipientCandidate,
  ) => void;
  onRemoveRecipient: (
    entry: IItemLinkPermissionDerivedEntry,
    recipientKey: string,
  ) => void;
}

/**
 * 渲染带 recipient 搜索与列表管理的 specific item link 行。
 */
export const ItemLinkSpecificPermissionRow = ({
  entry,
  interactionDisabled,
  autoExpand,
  onCopyLink,
  onDeleteLink,
  onAddRecipient,
  onRemoveRecipient,
}: IItemLinkSpecificPermissionRowProps) => {
  const styles = usePermissionsStyles();
  // 这里用受控展开状态承接两类来源：外部 autoExpand，以及用户手动点开/收起。
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);

  useEffect(() => {
    // 新建 specific link 或外层判定当前行需要高亮处理时，自动展开 recipients 区，
    // 让用户可以直接继续补充“谁可以使用这个链接”。
    if (autoExpand) {
      setIsAccordionOpen(true);
    }
  }, [autoExpand]);

  const {
    searchTab,
    setSearchTab,
    query,
    results,
    status,
    searchError,
    isDropdownOpen,
    handleQueryChange,
    handleCandidateSelect,
  } = useItemLinkPermissionRecipientSearch({
    entry,
    onAddRecipient,
  });

  return (
    <ItemLinkPermissionRowShell
      entry={entry}
      interactionDisabled={interactionDisabled}
      onCopyLink={onCopyLink}
      onDeleteLink={onDeleteLink}
      copyAriaLabel="Copy specific link"
      deleteAriaLabel="Delete specific link"
      removeChildrenGap
    >
      <Accordion
        collapsible
        // Fluent UI Accordion 这里走受控模式：空数组表示当前没有展开项，
        // 包含 specific-recipients 表示展开当前这一块 recipients 面板。
        openItems={isAccordionOpen ? ["specific-recipients"] : []}
        onToggle={(_event, data) => {
          // data.openItems 是组件根据本次点击推导出的“下一状态”，
          // 这里再把它同步回本地 state，保持手动交互和 autoExpand 共用一套状态来源。
          setIsAccordionOpen(data.openItems.includes("specific-recipients"));
        }}
      >
        <AccordionItem value="specific-recipients">
          <AccordionHeader>Specific people and groups</AccordionHeader>
          <AccordionPanel>
            <div className={styles.userLinkPanelContent}>
              <TabList
                selectedValue={searchTab}
                onTabSelect={(_event, data) => {
                  setSearchTab(data.value as PermissionTabValue);
                }}
              >
                <Tab disabled={interactionDisabled} value="people">
                  People
                </Tab>
                <Tab disabled={interactionDisabled} value="groups">
                  Groups
                </Tab>
              </TabList>

              <PrincipalSearchComboBox
                selectedTab={searchTab}
                interactionDisabled={interactionDisabled}
                searchInputId={`item-link-${entry.id}-principal-input`}
                query={query}
                searchResults={results}
                searchStatus={status}
                isDropdownOpen={isDropdownOpen}
                onSearchQueryChange={handleQueryChange}
                onSearchCandidateSelect={handleCandidateSelect}
                // 用与后端/共享模型一致的 recipient key 判断“是否已添加”，
                // 避免同一个人或组因展示字段差异被重复加入。
                isCandidateAdded={(_tab, candidate) =>
                  entry.recipients.some(
                    (recipient) =>
                      recipient.key ===
                      getItemLinkPermissionRecipientKey({
                        objectId: candidate.objectId,
                        userPrincipalName: candidate.userPrincipalName,
                        mail: candidate.mail,
                        name: candidate.name,
                      }),
                  )
                }
              />

              {searchError ? (
                <Text size={200} className={styles.errorStatusText}>
                  Search Error:{" "}
                  {formatAppErrorMessageForUI(
                    searchError,
                    "Directory search failed. Please try again later.",
                  )}
                </Text>
              ) : null}

              <div className={styles.linkRecipientList}>
                {/* 当前 specific link 已经绑定的对象列表，支持逐个移除。 */}
                {entry.recipients.map((recipient) => (
                  <div
                    key={recipient.key}
                    className={styles.linkRecipientListRow}
                  >
                    <div className={styles.linkRecipientText}>
                      <Text weight="semibold">{recipient.candidate.name}</Text>
                      <Text size={200} className={styles.searchStatusText}>
                        {recipient.candidate.secondaryText}
                      </Text>
                    </div>
                    <Button
                      appearance="subtle"
                      aria-label={`Remove ${recipient.candidate.name} from specific link`}
                      disabled={interactionDisabled}
                      icon={<DeleteRegular />}
                      onClick={() => onRemoveRecipient(entry, recipient.key)}
                    />
                  </div>
                ))}
              </div>

              {entry.hasValidationError ? (
                <Text size={200} className={styles.errorStatusText}>
                  {/* specific link 至少要有一个 recipient，避免创建出无法授予任何人的空链接。 */}
                  Specific links must include at least one person or group
                  before Apply.
                </Text>
              ) : null}
            </div>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </ItemLinkPermissionRowShell>
  );
};
