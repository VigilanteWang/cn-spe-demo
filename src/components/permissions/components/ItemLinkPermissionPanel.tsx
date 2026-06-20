import { useState } from "react";
import { Text } from "@fluentui/react-components";
import {
  ITEM_LINK_PERMISSION_SCOPES,
  ITEM_LINK_PERMISSION_TYPES,
  type IItemLinkPermissionDerivedEntry,
  type IItemLinkPermissionRecipientCandidate,
  type ItemLinkPermissionScope,
  type ItemLinkPermissionType,
} from "../models/itemLinkPermissionModels";
import { ItemLinkCreateControls } from "./ItemLinkCreateControls";
import { LinkPermissionRow } from "./LinkPermissionRow";
import { UserLinkPermissionRow } from "./UserLinkPermissionRow";
import { usePermissionsStyles } from "./permissionsStyles";

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
   * 新增 users link 后，自动展开它的 recipients accordion。
   */
  const handleAddLinkClick = () => {
    const createdEntryId = onAddLink();

    if (createScope === "users") {
      setAutoExpandedUsersEntryId(createdEntryId);
    }
  };

  const createScopeTypeKey = (
    scope: ItemLinkPermissionScope,
    type: ItemLinkPermissionType,
  ) => `${scope}:${type}`;

  return (
    <div className={styles.linkPanelSection}>
      <ItemLinkCreateControls
        createScope={createScope}
        createType={createType}
        interactionDisabled={interactionDisabled}
        scopeOptionDisabledState={scopeOptionDisabledState}
        typeOptionDisabledState={typeOptionDisabledState}
        canAddLink={canAddLink}
        onCreateScopeChange={onCreateScopeChange}
        onCreateTypeChange={onCreateTypeChange}
        onAddLink={handleAddLinkClick}
      />

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
