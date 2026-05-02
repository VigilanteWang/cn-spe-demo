import { makeStyles, shorthands, tokens } from "@fluentui/react-components";

/**
 * 容器页面的布局样式。
 */
export const useContainersStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    width: "100%",
    ...shorthands.padding("35px"),
    boxSizing: "border-box",
  },
  headerSection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    rowGap: "12px",
    width: "100%",
  },
  controlsRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: "12px",
    rowGap: "12px",
    width: "100%",
  },
  containerDropdown: {
    width: "min(350px, 100%)",
  },
  actionGroup: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: "12px",
    rowGap: "12px",
  },
  managePermissionButton: {
    backgroundColor: tokens.colorPaletteGreenBackground3,
    color: tokens.colorNeutralForegroundOnBrand,
    // 悬停时使用更深的绿色（Foreground 色阶比 Background 更深），与 primary 按钮变暗行为一致
    ":hover": {
      backgroundColor: tokens.colorPaletteGreenForeground1,
      color: tokens.colorNeutralForegroundOnBrand,
    },
    ":active": {
      backgroundColor: tokens.colorPaletteGreenForeground2,
      color: tokens.colorNeutralForegroundOnBrand,
    },
  },
  filesRegion: {
    width: "100%",
    marginTop: "24px",
  },
});
