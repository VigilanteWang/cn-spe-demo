import { Button, Text } from "@fluentui/react-components";
import { CopyRegular, DeleteRegular } from "@fluentui/react-icons";
import type { IItemLinkPermissionDerivedEntry } from "../models/itemLinkPermissionModels";
import { getItemLinkPermissionScopeLabel } from "../services/itemLinkPermissionUiUtils";
import { usePermissionsStyles } from "./permissionsStyles";
import { renderItemLinkPermissionScopeIcon } from "./itemLinkPermissionRowShared";

/**
 * 普通 link 行组件的输入属性。
 */
export interface ILinkPermissionRowProps {
  entry: IItemLinkPermissionDerivedEntry;
  interactionDisabled: boolean;
  onCopyLink: (webUrl: string) => void;
  onDeleteLink: (entry: IItemLinkPermissionDerivedEntry) => void;
}

/**
 * 渲染 anonymous / organization 等无需行内 recipient 管理的 link 行。
 */
export const LinkPermissionRow = ({
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
            {renderItemLinkPermissionScopeIcon(entry.scope)}
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
