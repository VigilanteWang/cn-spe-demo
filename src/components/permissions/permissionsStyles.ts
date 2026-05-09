import { makeStyles, shorthands, tokens } from "@fluentui/react-components";

/**
 * 容器权限模块样式。
 */
export const usePermissionsStyles = makeStyles({
  surface: {
    width: "min(560px, calc(100vw - 32px))",
    maxWidth: "calc(100vw - 32px)",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    rowGap: "16px",
    width: "100%",
    minWidth: 0,
    maxWidth: "100%",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    rowGap: "8px",
    minWidth: 0,
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
  tableWrapper: {
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflowX: "auto",
    ...shorthands.padding("8px"),
  },
  accessTable: {
    width: "100%",
    minWidth: "360px",
    tableLayout: "fixed",
  },
  headerCell: {
    fontWeight: tokens.fontWeightBold,
    whiteSpace: "nowrap",
  },
  principalColumn: {
    minWidth: "220px",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },
  roleColumn: {
    width: "132px",
    minWidth: "132px",
  },
  actionColumn: {
    width: "56px",
    minWidth: "56px",
  },
  roleSelect: {
    width: "115px",
  },
});
