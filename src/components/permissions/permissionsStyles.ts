import { makeStyles, shorthands, tokens } from "@fluentui/react-components";

/**
 * 容器权限模块样式。
 */
export const usePermissionsStyles = makeStyles({
  content: {
    display: "flex",
    flexDirection: "column",
    rowGap: "16px",
    minWidth: "560px",
    maxWidth: "100%",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    rowGap: "8px",
  },
  placeholderBox: {
    border: `1px dashed ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground2,
    minHeight: "72px",
    display: "flex",
    alignItems: "center",
    ...shorthands.padding("12px"),
    boxSizing: "border-box",
  },
  listPlaceholder: {
    minHeight: "160px",
  },
});
