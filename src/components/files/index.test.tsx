// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Providers } from "@microsoft/mgt-element";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { AppError } from "../../../common/appError";
import { Files } from "./index";

const {
  deleteItemsMock,
  loadItemsMock,
  updateSelectedRowsMock,
  graphPostMock,
  useFilesDataMock,
  useFilesNavigationMock,
  useFilesUploadMock,
  useFilesArchiveDownloadMock,
} = vi.hoisted(() => ({
  deleteItemsMock: vi.fn(),
  loadItemsMock: vi.fn().mockResolvedValue(true),
  updateSelectedRowsMock: vi.fn(),
  graphPostMock: vi.fn(),
  useFilesDataMock: vi.fn(),
  useFilesNavigationMock: vi.fn(),
  useFilesUploadMock: vi.fn(),
  useFilesArchiveDownloadMock: vi.fn(),
}));

vi.mock("../../services/backendApi", () => ({
  deleteItems: deleteItemsMock,
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
    dialogContent: "dialogContent",
    dialogInputControl: "dialogInputControl",
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
  }: {
    driveItems: Array<{ name?: string }>;
    onPreviewFile: (item: never) => void;
  }) => (
    <div>
      {driveItems.length > 0 && (
        <button onClick={() => onPreviewFile(driveItems[0] as never)}>
          Open Preview
        </button>
      )}
    </div>
  ),
}));

vi.mock("../preview", () => ({
  default: ({
    isOpen,
    onDelete,
    actionError,
  }: {
    isOpen: boolean;
    onDelete: () => void;
    actionError?: Error | null;
  }) =>
    isOpen ? (
      <div>
        <button onClick={onDelete}>Preview Delete</button>
        {actionError ? <div>{actionError.message}</div> : null}
      </div>
    ) : null,
}));

vi.mock("../permissions", () => ({
  ItemPermissionDialog: () => null,
}));

const baseDriveItems = [
  {
    id: "file-1",
    name: "Quarterly Report.pdf",
    isFolder: false,
    downloadUrl: "https://contoso.example/download/file-1",
  },
];

describe("Files", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Providers.globalProvider = {
      onStateChanged: vi.fn(),
      addStateChangedHandler: vi.fn(),
      removeStateChangedHandler: vi.fn(),
      graph: {
        client: {
          api: vi.fn(() => ({
            post: graphPostMock,
          })),
        },
      },
    } as never;

    useFilesDataMock.mockReturnValue({
      driveItems: baseDriveItems,
      selectedRows: new Set(["file-1"]),
      currentFolderId: "root",
      loadError: null,
      loadItems: loadItemsMock,
      onSelectionChange: vi.fn(),
      clearSelection: vi.fn(),
      updateSelectedRows: updateSelectedRowsMock,
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
  });

  it("should show folder creation errors inside the new-folder dialog", async () => {
    graphPostMock.mockRejectedValue(new Error("Folder name already exists."));

    render(
      <Files
        container={{ id: "container-1" } as never}
        onOpenContainerPermissions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New Folder" }));
    fireEvent.change(screen.getByLabelText("Folder name:"), {
      target: { value: "Reports" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Folder" }));

    expect(
      await screen.findByText(
        "FilesCreateFolderError: Folder name already exists.",
      ),
    ).toBeInTheDocument();
  });

  it("should show partial delete failures inside the delete confirmation dialog", async () => {
    deleteItemsMock.mockResolvedValue({
      successful: [],
      failed: [{ id: "file-1", reason: "Folder is locked." }],
    });

    render(
      <Files
        container={{ id: "container-1" } as never}
        onOpenContainerPermissions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Delete Dialog" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByText("FilesDeleteError: Folder is locked."),
    ).toBeInTheDocument();
    expect(updateSelectedRowsMock).toHaveBeenCalledWith(new Set(["file-1"]));
  });

  it("should keep preview open and show delete errors inside the preview dialog", async () => {
    deleteItemsMock.mockRejectedValue(
      new AppError({
        name: "AppError",
        code: "previewDeleteFailed",
        message: "Failed to delete the current file.",
      }),
    );

    render(
      <Files
        container={{ id: "container-1" } as never}
        onOpenContainerPermissions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview Delete" }));

    await waitFor(() => {
      expect(
        screen.getByText("Failed to delete the current file."),
      ).toBeInTheDocument();
    });
  });
});
