import { makeStyles, tokens } from "@fluentui/react-components";

/**
 * Preview 弹窗内部共享样式。
 */
export const usePreviewStyles = makeStyles({
  dialogSurface: {
    width: "95vw",
    height: "95vh",
    maxWidth: "95vw",
    maxHeight: "95vh",
    padding: "0",
  },
  dialogBody: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    padding: "15px",
    maxHeight: "none",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dialogTitle: {
    marginBottom: "5px",
    fontSize: "20px",
    fontWeight: "600",
  },
  previewContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    position: "relative",
    minHeight: "0",
  },
  previewFrame: {
    flex: 1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: "4px",
    width: "100%",
    minHeight: 0,
    height: "100%",
  },
  loadingContainer: {
    flex: 1,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "column",
    gap: "10px",
    minHeight: 0,
    height: "100%",
  },
  footerContainer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "5px",
    "@media (max-width: 768px)": {
      flexDirection: "column",
      gap: "10px",
    },
  },
  navigationButtons: {
    display: "flex",
    gap: "10px",
  },
  actionButtons: {
    display: "flex",
    gap: "10px",
    "@media (max-width: 768px)": {
      width: "100%",
      justifyContent: "center",
    },
  },
});
