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
import { ItemLinkSpecificPermissionRow } from "./ItemLinkSpecificPermissionRow";
import { ItemLinkPermissionRowShell } from "./itemLinkPermissionRowShared";
import { usePermissionsStyles } from "./permissionsStyles";

/**
 * Item link 权限面板的输入属性。
 */
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

  /**
   * 用 scope + type 生成唯一键，统一复用在重复判断和禁用态计算里。
   */
  const createScopeTypeKey = (
    scope: ItemLinkPermissionScope,
    type: ItemLinkPermissionType,
  ) => `${scope}:${type}`;

  /**
   * 记录刚创建的 specific link，便于列表刷新后自动展开对应的 recipients 区域。
   */
  const [autoExpandedSpecificEntryId, setAutoExpandedSpecificEntryId] =
    useState<string | null>(null);

  // 先把当前已存在的 scope/type 组合收集起来，避免前端继续创建重复 link。
  const occupiedScopeTypeKeys = new Set(
    entries.map((entry) => createScopeTypeKey(entry.scope, entry.type)),
  );

  // 某个 scope 下如果所有 type 都已占用，就禁用该 scope 选项。
  const scopeOptionDisabledState = Object.fromEntries(
    ITEM_LINK_PERMISSION_SCOPES.map((scope) => [
      scope,
      ITEM_LINK_PERMISSION_TYPES.every((type) =>
        occupiedScopeTypeKeys.has(createScopeTypeKey(scope, type)),
      ),
    ]),
  ) as Record<ItemLinkPermissionScope, boolean>;

  // 当前 scope 下如果某个 type 已存在同类 link，就禁用该 type 选项。
  const typeOptionDisabledState = Object.fromEntries(
    ITEM_LINK_PERMISSION_TYPES.map((type) => [
      type,
      occupiedScopeTypeKeys.has(createScopeTypeKey(createScope, type)),
    ]),
  ) as Record<ItemLinkPermissionType, boolean>;

  const canAddLink =
    !interactionDisabled && !typeOptionDisabledState[createType];

  // specific link 需要展示 recipients 维护能力，所以单独走专用行组件。
  const specificEntries = entries.filter((entry) => entry.scope === "specific");

  // 其余 link 不涉及 recipients 编辑，走普通展示行即可。
  const nonSpecificEntries = entries.filter(
    (entry) => entry.scope !== "specific",
  );

  /**
   * 新增 specific link 后，自动展开它的 recipients accordion。
   */
  const handleAddLinkClick = () => {
    const createdEntryId = onAddLink();

    if (createScope === "specific") {
      setAutoExpandedSpecificEntryId(createdEntryId);
    }
  };

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

      {/* 加载态优先展示，避免用户误以为当前没有 link。 */}
      {isLoading ? (
        <Text size={200} className={styles.searchStatusText}>
          Loading links...
        </Text>
      ) : null}

      {/* 只有在加载结束且确实没有任何数据时，才显示空态文案。 */}
      {!isLoading && entries.length === 0 ? (
        <Text size={200} className={styles.searchStatusText}>
          No links yet. Add a link above to start sharing this item.
        </Text>
      ) : null}

      {!isLoading ? (
        <div className={styles.linkList}>
          {/* 先渲染非 specific link，保持普通分享链接的列表更紧凑。 */}
          {nonSpecificEntries.map((entry) => (
            <ItemLinkPermissionRowShell
              key={entry.id}
              entry={entry}
              interactionDisabled={interactionDisabled}
              onCopyLink={onCopyLink}
              onDeleteLink={onDeleteLink}
              subtitle={
                entry.scope === "organization" ? (
                  <Text size={200}>
                    people who have access: {entry.grantedToCount}
                  </Text>
                ) : null
              }
            />
          ))}

          {/* 再渲染 specific link，让带 recipients 的复杂行集中在一起。 */}
          {specificEntries.map((entry) => (
            <ItemLinkSpecificPermissionRow
              key={entry.id}
              autoExpand={autoExpandedSpecificEntryId === entry.id}
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
