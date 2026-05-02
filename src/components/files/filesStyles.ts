import { makeStyles, tokens } from "@fluentui/react-components";

/**
 * Files 功能区域的样式定义。
 */
export const useFilesStyles = makeStyles({
  dialogInputControl: {
    width: "400px",
  },
  dialogContent: {
    display: "flex",
    flexDirection: "column",
    rowGap: "10px",
    marginBottom: "25px",
  },
  breadcrumbContainer: {
    marginBottom: "16px",
    padding: "8px 0",
  },
  toolbarContainer: {
    marginBottom: "16px",
  },
  progressContainer: {
    marginBottom: "16px",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    rowGap: "8px",
  },
  progressBar: {
    width: "100%",
  },
  progressText: {
    fontSize: "14px",
    color: tokens.colorNeutralForeground1,
  },
  progressCompleted: {
    color: tokens.colorPaletteGreenForeground1,
    fontWeight: "600",
  },
  progressStatusRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    columnGap: "12px",
  },
  progressStatusText: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  progressStatusRight: {
    display: "flex",
    alignItems: "center",
    columnGap: "10px",
    flexShrink: 0,
  },
  progressPercent: {
    fontWeight: "600",
  },
  actionsButtonGroup: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  // Files 容器样式：100% 宽度、最大宽度限制并水平居中
  filesContainer: {
    width: "100%",
    maxWidth: "min(1000px, 92%)",
    margin: "0",
  },
});
