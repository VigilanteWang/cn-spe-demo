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
 * 权限弹窗顶部 tab 的配置项。
 *
 * 共享壳层默认仍渲染 `People / Groups`，
 * 但 item dialog 现在可以额外插入 `Links` 这类自定义页签。
 */
export interface IPermissionDialogTab<TTab extends string> {
  value: TTab;
  label: string;
  disabled?: boolean;
}

/**
 * 通用权限弹窗框架的输入属性。
 *
 * 这个接口把共享弹窗壳所需的状态、事件和插槽集中起来，
 * 让 container / item 两类权限对话框复用同一套布局骨架。
 *
 * @typeParam TEntry Access List 单条权限行的具体类型。
 */
export interface IPermissionDialogFrameProps<
  TEntry extends PermissionAccessListEntryWithRole,
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
  /** 是否需要统一禁用 tab、搜索和列表等交互。 */
  interactionDisabled: boolean;
  /** 搜索输入框的稳定 id，便于无障碍关联。 */
  searchInputId?: string;
  /** 当前搜索框里的文本。 */
  query?: string;
  /** 当前搜索结果列表。 */
  searchResults?: IPermissionPrincipalCandidate[];
  /** 搜索状态机的当前状态。 */
  searchStatus?: PermissionPrincipalSearchStatus;
  /** 搜索结果下拉面板是否展开。 */
  isDropdownOpen?: boolean;
  /** 是否正在提交 Apply 请求。 */
  isApplyingPermissions: boolean;
  /** Apply 完成后的反馈状态。 */
  applyFeedbackStatus: PermissionApplyFeedbackStatus;
  /** Apply 按钮是否应禁用。 */
  isApplyDisabled: boolean;
  /** Close 按钮是否应禁用。 */
  isCloseDisabled?: boolean;
  /** 自定义主体内容；用于 item dialog 的 Links 面板等非标准布局。 */
  bodyContent?: ReactNode;
  /** 插入在 Access List 前方的额外内容插槽。 */
  beforeAccessListContent?: ReactNode;
  /** Access List 表格所需的其余属性，`selectedTab` 由框架统一补入。 */
  accessListProps?: Omit<
    IPermissionAccessListTableProps<TEntry>,
    "selectedTab"
  >;
  /** 请求关闭弹窗时触发。 */
  onRequestClose: () => void;
  /** 切换 People / Groups tab 时触发。 */
  onSelectedTabChange: (tab: TTab) => void;
  /** 搜索框文本变化时触发。 */
  onSearchQueryChange?: (value: string) => void;
  /** 选中某个搜索候选项时触发。 */
  onSearchCandidateSelect?: (candidateId: string | undefined) => void;
  /** 判断候选项是否已经被加入当前草稿。 */
  isCandidateAdded?: (
    tab: PermissionTabValue,
    candidate: IPermissionPrincipalCandidate,
  ) => boolean;
  /** 点击 Apply 按钮时触发。 */
  onApply: () => void;
}

/**
 * 共享的权限弹窗骨架组件。
 *
 * 它负责承载 container / item 两类权限对话框一致的 UI 结构：
 * 1. Dialog 外壳与标题
 * 2. 顶部状态消息区
 * 3. People / Groups tabs
 * 4. Principal 搜索区
 * 5. Access List 表格区
 * 6. 底部 Close / Apply 按钮与提交反馈
 *
 * 具体的头部内容、权限表格数据和搜索状态仍然由外层容器组件提供。
 *
 * @typeParam TEntry Access List 单条权限行的具体类型。
 * @returns 渲染后的共享权限弹窗框架。
 */
export const PermissionDialogFrame = <
  TEntry extends PermissionAccessListEntryWithRole,
  TTab extends string = PermissionTabValue,
