import { useEffect, useState, type ChangeEvent } from "react";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Button,
  Combobox,
  Option,
  Select,
  Tab,
  TabList,
  Text,
} from "@fluentui/react-components";
import type { ComboboxProps } from "@fluentui/react-components";
import {
  AddRegular,
  CopyRegular,
  DeleteRegular,
  GlobeRegular,
  PeopleRegular,
  PersonRegular,
} from "@fluentui/react-icons";
import { formatAppErrorMessageForUI } from "../../../../common/appError";
import type { PermissionTabValue } from "../../../../common/contracts/permissionCommonContracts";
import { useItemLinkPermissionRecipientSearch } from "../hooks/useItemLinkPermissionRecipientSearch";
import {
  ITEM_LINK_PERMISSION_SCOPES,
  ITEM_LINK_PERMISSION_TYPES,
  type IItemLinkPermissionDerivedEntry,
  type IItemLinkPermissionRecipientCandidate,
  type ItemLinkPermissionScope,
  type ItemLinkPermissionType,
} from "../models/itemLinkPermissionModels";
import { PrincipalSearchComboBox } from "./PrincipalSearchComboBox";
import { usePermissionsStyles } from "./permissionsStyles";
import {
  getItemLinkPermissionRecipientKey,
  getItemLinkPermissionRoleLabel,
  getItemLinkPermissionScopeLabel,
} from "../services/itemLinkPermissionUiUtils";

interface IItemLinkPermissionPanelProps {
  entries: IItemLinkPermissionDerivedEntry[];
  isLoading: boolean;
  interactionDisabled: boolean;
  createScope: ItemLinkPermissionScope;
  createType: ItemLinkPermissionType;
  onCreateScopeChange: (scope: ItemLinkPermissionScope) => void;
  onCreateTypeChange: (type: ItemLinkPermissionType) => void;
  onAddLink: () => string;
  onDeleteLink: (entry: IItemLinkPermissionDerivedEntry) => void;
  onCopyLink: (webUrl: string) => void;
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
 * Links 列表里的卡片图标需要和创建下拉框保持一致，避免同一类 scope 在两个位置出现不同视觉语义。
 */
const renderLinkScopeIcon = (scope: ItemLinkPermissionScope) => {
  if (scope === "anonymous") {
    return <GlobeRegular />;
  }

  if (scope === "organization") {
    return <PeopleRegular />;
  }

  return <PersonRegular />;
};

/**
 * Item 权限弹窗里的 Links 面板。
 *
 * 它只负责 links 自己的 UI 和本地交互，不混入 people/groups 的 access list 结构。
 */
export const ItemLinkPermissionPanel = ({
  entries,
  isLoading,
  interactionDisabled,
  createScope,
  createType,
  onCreateScopeChange,
  onCreateTypeChange,
  onAddLink,
  onDeleteLink,
  onCopyLink,
  onAddRecipient,
  onRemoveRecipient,
}: IItemLinkPermissionPanelProps) => {
  const styles = usePermissionsStyles();
  const [autoExpandedUsersEntryId, setAutoExpandedUsersEntryId] = useState<
    string | null
  >(null);
  const occupiedScopeTypeKeys = new Set(
    entries.map((entry) => createScopeTypeKey(entry.scope, entry.type)),
  );
  const scopeOptionDisabledState = Object.fromEntries(
    ITEM_LINK_PERMISSION_SCOPES.map((scope) => [
      scope,
      ITEM_LINK_PERMISSION_TYPES.every((type) =>
        occupiedScopeTypeKeys.has(createScopeTypeKey(scope, type)),
      ),
    ]),
  ) as Record<ItemLinkPermissionScope, boolean>;
  const typeOptionDisabledState = Object.fromEntries(
    ITEM_LINK_PERMISSION_TYPES.map((type) => [
      type,
      occupiedScopeTypeKeys.has(createScopeTypeKey(createScope, type)),
    ]),
  ) as Record<ItemLinkPermissionType, boolean>;
  const canAddLink =
    !interactionDisabled && !typeOptionDisabledState[createType];
  const userEntries = entries.filter((entry) => entry.scope === "users");
  const plainEntries = entries.filter((entry) => entry.scope !== "users");

  /**
   * 第一个下拉框使用固定选项，因此只在选择 Option 时回写业务 scope。
   */
  const handleScopeSelect: NonNullable<ComboboxProps["onOptionSelect"]> = (
    _event,
    data,
  ) => {
    const nextScope = data.optionValue;

    if (isItemLinkPermissionScope(nextScope)) {
      onCreateScopeChange(nextScope);
    }
  };

  /**
   * 第二个下拉框收集 link type。
   */
  const handleTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextType = event.currentTarget.value;

    if (isItemLinkPermissionType(nextType)) {
      onCreateTypeChange(nextType);
    }
  };

  /**
   * 新增 users link 后，自动展开它的 recipients accordion。
   */
  const handleAddLinkClick = () => {
    const createdEntryId = onAddLink();

    if (createScope === "users") {
      setAutoExpandedUsersEntryId(createdEntryId);
    }
  };

