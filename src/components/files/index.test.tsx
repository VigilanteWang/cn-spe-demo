// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Files } from "./index";
import { AppError } from "../../../common/appError";

const {
  useFilesDataMock,
  useFilesNavigationMock,
  useFilesUploadMock,
  useFilesArchiveDownloadMock,
  useFilesFolderCreationMock,
  useFilesDeleteActionMock,
  useFilesPreviewActionsMock,
  useFilesVersionDialogMock,
} = vi.hoisted(() => ({
  useFilesDataMock: vi.fn(),
  useFilesNavigationMock: vi.fn(),
  useFilesUploadMock: vi.fn(),
  useFilesArchiveDownloadMock: vi.fn(),
  useFilesFolderCreationMock: vi.fn(),
  useFilesDeleteActionMock: vi.fn(),
  useFilesPreviewActionsMock: vi.fn(),
  useFilesVersionDialogMock: vi.fn(),
}));

vi.mock("./hooks/useFilesData", () => ({
  useFilesData: useFilesDataMock,
}));

vi.mock("./hooks/useFilesNavigation", () => ({
  useFilesNavigation: useFilesNavigationMock,
}));

vi.mock("./hooks/useFilesUpload", () => ({
  useFilesUpload: useFilesUploadMock,
}));

vi.mock("./hooks/useFilesArchiveDownload", () => ({
  useFilesArchiveDownload: useFilesArchiveDownloadMock,
}));

vi.mock("./hooks/useFilesFolderCreation", () => ({
  useFilesFolderCreation: useFilesFolderCreationMock,
}));

vi.mock("./hooks/useFilesDeleteAction", () => ({
  useFilesDeleteAction: useFilesDeleteActionMock,
}));

vi.mock("./hooks/useFilesPreviewActions", () => ({
  useFilesPreviewActions: useFilesPreviewActionsMock,
}));

vi.mock("./hooks/useFilesVersionDialog", () => ({
  useFilesVersionDialog: useFilesVersionDialogMock,
}));

vi.mock("./filesStyles", () => ({
  useFilesStyles: () => ({
    filesContainer: "filesContainer",
    breadcrumbContainer: "breadcrumbContainer",
    toolbarContainer: "toolbarContainer",
    progressContainer: "progressContainer",
    progressBar: "progressBar",
    progressText: "progressText",
    progressCompleted: "progressCompleted",
    progressStatusRow: "progressStatusRow",
    progressStatusText: "progressStatusText",
    progressStatusRight: "progressStatusRight",
    progressPercent: "progressPercent",
    newFolderDialogSurface: "newFolderDialogSurface",
    dialogContent: "dialogContent",
    dialogInputControl: "dialogInputControl",
    dialogFooterErrorSlot: "dialogFooterErrorSlot",
    dialogFooterActions: "dialogFooterActions",
    dialogFooterButtons: "dialogFooterButtons",
    dialogErrorText: "dialogErrorText",
    dataGridWrapper: "dataGridWrapper",
    actionsButtonGroup: "actionsButtonGroup",
    nameCellContent: "nameCellContent",
  }),
}));

vi.mock("./components/FilesBreadcrumb", () => ({
  FilesBreadcrumb: () => <div>Breadcrumb</div>,
}));

vi.mock("./components/FilesToolbar", () => ({
  FilesToolbar: ({
    onCreateFolder,
    onDelete,
  }: {
    onCreateFolder: () => void;
    onDelete: () => void;
  }) => (
    <div>
      <button onClick={onCreateFolder}>New Folder</button>
      <button onClick={onDelete}>Open Delete Dialog</button>
    </div>
  ),
}));

vi.mock("./components/FilesProgress", () => ({
  FilesProgress: () => <div data-testid="files-progress" />,
}));

vi.mock("./components/FilesDataGrid", () => ({
  FilesDataGrid: ({
    driveItems,
    onPreviewFile,
    onManagePermissions,
    onManageVersions,
  }: {
    driveItems: Array<{ name?: string }>;
    onPreviewFile: (item: never) => void;
    onManagePermissions: (item: never) => void;
    onManageVersions: (item: never) => void;
  }) => (
    <div>
      {driveItems.length > 0 && (
        <>
          <button onClick={() => onPreviewFile(driveItems[0] as never)}>
            Open Preview
          </button>
          <button onClick={() => onManagePermissions(driveItems[0] as never)}>
            Open Permissions
          </button>
          <button onClick={() => onManageVersions(driveItems[0] as never)}>
            Open Versions
          </button>
        </>
      )}
    </div>
  ),
}));

vi.mock("./components/VersionHistoryDialog", () => ({
  VersionHistoryDialog: ({ open }: { open: boolean }) =>
    open ? <div>Versions Dialog</div> : null,
}));

vi.mock("../preview", () => ({
  default: ({
    isOpen,
    onDelete,
  }: {
    isOpen: boolean;
    onDelete: () => void;
  }) =>
    isOpen ? <button onClick={onDelete}>Preview Delete</button> : null,
}));

vi.mock("../permissions", () => ({
  ItemPermissionDialog: ({
    open,
  }: {
    open: boolean;
  }) => (open ? <div>Item Permission Dialog</div> : null),
}));

