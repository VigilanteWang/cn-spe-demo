import type { ReactNode } from "react";
import { mergeClasses, tokens } from "@fluentui/react-components";
import { Button, Text, Tooltip } from "@fluentui/react-components";
import {
  BriefcaseRegular,
  CopyRegular,
  DeleteRegular,
  GlobeRegular,
  PersonRegular,
} from "@fluentui/react-icons";
import { ITEM_LINK_PERMISSION_SCOPES } from "../../../../common/contracts/itemPermissionCommonContracts";
import type {
  IItemLinkPermissionComputedEntry,
  ItemLinkPermissionScope,
} from "../models/itemLinkPermissionModels";
import { getItemLinkPermissionScopeLabel } from "../utils/itemLinkPermissionUiUtils";
import { usePermissionsStyles } from "./permissionsStyles";

const ITEM_LINK_PERMISSION_SCOPE_ICON_COLOR: Record<
  ItemLinkPermissionScope,
  string
> = {
  // 匿名链接使用偏绿的状态色，贴近 Microsoft Share 界面里“Anyone”选项的视觉语义。
  [ITEM_LINK_PERMISSION_SCOPES.anonymous]: tokens.colorPaletteGreenForeground3,
  // 组织内链接使用偏蓝的状态色，保持与“People in organization”一类企业范围选项接近。
  [ITEM_LINK_PERMISSION_SCOPES.organization]:
    tokens.colorPaletteBlueForeground2,
  // 指定对象链接使用中性灰，避免它在视觉层级上抢过更开放的链接范围。
  [ITEM_LINK_PERMISSION_SCOPES.specific]: tokens.colorNeutralForeground3,
};
const ITEM_LINK_PERMISSION_SCOPE_ICON_STYLE = { fontSize: "19px" } as const;

/**
 * 渲染 link scope 对应的图标，确保创建区和列表行保持同一套视觉语义。
 *
 * @param scope 当前 link 的业务 scope。
 * @returns 对应 scope 的 Fluent UI 图标。
 */
export const renderItemLinkPermissionScopeIcon = (
  scope: ItemLinkPermissionScope,
) => {
  const primaryFill = ITEM_LINK_PERMISSION_SCOPE_ICON_COLOR[scope];

  if (scope === ITEM_LINK_PERMISSION_SCOPES.anonymous) {
    return (
      <GlobeRegular
        primaryFill={primaryFill}
        style={ITEM_LINK_PERMISSION_SCOPE_ICON_STYLE}
      />
    );
  }

  if (scope === ITEM_LINK_PERMISSION_SCOPES.organization) {
    return (
      <BriefcaseRegular
        primaryFill={primaryFill}
        style={ITEM_LINK_PERMISSION_SCOPE_ICON_STYLE}
      />
    );
  }

  return (
    <PersonRegular
      primaryFill={primaryFill}
      style={ITEM_LINK_PERMISSION_SCOPE_ICON_STYLE}
    />
  );
};

/**
 * Item link 行共享外壳的输入属性。
 */
export interface IItemLinkPermissionRowShellProps {
  entry: IItemLinkPermissionComputedEntry;
  interactionDisabled: boolean;
  onCopyLink: (webUrl: string) => void;
  onDeleteLink: (entry: IItemLinkPermissionComputedEntry) => void;
  copyAriaLabel?: string;
  deleteAriaLabel?: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  removeChildrenGap?: boolean;
}

/**
 * 渲染 item link 行的通用卡片结构。
 *
 * 这里集中放置两类 row 都一致的头部布局和操作按钮，避免普通 link 与
 * specific link 维护两份几乎相同的 JSX。
 */
export const ItemLinkPermissionRowShell = ({
  entry,
  interactionDisabled,
  onCopyLink,
  onDeleteLink,
  copyAriaLabel,
  deleteAriaLabel,
  subtitle,
  children,
  removeChildrenGap = false,
}: IItemLinkPermissionRowShellProps) => {
  const styles = usePermissionsStyles();
  const scopeLabel = getItemLinkPermissionScopeLabel(entry.scope);
  const copyTooltipText = "Copy Link";

  return (
    <div
      className={mergeClasses(
        styles.linkRowCard,
        removeChildrenGap && styles.linkRowCardWithoutChildrenGap,
      )}
    >
      <div className={styles.linkRowMain}>
        <div className={styles.linkRowLeading}>
          <span className={styles.linkRowIcon}>
            {renderItemLinkPermissionScopeIcon(entry.scope)}
          </span>
          <div className={styles.linkRowText}>
            <Text weight="semibold">{scopeLabel}</Text>
            {subtitle}
          </div>
        </div>

        <div className={styles.linkRowRoleBlock}>
          <Text weight="semibold" className={styles.linkRowRoleText}>
            {entry.roleLabel}
          </Text>
        </div>

        <div className={styles.linkRowActions}>
          <Tooltip
            relationship="label"
            positioning="above"
            content={copyTooltipText}
          >
            {/* 复制按钮存在 disabled 场景，包一层 span 能保证 Tooltip 仍然可触发。 */}
            <span>
              <Button
                appearance="subtle"
                aria-label={copyAriaLabel ?? `Copy ${scopeLabel} link`}
                disabled={interactionDisabled || !entry.webUrl}
                icon={<CopyRegular />}
                onClick={() => {
                  if (entry.webUrl) {
                    onCopyLink(entry.webUrl);
                  }
                }}
              />
            </span>
          </Tooltip>
          <Button
            appearance="subtle"
            aria-label={deleteAriaLabel ?? `Delete ${scopeLabel} link`}
            disabled={interactionDisabled}
            icon={<DeleteRegular />}
            onClick={() => onDeleteLink(entry)}
          />
        </div>
      </div>

      {children}
    </div>
  );
};
