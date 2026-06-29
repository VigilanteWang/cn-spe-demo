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
import type { PermissionTabValue } from "../models/permissionSharedModels";
import { usePermissionsStyles } from "./permissionsStyles";
import type { PermissionApplyFeedbackStatus } from "../utils/permissionDialogSharedUtils";

/**
 * 权限弹窗顶部 tab 的配置项。
 *
 * 共享壳层默认仍然服务 `People / Groups`，
 * 但 item dialog 现在也可以额外插入 `Links` 这类自定义 tab 。
 */
export interface IPermissionDialogTab<TTab extends string> {
  value: TTab;
  label: string;
  disabled?: boolean;
}

/**
 * 通用权限弹窗框架的输入属性。
 *
 * 这个接口只描述共享壳层需要的状态、事件和插槽，
 * 不再内置 people/groups 的默认编辑体拼装。
 *
 * @typeParam TEntry Access List 单条权限行的具体类型。
 */
export interface IPermissionDialogFrameProps<
  TTab extends string = PermissionTabValue,
> {
  /** 控制弹窗是否打开。 */
  open: boolean;
  /** 弹窗标题。 */
  title: string;
  /** 标题下方的业务头部内容，例如当前 container 或 item 名称。 */
  headerContent: ReactNode;
  /** 顶部状态区要展示的提示或错误消息。 */
  permissionErrorMessages: string[];
  /** 当前激活的权限 tab。 */
  selectedTab: TTab;
  /** 顶部 tab 定义；不传时默认渲染 People / Groups。 */
  tabs?: IPermissionDialogTab<TTab>[];
  /** 是否需要统一禁用 tab 和主体交互。 */
  interactionDisabled: boolean;
  /** 是否正在提交 Apply 请求。 */
  isApplyingPermissions: boolean;
  /** Apply 完成后的反馈状态。 */
  applyFeedbackStatus: PermissionApplyFeedbackStatus;
  /** Apply 按钮是否应禁用。 */
  isApplyDisabled: boolean;
  /** Close 按钮是否应禁用。 */
  isCloseDisabled?: boolean;
  /** 弹窗主体内容，由外层容器自行拼装。 */
  bodyContent: ReactNode;
  /** 请求关闭弹窗时触发。 */
  onRequestClose: () => void;
  /** 切换 tab 时触发。 */
  onSelectedTabChange: (tab: TTab) => void;
  /** 点击 Apply 按钮时触发。 */
  onApply: () => void;
}

/**
 * 共享的权限弹窗壳层组件。
 *
 * 它只负责承载 container / item 两类权限对话框一致的 UI 结构：
 * 1. Dialog 外壳与标题
 * 2. 顶部状态消息区
 * 3. Tab 导航
 * 4. 主体内容插槽
 * 5. 底部 Close / Apply 与保存反馈
 *
 * @typeParam TEntry Access List 单条权限行的具体类型。
 * @returns 渲染后的共享权限弹窗框架。
 */
export const PermissionDialogFrame = <
  TTab extends string = PermissionTabValue,
>({
  open,
  title,
  headerContent,
  permissionErrorMessages,
  selectedTab,
  tabs,
  interactionDisabled,
  isApplyingPermissions,
  applyFeedbackStatus,
  isApplyDisabled,
  isCloseDisabled = false,
  bodyContent,
  onRequestClose,
  onSelectedTabChange,
  onApply,
}: IPermissionDialogFrameProps<TTab>) => {
  const styles = usePermissionsStyles();
  const resolvedTabs =
    tabs ??
    ([
      { value: "people" as TTab, label: "People" },
      { value: "groups" as TTab, label: "Groups" },
    ] satisfies IPermissionDialogTab<TTab>[]);

  return (
    <Dialog
      open={open}
      onOpenChange={(_event, data) => {
        // 把 Fluent UI 的关闭意图统一转交给外层，让外层决定是否丢弃草稿或清理状态。
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
              {permissionErrorMessages.length > 0 ? (
                <div
                  role="status"
                  aria-live="polite"
                  className={styles.errorStatusText}
                >
                  {permissionErrorMessages.map((message) => (
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
                  onSelectedTabChange(data.value as TTab)
                }
              >
                {resolvedTabs.map((tab) => (
                  <Tab
                    key={tab.value}
                    disabled={interactionDisabled || tab.disabled}
                    value={tab.value}
                  >
                    {tab.label}
                  </Tab>
                ))}
              </TabList>
            </div>

            {bodyContent}
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
