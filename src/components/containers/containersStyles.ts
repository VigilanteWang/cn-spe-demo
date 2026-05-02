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
    ...shorthands.padding("24px"),
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
    width: "min(420px, 100%)",
    minWidth: "280px",
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
    ":hover": {
      backgroundColor: tokens.colorPaletteGreenBackground2,
    },
    ":active": {
      backgroundColor: tokens.colorPaletteGreenBackground1,
    },
  },
  filesRegion: {
    width: "100%",
    marginTop: "24px",
  },
});
