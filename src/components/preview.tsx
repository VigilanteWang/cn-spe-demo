import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  Button,
  makeStyles,
  tokens,
  Spinner,
} from "@fluentui/react-components";
import {
  ChevronLeftRegular,
  ChevronRightRegular,
  SaveRegular,
  DeleteRegular,
  OpenRegular,
  DismissRegular,
} from "@fluentui/react-icons";
import { DriveItem } from "@microsoft/microsoft-graph-types-beta";
import { Providers } from "@microsoft/mgt-element";
import { IDriveItemExtended } from "../common/types";

interface IPreviewProps {
  isOpen: boolean;
  onDismiss: () => void;
  currentFile: IDriveItemExtended | null;
  allFiles: IDriveItemExtended[];
  onNavigate: (file: IDriveItemExtended) => void;
  onDownload: (downloadUrl: string) => void;
  onDelete: () => void;
  containerId?: string;
}

const useStyles = makeStyles({
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
  navigationContainer: {
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
});

// Microsoft Office and Visio file extensions
const OFFICE_EXTENSIONS = [
  "csv",
  "dic",
  "doc",
  "docm",
  "docx",
  "dotm",
  "dotx",
  "pot",
  "potm",
  "potx",
  "pps",
  "ppsm",
  "ppsx",
  "ppt",
  "pptm",
  "pptx",
  "xd",
  "xls",
  "xlsb",
  "xlsx",
  "sltx",
];
const VISIO_EXTENSIONS = ["vsd", "vsdx"];

export const Preview: React.FC<IPreviewProps> = ({
  isOpen,
  onDismiss,
  currentFile,
  allFiles,
  onNavigate,
  onDownload,
  onDelete,
  containerId,
}) => {
  const styles = useStyles();
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // Get current file index for navigation
  const currentIndex = currentFile
    ? allFiles.findIndex((file) => file.id === currentFile.id)
    : -1;

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < allFiles.length - 1;

  // Load preview URL when file changes
  useEffect(() => {
    if (currentFile && isOpen) {
      loadPreviewUrl();
    }
  }, [currentFile, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPreviewUrl = async () => {
    if (!currentFile) return;

    setIsLoading(true);
    setError("");

    try {
      const graphClient = Providers.globalProvider.graph.client;

      // Use the container ID passed from parent or get from file's parent reference
      const driveId = containerId || currentFile.parentReference?.driveId;
      const fileId = currentFile.id;

      if (!driveId || !fileId) {
        setError("Unable to get drive or file information");
        setIsLoading(false);
        return;
      }

      // Try to get preview URL using Graph API
      try {
        const previewResponse = await graphClient
          .api(`/drives/${driveId}/items/${fileId}/preview`)
          .post({});

        if (previewResponse.getUrl) {
          // Add &nb=true parameter to remove the top banner
          const urlWithNoBanner = previewResponse.getUrl.includes("?")
            ? `${previewResponse.getUrl}&nb=true`
            : `${previewResponse.getUrl}?nb=true`;
          setPreviewUrl(urlWithNoBanner);
        } else {
          // Fallback to webUrl if preview is not available
          if (currentFile.webUrl) {
            // Also add &nb=true to webUrl for consistency
            const urlWithNoBanner = currentFile.webUrl.includes("?")
              ? `${currentFile.webUrl}&nb=true`
              : `${currentFile.webUrl}?nb=true`;
            setPreviewUrl(urlWithNoBanner);
          } else {
            setError("Preview not available for this file");
          }
        }
      } catch (previewError) {
        console.warn(
          "Preview API failed, falling back to webUrl:",
          previewError,
        );
        // Fallback to webUrl
        if (currentFile.webUrl) {
          // Add &nb=true parameter to remove the top banner
          const urlWithNoBanner = currentFile.webUrl.includes("?")
            ? `${currentFile.webUrl}&nb=true`
            : `${currentFile.webUrl}?nb=true`;
          setPreviewUrl(urlWithNoBanner);
        } else {
          setError("Preview not available for this file");
        }
      }
    } catch (err) {
      console.error("Error loading preview:", err);
      setError("Failed to load preview");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrevious = () => {
    if (hasPrevious) {
      const previousFile = allFiles[currentIndex - 1];
      onNavigate(previousFile);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      const nextFile = allFiles[currentIndex + 1];
      onNavigate(nextFile);
    }
  };

  const handleOpenInNewTab = () => {
    if (!currentFile) return;

    const fileExtension =
      currentFile.name?.split(".").pop()?.toLowerCase() || "";

    // Check if it's an Office or Visio document
    if (
      OFFICE_EXTENSIONS.includes(fileExtension) ||
      VISIO_EXTENSIONS.includes(fileExtension)
    ) {
      // Open webUrl for Office/Visio documents to enable editing
      if (currentFile.webUrl) {
        window.open(currentFile.webUrl, "_blank");
      }
    } else {
      // Open preview URL for other files
      if (previewUrl) {
        window.open(previewUrl, "_blank");
      }
    }
  };

  const handleDownload = () => {
    if (currentFile?.downloadUrl) {
      onDownload(currentFile.downloadUrl);
    }
  };

  if (!currentFile) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(event, data) => !data.open && onDismiss()}
    >
      <DialogSurface className={styles.dialogSurface}>
        <DialogBody className={styles.dialogBody}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <DialogTitle className={styles.dialogTitle}>
              {currentFile.name}
            </DialogTitle>
            <Button
              appearance="subtle"
              icon={<DismissRegular />}
              onClick={onDismiss}
              aria-label="Close preview"
            />
          </div>

          <div className={styles.previewContainer}>
            {isLoading ? (
              <div className={styles.loadingContainer}>
                <Spinner size="large" />
                <div>Loading preview...</div>
              </div>
            ) : error ? (
              <div className={styles.loadingContainer}>
                <div>Error: {error}</div>
              </div>
            ) : previewUrl ? (
              <iframe
                src={previewUrl}
                className={styles.previewFrame}
                title={`Preview of ${currentFile.name}`}
                sandbox="allow-same-origin allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox"
              />
            ) : (
              <div className={styles.loadingContainer}>
                <div>No preview available</div>
              </div>
            )}
          </div>

          <div className={styles.navigationContainer}>
            <div className={styles.navigationButtons}>
              <Button
                icon={<ChevronLeftRegular />}
                disabled={!hasPrevious}
                onClick={handlePrevious}
                aria-label="Previous file"
              ></Button>
              <Button
                icon={<ChevronRightRegular />}
                iconPosition="after" // 图标在文字右侧
                disabled={!hasNext}
                onClick={handleNext}
                aria-label="Next file"
              ></Button>
            </div>

            <div className={styles.actionButtons}>
              <Button
                icon={<SaveRegular />}
                onClick={handleDownload}
                aria-label="Download file"
              >
                Download
              </Button>
              <Button
                icon={<OpenRegular />}
                onClick={handleOpenInNewTab}
                aria-label="Open in new tab"
              >
                Open in new tab
              </Button>
              <Button
                icon={<DeleteRegular />}
                onClick={onDelete}
                aria-label="Delete file"
              >
                Delete
              </Button>
            </div>
          </div>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

export default Preview;