  return (
    <div className={styles.linkPanelSection}>
      <div className={styles.linkCreateRow}>
        <Combobox
          aria-label="Link scope"
          className={styles.linkCreateCombobox}
          selectedOptions={[createScope]}
          value={getItemLinkPermissionScopeLabel(createScope)}
          disabled={interactionDisabled}
          onOptionSelect={handleScopeSelect}
        >
          {ITEM_LINK_PERMISSION_SCOPES.map((scope) => (
            <Option
              key={scope}
              disabled={scopeOptionDisabledState[scope]}
              text={getItemLinkPermissionScopeLabel(scope)}
              value={scope}
            >
              <div className={styles.linkScopeOption}>
                {renderLinkScopeIcon(scope)}
                <span>{getItemLinkPermissionScopeLabel(scope)}</span>
              </div>
            </Option>
          ))}
        </Combobox>

        <Select
          aria-label="Link permission type"
          className={styles.linkCreateSelect}
          disabled={interactionDisabled}
          value={createType}
          onChange={handleTypeChange}
        >
          {ITEM_LINK_PERMISSION_TYPES.map((type) => (
            <option
              key={type}
              disabled={typeOptionDisabledState[type]}
              value={type}
            >
              {getItemLinkPermissionRoleLabel(type)}
            </option>
          ))}
        </Select>

        <Button
          appearance="primary"
          aria-label="Add link"
          disabled={!canAddLink}
          icon={<AddRegular />}
          onClick={handleAddLinkClick}
        />
      </div>

      {isLoading ? (
        <Text size={200} className={styles.searchStatusText}>
          Loading links...
        </Text>
      ) : null}

      {!isLoading && entries.length === 0 ? (
        <Text size={200} className={styles.searchStatusText}>
          No links yet. Add a link above to start sharing this item.
        </Text>
      ) : null}

      {!isLoading ? (
        <div className={styles.linkList}>
          {plainEntries.map((entry) => (
            <LinkPermissionRow
              key={entry.id}
              entry={entry}
              interactionDisabled={interactionDisabled}
              onCopyLink={onCopyLink}
              onDeleteLink={onDeleteLink}
            />
          ))}

          {userEntries.map((entry) => (
            <UserLinkPermissionRow
              key={entry.id}
              autoExpand={autoExpandedUsersEntryId === entry.id}
              entry={entry}
              interactionDisabled={interactionDisabled}
              onAddRecipient={onAddRecipient}
              onCopyLink={onCopyLink}
              onDeleteLink={onDeleteLink}
              onRemoveRecipient={onRemoveRecipient}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

const createScopeTypeKey = (
  scope: ItemLinkPermissionScope,
  type: ItemLinkPermissionType,
) => `${scope}:${type}`;

const isItemLinkPermissionScope = (
  value: string | undefined,
): value is ItemLinkPermissionScope =>
  typeof value === "string" &&
  (ITEM_LINK_PERMISSION_SCOPES as readonly string[]).includes(value);

const isItemLinkPermissionType = (
  value: string,
): value is ItemLinkPermissionType =>
  (ITEM_LINK_PERMISSION_TYPES as readonly string[]).includes(value);

interface ILinkPermissionRowProps {
  entry: IItemLinkPermissionDerivedEntry;
  interactionDisabled: boolean;
  onCopyLink: (webUrl: string) => void;
  onDeleteLink: (entry: IItemLinkPermissionDerivedEntry) => void;
}

const LinkPermissionRow = ({
  entry,
  interactionDisabled,
  onCopyLink,
  onDeleteLink,
}: ILinkPermissionRowProps) => {
  const styles = usePermissionsStyles();

  return (
    <div className={styles.linkRowCard}>
      <div className={styles.linkRowMain}>
        <div className={styles.linkRowLeading}>
          <span className={styles.linkRowIcon}>
            {renderLinkScopeIcon(entry.scope)}
          </span>
          <div className={styles.linkRowText}>
            <Text weight="semibold">
              {getItemLinkPermissionScopeLabel(entry.scope)}
            </Text>
            {entry.scope === "organization" ? (
              <Text size={200} className={styles.searchStatusText}>
                people who have access: {entry.grantedToCount}
              </Text>
            ) : null}
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
            aria-label={`Copy ${getItemLinkPermissionScopeLabel(entry.scope)} link`}
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
            aria-label={`Delete ${getItemLinkPermissionScopeLabel(entry.scope)} link`}
            disabled={interactionDisabled}
            icon={<DeleteRegular />}
            onClick={() => onDeleteLink(entry)}
          />
        </div>
      </div>
    </div>
  );
};

interface IUserLinkPermissionRowProps extends ILinkPermissionRowProps {
  autoExpand: boolean;
  onAddRecipient: (
    entry: IItemLinkPermissionDerivedEntry,
    candidate: IItemLinkPermissionRecipientCandidate,
  ) => void;
  onRemoveRecipient: (
    entry: IItemLinkPermissionDerivedEntry,
    recipientKey: string,
  ) => void;
}

const UserLinkPermissionRow = ({
  autoExpand,
  entry,
  interactionDisabled,
  onAddRecipient,
  onCopyLink,
  onDeleteLink,
  onRemoveRecipient,
}: IUserLinkPermissionRowProps) => {
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
            {renderLinkScopeIcon(entry.scope)}
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
            aria-label="Copy specific users/groups link"
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
            aria-label="Delete specific users/groups link"
            disabled={interactionDisabled}
            icon={<DeleteRegular />}
            onClick={() => onDeleteLink(entry)}
          />
        </div>
      </div>

      <Accordion
        collapsible
        openItems={isAccordionOpen ? ["specified-users"] : []}
        onToggle={(_event, data) => {
          setIsAccordionOpen(data.openItems.includes("specified-users"));
        }}
      >
        <AccordionItem value="specified-users">
          <AccordionHeader>Specified users and groups</AccordionHeader>
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
                      aria-label={`Remove ${recipient.candidate.name} from specific users/groups link`}
                      disabled={interactionDisabled}
                      icon={<DeleteRegular />}
                      onClick={() => onRemoveRecipient(entry, recipient.key)}
                    />
                  </div>
                ))}
              </div>

              {entry.hasValidationError ? (
                <Text size={200} className={styles.errorStatusText}>
                  Specific Users/Groups links must include at least one person
                  or group before Apply.
                </Text>
              ) : null}
            </div>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  );
};
