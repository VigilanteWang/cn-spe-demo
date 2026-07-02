// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Providers } from "@microsoft/mgt-element";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { AppError } from "../../../common/appError";
import { Files } from "./index";

const {
  deleteItemsMock,
  listItemVersionsMock,
  getCurrentItemVersionMock,
  getItemVersionDownloadMock,
  restoreItemVersionMock,
  deleteItemVersionMock,
  deleteItemHistoryVersionsMock,
  loadItemsMock,
  updateSelectedRowsMock,
  graphPostMock,
  useFilesDataMock,
  useFilesNavigationMock,
  useFilesUploadMock,
  useFilesArchiveDownloadMock,
} = vi.hoisted(() => ({
  deleteItemsMock: vi.fn(),
  listItemVersionsMock: vi.fn(),
  getCurrentItemVersionMock: vi.fn(),
  getItemVersionDownloadMock: vi.fn(),
  restoreItemVersionMock: vi.fn(),
  deleteItemVersionMock: vi.fn(),
  deleteItemHistoryVersionsMock: vi.fn(),
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

vi.mock("../../services/itemVersionApi", () => ({
  listItemVersions: listItemVersionsMock,
  getCurrentItemVersion: getCurrentItemVersionMock,
  getItemVersionDownload: getItemVersionDownloadMock,
  restoreItemVersion: restoreItemVersionMock,
  deleteItemVersion: deleteItemVersionMock,
  deleteItemHistoryVersions: deleteItemHistoryVersionsMock,
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
    onManageVersions,
  }: {
    driveItems: Array<{ name?: string }>;
    onPreviewFile: (item: never) => void;
    onManageVersions: (item: never) => void;
  }) => (
    <div>
      {driveItems.length > 0 && (
        <>
          <button onClick={() => onPreviewFile(driveItems[0] as never)}>
            Open Preview
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
  VersionHistoryDialog: ({
    open,
    versions,
    currentVersionId,
    error,
    onDownload,
    onRestore,
    onDelete,
    onDeleteHistoryVersions,
  }: {
    open: boolean;
    versions: Array<{ id: string }>;
    currentVersionId: string | null;
    error?: Error | null;
    onDownload: (entry: { id: string }) => void;
    onRestore: (entry: { id: string }) => void;
    onDelete: (entry: { id: string }) => void;
    onDeleteHistoryVersions: () => void;
  }) =>
    open ? (
      <div>
        <div>Versions Dialog</div>
        <div>Current Version: {currentVersionId}</div>
        <div>Entries: {versions.map((entry) => entry.id).join(",")}</div>
        <button onClick={() => onDownload(versions[0])}>Dialog Download</button>
        <button onClick={() => onRestore(versions[1])}>Dialog Restore</button>
        <button onClick={() => onDelete(versions[1])}>Dialog Delete</button>
        <button onClick={onDeleteHistoryVersions}>Dialog Delete History</button>
        {error ? <div>{error.message}</div> : null}
      </div>
    ) : null,
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

    listItemVersionsMock.mockResolvedValue([
      {
        id: "3.0",
        lastModifiedDateTime: "2026-07-02T10:00:00Z",
        lastModifiedByDisplayName: "Megan Bowen",
        size: 300,
      },
      {
        id: "2.0",
        lastModifiedDateTime: "2026-07-01T10:00:00Z",
        lastModifiedByDisplayName: "Adele Vance",
        size: 200,
      },
    ]);
    getCurrentItemVersionMock.mockResolvedValue({
      id: "3.0",
      lastModifiedDateTime: "2026-07-02T10:00:00Z",
      lastModifiedByDisplayName: "Megan Bowen",
      size: 300,
    });
    getItemVersionDownloadMock.mockResolvedValue(
      "https://contoso.example/download/version-2",
    );
    restoreItemVersionMock.mockResolvedValue(undefined);
    deleteItemVersionMock.mockResolvedValue(undefined);
    deleteItemHistoryVersionsMock.mockResolvedValue(undefined);
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

  it("should load versions list and current version when opening the versions dialog", async () => {
    render(
      <Files
        container={{ id: "container-1" } as never}
        onOpenContainerPermissions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Versions" }));

    await waitFor(() => {
      expect(listItemVersionsMock).toHaveBeenCalledWith("container-1", "file-1");
      expect(getCurrentItemVersionMock).toHaveBeenCalledWith(
        "container-1",
        "file-1",
      );
      expect(screen.getByText("Current Version: 3.0")).toBeInTheDocument();
      expect(screen.getByText("Entries: 3.0,2.0")).toBeInTheDocument();
    });
  });

  it("should request version download and trigger the hidden anchor", async () => {
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(
      <Files
        container={{ id: "container-1" } as never}
        onOpenContainerPermissions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Versions" }));

    await screen.findByText("Versions Dialog");
    fireEvent.click(screen.getByRole("button", { name: "Dialog Download" }));

    await waitFor(() => {
      expect(getItemVersionDownloadMock).toHaveBeenCalledWith(
        "container-1",
        "file-1",
        "3.0",
      );
      expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    });

    anchorClickSpy.mockRestore();
  });

  it("should refresh list and current version after restore succeeds", async () => {
    render(
      <Files
        container={{ id: "container-1" } as never}
        onOpenContainerPermissions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Versions" }));
    await screen.findByText("Versions Dialog");

    fireEvent.click(screen.getByRole("button", { name: "Dialog Restore" }));

    await waitFor(() => {
      expect(restoreItemVersionMock).toHaveBeenCalledWith(
        "container-1",
        "file-1",
        "2.0",
      );
      expect(listItemVersionsMock).toHaveBeenCalledTimes(2);
      expect(getCurrentItemVersionMock).toHaveBeenCalledTimes(2);
    });
  });

  it("should refresh list and current version after deleting history versions", async () => {
    render(
      <Files
        container={{ id: "container-1" } as never}
        onOpenContainerPermissions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Versions" }));
    await screen.findByText("Versions Dialog");

    fireEvent.click(
      screen.getByRole("button", { name: "Dialog Delete History" }),
    );

    await waitFor(() => {
      expect(deleteItemHistoryVersionsMock).toHaveBeenCalledWith(
        "container-1",
        "file-1",
      );
      expect(listItemVersionsMock).toHaveBeenCalledTimes(2);
      expect(getCurrentItemVersionMock).toHaveBeenCalledTimes(2);
    });
  });

  it("should refresh list and current version after deleting a single version", async () => {
    render(
      <Files
        container={{ id: "container-1" } as never}
        onOpenContainerPermissions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Versions" }));
    await screen.findByText("Versions Dialog");

    fireEvent.click(screen.getByRole("button", { name: "Dialog Delete" }));

    await waitFor(() => {
      expect(deleteItemVersionMock).toHaveBeenCalledWith(
        "container-1",
        "file-1",
        "2.0",
      );
      expect(listItemVersionsMock).toHaveBeenCalledTimes(2);
      expect(getCurrentItemVersionMock).toHaveBeenCalledTimes(2);
    });
  });
});
