import { makeStyles, tokens } from "@fluentui/react-components";

/**
 * Files 功能区域的样式定义。
 */
export const useFilesStyles = makeStyles({
  newFolderDialogSurface: {
    // 新建文件夹弹窗与 Create container 保持同样的宽度策略，
    // 这样桌面端和窄屏下的整体视觉节奏会一致。
    maxWidth: "550px",
    width: "calc(100vw - 32px)",
  },
  dialogInputControl: {
    width: "360px",
    maxWidth: "100%",
  },
  dialogContent: {
    display: "flex",
    flexDirection: "column",
    rowGap: "10px",
    marginBottom: "25px",
  },
  dialogFooterErrorSlot: {
    gridRowStart: 3,
    gridRowEnd: 4,
    gridColumnStart: 1,
    gridColumnEnd: 3,
    alignSelf: "end",
    minHeight: "24px",
    minWidth: 0,
    paddingRight: "16px",
  },
  dialogFooterActions: {
    gridColumnStart: 3,
    gridColumnEnd: 4,
    justifySelf: "end",
  },
  dialogFooterButtons: {
    display: "flex",
    alignItems: "center",
    columnGap: "12px",
  },
  dialogErrorText: {
    color: tokens.colorPaletteRedForeground1,
    overflowWrap: "anywhere",
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

/**
 * Version history dialog 的样式定义。
 */
export const useVersionHistoryDialogStyles = makeStyles({
  surface: {
    // Versions Dialog 默认给到一个稍宽的可用空间，
    // 让表格能在桌面视口下更自然地铺开；窄屏时仍然受 viewport 限制。
    width: "min(670px, calc(100vw - 32px))",
    minWidth: "min(600px, calc(100vw - 32px))",
    maxWidth: "min(670px, calc(100vw - 32px))",
  },
  body: {
    display: "flex",
    flexDirection: "column",
    height: "50vh",
    minHeight: "280px",
    maxHeight: "calc(100vh - 32px)",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    rowGap: "12px",
    flex: 1,
    minHeight: 0,
    maxWidth: "100%",
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: "12px",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  headerLoading: {
    display: "flex",
    alignItems: "center",
    minHeight: "24px",
    fontSize: "12px",
    lineHeight: "16px",
  },
  headerLoadingSpinner: {
    "& .fui-Spinner__label": {
      fontSize: "12px",
      lineHeight: "16px",
    },
  },
  gridWrapper: {
    overflowX: "auto",
    overflowY: "auto",
    flex: 1,
    minHeight: 0,
    maxWidth: "100%",
  },
  grid: {
    // 表格默认占满 dialog 可用宽度；
    // 当列最小宽度总和更大时，再退回横向滚动而不是把列硬压坏。
    width: "100%",
    minWidth: "max-content",
  },
  actionGroup: {
    display: "flex",
    alignItems: "center",
    gap: "2px",
    width: "fit-content",
  },
  actionIconButton: {
    minWidth: "28px",
    width: "28px",
    paddingLeft: "4px",
    paddingRight: "4px",
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
  },
  emptyText: {
    color: tokens.colorNeutralForeground2,
  },
});
