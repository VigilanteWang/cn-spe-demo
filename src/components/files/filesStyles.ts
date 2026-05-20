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
    padding: "6px 0",
  },
  toolbarContainer: {
    marginBottom: "16px",
  },
  toolbar: {
    padding: "6px 0",
    // 工具栏按钮在窄视口时自动换行，保证所有操作始终可见可点击。
    // 横向滚动只适合数据区（DataGrid），操作区不应隐藏在滚动后方。
    flexWrap: "wrap",
  },
  // 仅移除第一个工具栏按钮的左侧 padding，使工具栏行与父容器左边缘对齐。
  // 按钮之间的间距由相邻按钮各自的 padding 共同构成（左按钮右 padding + 右按钮左 padding），
  // 只修改第一个按钮的左侧，不会影响任何按钮之间的视觉间距。
  toolbarFirstButton: {
    paddingLeft: "0",
  },
  progressContainer: {
    marginBottom: "24px",
    padding: "0px 10px",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    rowGap: "8px",
    boxSizing: "border-box",
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
    padding: "0 3px",
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
  // Files 容器样式：100% 宽度、最大宽度限制并水平居中。
  filesContainer: {
    width: "100%",
    margin: "0",
  },
  // DataGrid 专属滚动容器：只让表格区域在窄视口下横向滚动，
  // 面包屑、工具栏、进度条等区域不受影响。
  dataGridWrapper: {
    overflowX: "auto",
    width: "100%",
  },
  // Name 列单元格内容：允许长文件名在列宽不足时自动换行，
  // 避免文字被截断或溢出到相邻列。
  nameCellContent: {
    whiteSpace: "normal",
    wordBreak: "break-word",
  },
});
