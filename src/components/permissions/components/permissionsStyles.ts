import { makeStyles, tokens } from "@fluentui/react-components";

/**
 * 权限模块共享样式。
 *
 * 这一层专门收口容器权限和 Item 权限弹窗共用的布局与视觉规则，
 * 避免两个弹窗在重构后继续复制同一套样式定义。
 */
export const usePermissionsStyles = makeStyles({
  surface: {
    width: "min(560px, calc(100vw - 32px))",
    maxWidth: "calc(100vw - 32px)",
    height: "650px",
    maxHeight: "calc(100vh - 32px)",
  },
  body: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
  },
  content: {
    display: "flex",
    flexDirection: "column",
    rowGap: "16px",
    width: "100%",
    minWidth: 0,
    maxWidth: "100%",
    flex: 1,
    minHeight: 0,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    rowGap: "8px",
    minWidth: 0,
  },
  itemHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    columnGap: "12px",
    minWidth: 0,
  },
  itemHeaderText: {
    display: "flex",
    flexDirection: "column",
    rowGap: "4px",
    minWidth: 0,
    flex: 1,
  },
  itemHeaderMetaRow: {
    display: "block",
    minWidth: 0,
  },
  itemSubtitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  linkButton: {
    paddingLeft: "0",
    paddingRight: "0",
    minWidth: "auto",
  },
  inlineLink: {
    color: tokens.colorBrandForegroundLink,
    fontSize: "inherit",
    lineHeight: "inherit",
    textDecorationLine: "underline",
    verticalAlign: "baseline",
  },
  principalInputWrapper: {
    width: "100%",
    minWidth: 0,
  },
  principalCombobox: {
    width: "100%",
    minWidth: 0,
  },
  dropdownOption: {
    display: "grid",
    gridTemplateColumns: "32px 1fr auto",
    alignItems: "center",
    columnGap: "10px",
    width: "100%",
    minWidth: 0,
  },
  dropdownOptionText: {
    display: "flex",
    flexDirection: "column",
    rowGap: "2px",
    minWidth: 0,
  },
  dropdownOptionSecondary: {
    color: tokens.colorNeutralForeground3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  dropdownOptionMeta: {
    color: tokens.colorPaletteCornflowerForeground2,
  },
  loadingOption: {
    display: "flex",
    alignItems: "center",
    columnGap: "10px",
  },
  searchStatusText: {
    color: tokens.colorNeutralForeground3,
  },
  duplicateStatusText: {
    color: tokens.colorPaletteMarigoldForeground2,
  },
  errorStatusText: {
    color: tokens.colorPaletteRedForeground1,
  },
  accessListSection: {
    display: "flex",
    flexDirection: "column",
    rowGap: "8px",
    minWidth: 0,
    flex: 1,
    minHeight: 0,
  },
  tableWrapper: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    overflowX: "auto",
    overflowY: "auto",
  },
  accessTable: {
    width: "100%",
    minWidth: "360px",
    tableLayout: "fixed",
    height: "auto",
  },
  principalColumn: {
    minWidth: "220px",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    paddingTop: "8px",
    paddingBottom: "8px",
  },
  roleColumn: {
    width: "132px",
    minWidth: "132px",
    paddingTop: "8px",
    paddingBottom: "8px",
  },
  actionColumn: {
    width: "56px",
    minWidth: "56px",
    paddingTop: "8px",
    paddingBottom: "8px",
  },
  principalCellContent: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    columnGap: "8px",
    minWidth: 0,
    width: "100%",
  },
  principalCellText: {
    display: "flex",
    flexDirection: "column",
    rowGap: "2px",
    minWidth: 0,
    flex: 1,
  },
  principalSecondaryText: {
    color: tokens.colorNeutralForeground3,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },
  inheritedIcon: {
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
    marginTop: "2px",
  },
  inheritedIconWrapper: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  tooltipContent: {
    animationName: {
      from: {
        opacity: 0,
      },
      to: {
        opacity: 1,
      },
    },
    animationDuration: "160ms",
    animationTimingFunction: "ease-out",
  },
  roleSelect: {
    width: "115px",
  },
  disclaimerBox: {
    color: tokens.colorNeutralForeground3,
  },
  footerActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    minWidth: 0,
    marginTop: "0",
  },
  applyFeedbackWrapper: {
    display: "flex",
    alignItems: "center",
    minHeight: "24px",
    minWidth: 0,
  },
  applySuccessFeedback: {
    display: "flex",
    alignItems: "center",
    columnGap: "6px",
    color: tokens.colorPaletteGreenForeground1,
  },
  applySavingFeedback: {
    display: "flex",
    alignItems: "center",
    columnGap: "6px",
    color: tokens.colorNeutralForeground3,
  },
  applyErrorFeedback: {
    display: "flex",
    alignItems: "center",
    columnGap: "6px",
    color: tokens.colorPaletteRedForeground1,
  },
  footerButtons: {
    display: "flex",
    alignItems: "center",
    columnGap: "12px",
    marginLeft: "auto",
  },
});