describe("Files", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useFilesDataMock.mockReturnValue({
      driveItems: [
        {
          id: "file-1",
          name: "Quarterly Report.pdf",
          isFolder: false,
          downloadUrl: "https://contoso.example/download/file-1",
        },
      ],
      selectedRows: new Set(["file-1"]),
      currentFolderId: "root",
      loadError: null,
      loadItems: vi.fn().mockResolvedValue(true),
      onSelectionChange: vi.fn(),
      clearSelection: vi.fn(),
      updateSelectedRows: vi.fn(),
    });

    useFilesNavigationMock.mockReturnValue({
      folderId: "root",
      breadcrumbPath: [{ id: "root", name: "Root" }],
      navigateToFolder: vi.fn(),
      navigateToParentFolder: vi.fn(),
      onBreadcrumbClick: vi.fn(),
    });

    useFilesUploadMock.mockReturnValue({
      uploadFileRef: { current: null },
      uploadFolderRef: { current: null },
      uploadProgress: {
        isUploading: false,
        currentFile: "",
        currentIndex: 0,
        successfulFiles: 0,
        failedFiles: 0,
        totalFiles: 0,
        fileSize: "",
        isCompleted: false,
        error: null,
      },
      onUploadFileClick: vi.fn(),
      onUploadFolderClick: vi.fn(),
      onUploadFileSelected: vi.fn(),
      onUploadFolderSelected: vi.fn(),
    });

    useFilesArchiveDownloadMock.mockReturnValue({
      downloadProgress: {
        phase: "idle",
        isActive: false,
        backendProgress: null,
        clientProgress: null,
        isCompleted: false,
        error: null,
        shouldAutoHide: false,
        isAborted: false,
      },
      onAbortClick: vi.fn(),
      onDismissClick: vi.fn(),
      onToolbarDownloadClick: vi.fn(),
      getArchiveProgressBarValue: vi.fn().mockReturnValue(0),
      getArchiveProgressPercentText: vi.fn().mockReturnValue("0%"),
      getArchiveProgressText: vi.fn().mockReturnValue(""),
    });

    useFilesFolderCreationMock.mockReturnValue({
      folderName: "",
      creatingFolder: false,
      newFolderError: null,
      onFolderNameChange: vi.fn(),
      createFolder: vi.fn().mockResolvedValue(true),
      resetFolderCreationState: vi.fn(),
    });

    useFilesDeleteActionMock.mockReturnValue({
      deleteDialogError: null,
      isDeleting: false,
      deleteSelectedItems: vi.fn().mockResolvedValue(true),
      resetDeleteError: vi.fn(),
    });

    useFilesPreviewActionsMock.mockReturnValue({
      previewActionError: null,
      isDeleting: false,
      deletePreviewItem: vi.fn().mockResolvedValue(true),
      clearPreviewActionError: vi.fn(),
    });

    useFilesVersionDialogMock.mockReturnValue({
      versionDialogOpen: false,
      versionDialogEntries: [],
      currentVersionId: null,
      versionDialogLoading: false,
      versionDialogActionPending: false,
      versionDialogError: null,
      openVersionDialog: vi.fn(),
      closeVersionDialog: vi.fn(),
      downloadVersion: vi.fn().mockResolvedValue(true),
      restoreVersion: vi.fn().mockResolvedValue(true),
      deleteVersion: vi.fn().mockResolvedValue(true),
      deleteHistoryVersions: vi.fn().mockResolvedValue(true),
    });
  });

  it("should reset folder state before opening the new-folder dialog", () => {
    render(
      <Files
        container={{ id: "container-1" } as never}
        onOpenContainerPermissions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New Folder" }));

    expect(useFilesFolderCreationMock.mock.results[0]?.value.resetFolderCreationState).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Create New Folder")).toBeInTheDocument();
  });

  it("should reset delete errors before opening the delete dialog", () => {
    render(
      <Files
        container={{ id: "container-1" } as never}
        onOpenContainerPermissions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Delete Dialog" }));

    expect(useFilesDeleteActionMock.mock.results[0]?.value.resetDeleteError).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Delete Item")).toBeInTheDocument();
  });

  it("should keep new-folder errors inside the dialog", () => {
    useFilesFolderCreationMock.mockReturnValue({
      folderName: "Existing Folder",
      creatingFolder: false,
      newFolderError: new AppError({
        name: "FilesCreateFolderError",
        code: "createFolderFailed",
        message: "Folder already exists.",
      }),
      onFolderNameChange: vi.fn(),
      createFolder: vi.fn().mockResolvedValue(false),
      resetFolderCreationState: vi.fn(),
    });

    render(
      <Files
        container={{ id: "container-1" } as never}
        onOpenContainerPermissions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New Folder" }));

    const dialog = screen.getByRole("dialog", { name: "Create New Folder" });
    expect(
      within(dialog).getByText("FilesCreateFolderError: Folder already exists."),
    ).toBeInTheDocument();
  });

  it("should open the preview when a grid file is selected", () => {
    render(
      <Files
        container={{ id: "container-1" } as never}
        onOpenContainerPermissions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Preview" }));

    expect(screen.getByRole("button", { name: "Preview Delete" })).toBeInTheDocument();
  });

  it("should open the versions dialog through the version hook", () => {
    render(
      <Files
        container={{ id: "container-1" } as never}
        onOpenContainerPermissions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Versions" }));

    expect(useFilesVersionDialogMock.mock.results[0]?.value.openVersionDialog).toHaveBeenCalledWith(
      expect.objectContaining({ id: "file-1" }),
    );
  });

  it("should open the item permission dialog from the grid action", () => {
    render(
      <Files
        container={{ id: "container-1" } as never}
        onOpenContainerPermissions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Permissions" }));

    expect(screen.getByText("Item Permission Dialog")).toBeInTheDocument();
  });
});