>({
  open,
  title,
  headerContent,
  permissionErrorMessages,
  selectedTab,
  tabs,
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
  bodyContent,
  beforeAccessListContent,
  accessListProps,
  onRequestClose,
  onSelectedTabChange,
  onSearchQueryChange,
  onSearchCandidateSelect,
  isCandidateAdded,
  onApply,
}: IPermissionDialogFrameProps<TEntry, TTab>) => {
  const styles = usePermissionsStyles();
  const resolvedTabs =
    tabs ??
    ([
      { value: "people" as TTab, label: "People" },
      { value: "groups" as TTab, label: "Groups" },
    ] satisfies IPermissionDialogTab<TTab>[]);
  const resolvedSearchResults = searchResults ?? [];
  const resolvedSearchStatus = searchStatus ?? "idle";
  const resolvedIsDropdownOpen = isDropdownOpen ?? false;
  const resolvedIsCandidateAdded =
    isCandidateAdded ??
    ((_tab: PermissionTabValue, _candidate: IPermissionPrincipalCandidate) =>
      false);
  const resolvedBodyContent =
    bodyContent ??
    (searchInputId &&
    query !== undefined &&
    onSearchQueryChange &&
    onSearchCandidateSelect &&
    accessListProps ? (
      <>
        <PrincipalSearchComboBox
          selectedTab={selectedTab as PermissionTabValue}
          interactionDisabled={interactionDisabled}
          searchInputId={searchInputId}
          query={query}
          searchResults={resolvedSearchResults}
          searchStatus={resolvedSearchStatus}
          isDropdownOpen={resolvedIsDropdownOpen}
          onSearchQueryChange={onSearchQueryChange}
          onSearchCandidateSelect={onSearchCandidateSelect}
          isCandidateAdded={resolvedIsCandidateAdded}
        />

        {beforeAccessListContent}

        <PermissionAccessListTable
          selectedTab={selectedTab as PermissionTabValue}
          {...accessListProps}
        />
      </>
    ) : null);

  return (
    <Dialog
      open={open}
      onOpenChange={(_event, data) => {
        /* 把 Fluent UI 的关闭意图统一转交给外层，让外层决定是否丢弃草稿、清理状态或真正关闭弹窗。 */
        if (!data.open) {
          onRequestClose();
        }
      }}
    >
      {/* DialogSurface：弹窗最外层承载容器，负责控制整体尺寸、边距和视觉外壳。 */}
      <DialogSurface className={styles.surface}>
        {/* DialogBody：弹窗主体区域，把标题、内容和底部操作区组织成统一布局。 */}
        <DialogBody className={styles.body}>
          {/* DialogTitle：弹窗标题，告诉用户当前正在编辑哪一类权限。 */}
          <DialogTitle>{title}</DialogTitle>

          {/* DialogContent：弹窗内容区，承载头部信息、tab、搜索和权限列表。 */}
          <DialogContent className={styles.content}>
            <div className={styles.section}>
              {/* 头部业务信息：展示当前对象的标识、说明或其他上下文。 */}
              {headerContent}
              {permissionErrorMessages.length > 0 ? (
                <div
                  role="status"
                  aria-live="polite"
                  className={styles.errorStatusText}
                >
                  {/* 顶部状态区集中展示加载、校验或提交后的错误信息 */}
                  {permissionErrorMessages.map((message) => (
                    <Text key={message} size={200}>
                      {message}
                    </Text>
                  ))}
                </div>
              ) : null}
            </div>

            <div className={styles.section}>
              {/* 共享框架只负责把 UI 事件翻译成稳定的 tab 值，真正的数据切换仍由外层状态管理处理。 */}
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

            {resolvedBodyContent}
          </DialogContent>

          {/* 底部操作区：集中放置提交反馈和关闭 / 应用按钮。 */}
          <DialogActions className={styles.footerActions}>
            {/* Apply 提交过程中的状态反馈，便于用户确认当前是否正在保存。 */}
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

            {/* 底部按钮组：Close 用于退出弹窗，Apply 用于提交当前权限变更。 */}
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
