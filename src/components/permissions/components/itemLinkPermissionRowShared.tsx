import type { ReactNode } from "react";
import { mergeClasses, tokens } from "@fluentui/react-components";
import { Button, Text } from "@fluentui/react-components";
import {
  BriefcaseRegular,
  CopyRegular,
  DeleteRegular,
  GlobeRegular,
  PersonRegular,
} from "@fluentui/react-icons";
import type {
  IItemLinkPermissionDerivedEntry,
  ItemLinkPermissionScope,
} from "../models/itemLinkPermissionModels";
import { getItemLinkPermissionScopeLabel } from "../services/itemLinkPermissionUiUtils";
import { usePermissionsStyles } from "./permissionsStyles";

const ITEM_LINK_PERMISSION_SCOPE_ICON_COLOR: Record<
  ItemLinkPermissionScope,
  string
> = {
  // 匿名链接使用偏绿的状态色，贴近 Microsoft Share 界面里“Anyone”选项的视觉语义。
  anonymous: tokens.colorPaletteGreenForeground3,
  // 组织内链接使用偏蓝的状态色，保持与“People in organization”一类企业范围选项接近。
  organization: tokens.colorPaletteBlueForeground2,
  // 指定对象链接使用中性灰，避免它在视觉层级上抢过更开放的链接范围。
  specific: tokens.colorNeutralForeground3,
};

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

  if (scope === "anonymous") {
    return <GlobeRegular primaryFill={primaryFill} />;
  }

  if (scope === "organization") {
    return <BriefcaseRegular primaryFill={primaryFill} />;
  }

  return <PersonRegular primaryFill={primaryFill} />;
};

/**
 * Item link 行共享外壳的输入属性。
 */
export interface IItemLinkPermissionRowShellProps {
  entry: IItemLinkPermissionDerivedEntry;
  interactionDisabled: boolean;
  onCopyLink: (webUrl: string) => void;
  onDeleteLink: (entry: IItemLinkPermissionDerivedEntry) => void;
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
