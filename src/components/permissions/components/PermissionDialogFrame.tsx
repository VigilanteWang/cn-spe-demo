import { type ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Spinner,
  Tab,
  TabList,
  Text,
} from "@fluentui/react-components";
import {
  CheckmarkCircleRegular,
  DismissCircleRegular,
} from "@fluentui/react-icons";
import {
  PermissionAccessListTable,
  type IPermissionAccessListTableProps,
  type PermissionAccessListEntryWithRole,
} from "./PermissionAccessListTable";
import { PrincipalSearchComboBox } from "./PrincipalSearchComboBox";
import type { PermissionPrincipalSearchStatus } from "../hooks/usePermissionPrincipalSearch";
import type {
  IPermissionPrincipalCandidate,
  PermissionTabValue,
} from "../models/permissionSharedModels";
import { usePermissionsStyles } from "./permissionsStyles";
import type { PermissionApplyFeedbackStatus } from "../utils/permissionDialogSharedUtils";

/**
 * 通用权限弹窗骨架的输入属性。
 */
export interface IPermissionDialogFrameProps<
  TEntry extends PermissionAccessListEntryWithRole,
> {
  open: boolean;
  title: string;
  headerContent: ReactNode;
  permissionStatusMessages: string[];
  selectedTab: PermissionTabValue;
  interactionDisabled: boolean;
  searchInputId: string;
  query: string;
  searchResults: IPermissionPrincipalCandidate[];
  searchStatus: PermissionPrincipalSearchStatus;
  isDropdownOpen: boolean;
  isApplyingPermissions: boolean;
  applyFeedbackStatus: PermissionApplyFeedbackStatus;
  isApplyDisabled: boolean;
  isCloseDisabled?: boolean;
  beforeAccessListContent?: ReactNode;
  accessListProps: Omit<IPermissionAccessListTableProps<TEntry>, "selectedTab">;
  onRequestClose: () => void;
  onSelectedTabChange: (tab: PermissionTabValue) => void;
  onSearchQueryChange: (value: string) => void;
  onSearchCandidateSelect: (candidateId: string | undefined) => void;
  isCandidateAdded: (
    tab: PermissionTabValue,
    candidate: IPermissionPrincipalCandidate,
  ) => boolean;
  onApply: () => void;
}

/**
 * 共享的权限弹窗骨架。
 *
 * 它只承载 container / item 都一致的 UI 结构：
 * - Dialog 外壳
 * - 错误状态区
 * - People / Groups tabs
 * - Principal 搜索输入与结果
 * - Access list 表格壳
 * - Close / Apply 底部反馈
 *
 * 具体的 header 和表格行仍然交给调用方通过 slot 传入。
 */
export const PermissionDialogFrame = <
  TEntry extends PermissionAccessListEntryWithRole,
>({
  open,
  title,
  headerContent,
  permissionStatusMessages,
  selectedTab,
  interactionDisabled,
  searchInputId,
  query,
  searchResults,
  searchStatus,
  isDropdownOpen,
  isApplyingPermissions,
  applyFeedbackStatus,
  isApplyDisabled,
  isCloseDisabled = false,
  beforeAccessListContent,
  accessListProps,
  onRequestClose,
  onSelectedTabChange,
  onSearchQueryChange,
  onSearchCandidateSelect,
  isCandidateAdded,
  onApply,
}: IPermissionDialogFrameProps<TEntry>) => {
  const styles = usePermissionsStyles();

  return (
    <Dialog
      open={open}
      onOpenChange={(_event, data) => {
        if (!data.open) {
          onRequestClose();
        }
      }}
    >
      <DialogSurface className={styles.surface}>
        <DialogBody className={styles.body}>
          <DialogTitle>{title}</DialogTitle>

          <DialogContent className={styles.content}>
            <div className={styles.section}>
              {headerContent}
              {permissionStatusMessages.length > 0 ? (
                <div
                  role="status"
                  aria-live="polite"
                  className={styles.errorStatusText}
                >
                  {permissionStatusMessages.map((message) => (
                    <Text key={message} size={200}>
                      {message}
                    </Text>
                  ))}
                </div>
              ) : null}
            </div>

            <div className={styles.section}>
              <TabList
                selectedValue={selectedTab}
                onTabSelect={(_event, data) =>
                  onSelectedTabChange(data.value as PermissionTabValue)
                }
              >
                <Tab disabled={interactionDisabled} value="people">
                  People
                </Tab>
                <Tab disabled={interactionDisabled} value="groups">
                  Groups
                </Tab>
              </TabList>
            </div>

            <PrincipalSearchComboBox
              selectedTab={selectedTab}
              interactionDisabled={interactionDisabled}
              searchInputId={searchInputId}
              query={query}
              searchResults={searchResults}
              searchStatus={searchStatus}
              isDropdownOpen={isDropdownOpen}
              onSearchQueryChange={onSearchQueryChange}
              onSearchCandidateSelect={onSearchCandidateSelect}
              isCandidateAdded={isCandidateAdded}
            />

            {beforeAccessListContent}

            <PermissionAccessListTable
              selectedTab={selectedTab}
              {...accessListProps}
            />
          </DialogContent>

          <DialogActions className={styles.footerActions}>
            <div className={styles.applyFeedbackWrapper}>
              {isApplyingPermissions ? (
                <div
                  className={styles.applySavingFeedback}
                  role="status"
                  aria-live="polite"
                >
                  <Spinner size="tiny" />
                  <Text>Saving...</Text>
                </div>
              ) : null}

              {!isApplyingPermissions && applyFeedbackStatus === "success" ? (
                <div
                  className={styles.applySuccessFeedback}
                  role="status"
                  aria-live="polite"
                >
                  <CheckmarkCircleRegular />
                  <Text>Successful!</Text>
                </div>
              ) : null}

              {!isApplyingPermissions && applyFeedbackStatus === "error" ? (
                <div
                  className={styles.applyErrorFeedback}
                  role="status"
                  aria-live="polite"
                >
                  <DismissCircleRegular />
                  <Text>Failed</Text>
                </div>
              ) : null}
            </div>

            <div className={styles.footerButtons}>
              <Button
                appearance="secondary"
                disabled={isCloseDisabled}
                onClick={onRequestClose}
              >
                Close
              </Button>
              <Button
                appearance="primary"
                disabled={isApplyDisabled}
                onClick={onApply}
              >
                Apply
              </Button>
            </div>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
