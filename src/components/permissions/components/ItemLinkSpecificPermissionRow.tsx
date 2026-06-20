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
import { CopyRegular, DeleteRegular } from "@fluentui/react-icons";
import { formatAppErrorMessageForUI } from "../../../../common/appError";
import type { PermissionTabValue } from "../../../../common/contracts/permissionCommonContracts";
import { useItemLinkPermissionRecipientSearch } from "../hooks/useItemLinkPermissionRecipientSearch";
import type {
  IItemLinkPermissionDerivedEntry,
  IItemLinkPermissionRecipientCandidate,
} from "../models/itemLinkPermissionModels";
import {
  getItemLinkPermissionRecipientKey,
  getItemLinkPermissionScopeLabel,
} from "../services/itemLinkPermissionUiUtils";
import { PrincipalSearchComboBox } from "./PrincipalSearchComboBox";
import { usePermissionsStyles } from "./permissionsStyles";
import { renderItemLinkPermissionScopeIcon } from "./itemLinkPermissionRowShared";

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
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);

  useEffect(() => {
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
    <div className={styles.linkRowCard}>
      <div className={styles.linkRowMain}>
        <div className={styles.linkRowLeading}>
          <span className={styles.linkRowIcon}>
            {renderItemLinkPermissionScopeIcon(entry.scope)}
          </span>
          <div className={styles.linkRowText}>
            <Text weight="semibold">
              {getItemLinkPermissionScopeLabel(entry.scope)}
            </Text>
          </div>
        </div>

        <div className={styles.linkRowRoleBlock}>
          <Text weight="semibold" className={styles.linkRowRoleText}>
            {entry.roleLabel}
          </Text>
        </div>

        <div className={styles.linkRowActions}>
          <Button
            appearance="subtle"
            aria-label="Copy specific link"
            disabled={interactionDisabled || !entry.webUrl}
            icon={<CopyRegular />}
            onClick={() => {
              if (entry.webUrl) {
                onCopyLink(entry.webUrl);
              }
            }}
          />
          <Button
            appearance="subtle"
            aria-label="Delete specific link"
            disabled={interactionDisabled}
            icon={<DeleteRegular />}
            onClick={() => onDeleteLink(entry)}
          />
        </div>
      </div>

      <Accordion
        collapsible
        openItems={isAccordionOpen ? ["specific-recipients"] : []}
        onToggle={(_event, data) => {
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
                  Specific links must include at least one person or group
                  before Apply.
                </Text>
              ) : null}
            </div>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  );
};
