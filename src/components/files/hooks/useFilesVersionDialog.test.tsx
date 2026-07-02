// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFilesVersionDialog } from "./useFilesVersionDialog";

const {
  listItemVersionsMock,
  getCurrentItemVersionMock,
  getItemVersionDownloadMock,
  restoreItemVersionMock,
  deleteItemVersionMock,
  deleteItemHistoryVersionsMock,
} = vi.hoisted(() => ({
  listItemVersionsMock: vi.fn(),
  getCurrentItemVersionMock: vi.fn(),
  getItemVersionDownloadMock: vi.fn(),
  restoreItemVersionMock: vi.fn(),
  deleteItemVersionMock: vi.fn(),
  deleteItemHistoryVersionsMock: vi.fn(),
}));

vi.mock("../../../services/itemVersionApi", () => ({
  listItemVersions: listItemVersionsMock,
  getCurrentItemVersion: getCurrentItemVersionMock,
  getItemVersionDownload: getItemVersionDownloadMock,
  restoreItemVersion: restoreItemVersionMock,
  deleteItemVersion: deleteItemVersionMock,
  deleteItemHistoryVersions: deleteItemHistoryVersionsMock,
}));

const createDeferred = () => {
  let resolve!: () => void;

  const promise = new Promise<void>((res) => {
    resolve = res;
  });

  return { promise, resolve };
};

describe("useFilesVersionDialog", () => {
  const versionEntries = [
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
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    listItemVersionsMock.mockResolvedValue(versionEntries);
    getCurrentItemVersionMock.mockResolvedValue(versionEntries[0]);
    getItemVersionDownloadMock.mockResolvedValue(
      "https://contoso.example/download/version-2",
    );
    restoreItemVersionMock.mockResolvedValue(undefined);
    deleteItemVersionMock.mockResolvedValue(undefined);
    deleteItemHistoryVersionsMock.mockResolvedValue(undefined);
  });

  it("should load versions and current version when opening the dialog", async () => {
    const { result } = renderHook(() =>
      useFilesVersionDialog({
        containerId: "container-1",
        onDirectDownload: vi.fn(),
      }),
    );

    act(() => {
      result.current.openVersionDialog({
        id: "file-1",
        name: "a.docx",
      } as never);
    });

    await waitFor(() => {
      expect(result.current.versionDialogOpen).toBe(true);
      expect(result.current.currentVersionId).toBe("3.0");
      expect(result.current.versionDialogEntries).toEqual(versionEntries);
    });
  });

  it("should request download url and forward it to the page download callback", async () => {
    const onDirectDownload = vi.fn();
    const { result } = renderHook(() =>
      useFilesVersionDialog({
        containerId: "container-1",
        onDirectDownload,
      }),
    );

    act(() => {
      result.current.openVersionDialog({
        id: "file-1",
        name: "a.docx",
      } as never);
    });

    await waitFor(() => {
      expect(result.current.currentVersionId).toBe("3.0");
    });

    await act(async () => {
      await result.current.downloadVersion(versionEntries[1]);
    });

    expect(getItemVersionDownloadMock).toHaveBeenCalledWith(
      "container-1",
      "file-1",
      "2.0",
    );
    expect(onDirectDownload).toHaveBeenCalledWith(
      "https://contoso.example/download/version-2",
    );
  });

  it("should reload versions after restore succeeds", async () => {
    const restoreDeferred = createDeferred();
    restoreItemVersionMock.mockReturnValueOnce(restoreDeferred.promise);
    const { result } = renderHook(() =>
      useFilesVersionDialog({
        containerId: "container-1",
        onDirectDownload: vi.fn(),
      }),
    );

    act(() => {
      result.current.openVersionDialog({
        id: "file-1",
        name: "a.docx",
      } as never);
    });

    await waitFor(() => {
      expect(result.current.currentVersionId).toBe("3.0");
    });

    act(() => {
      void result.current.restoreVersion(versionEntries[1]);
    });

    await waitFor(() => {
      expect(result.current.versionDialogPendingAction).toBe("restoreVersion");
    });

    await act(async () => {
      restoreDeferred.resolve();
    });

    await waitFor(() => {
      expect(result.current.versionDialogPendingAction).toBeNull();
    });

    expect(restoreItemVersionMock).toHaveBeenCalledWith(
      "container-1",
      "file-1",
      "2.0",
    );
    expect(listItemVersionsMock).toHaveBeenCalledTimes(2);
    expect(getCurrentItemVersionMock).toHaveBeenCalledTimes(2);
  });

  it("should reload versions after deleting a single version", async () => {
    const deleteDeferred = createDeferred();
    deleteItemVersionMock.mockReturnValueOnce(deleteDeferred.promise);
    const { result } = renderHook(() =>
      useFilesVersionDialog({
        containerId: "container-1",
        onDirectDownload: vi.fn(),
      }),
    );

    act(() => {
      result.current.openVersionDialog({
        id: "file-1",
        name: "a.docx",
      } as never);
    });

    await waitFor(() => {
      expect(result.current.currentVersionId).toBe("3.0");
    });

    act(() => {
      void result.current.deleteVersion(versionEntries[1]);
    });

    await waitFor(() => {
      expect(result.current.versionDialogPendingAction).toBe("deleteVersion");
    });

    await act(async () => {
      deleteDeferred.resolve();
    });

    await waitFor(() => {
      expect(result.current.versionDialogPendingAction).toBeNull();
    });

    expect(deleteItemVersionMock).toHaveBeenCalledWith(
      "container-1",
      "file-1",
      "2.0",
    );
    expect(listItemVersionsMock).toHaveBeenCalledTimes(2);
  });

  it("should reload versions after deleting history versions", async () => {
    const deleteHistoryDeferred = createDeferred();
    deleteItemHistoryVersionsMock.mockReturnValueOnce(
      deleteHistoryDeferred.promise,
    );
    const { result } = renderHook(() =>
      useFilesVersionDialog({
        containerId: "container-1",
        onDirectDownload: vi.fn(),
      }),
    );

    act(() => {
      result.current.openVersionDialog({
        id: "file-1",
        name: "a.docx",
      } as never);
    });

    await waitFor(() => {
      expect(result.current.currentVersionId).toBe("3.0");
    });

    act(() => {
      void result.current.deleteHistoryVersions();
    });

    await waitFor(() => {
      expect(result.current.versionDialogPendingAction).toBe(
        "deleteHistoryVersions",
      );
    });

    await act(async () => {
      deleteHistoryDeferred.resolve();
    });

    await waitFor(() => {
      expect(result.current.versionDialogPendingAction).toBeNull();
    });

    expect(deleteItemHistoryVersionsMock).toHaveBeenCalledWith(
      "container-1",
      "file-1",
    );
    expect(listItemVersionsMock).toHaveBeenCalledTimes(2);
  });

  it("should clear pending action after a failed restore", async () => {
    restoreItemVersionMock.mockRejectedValueOnce(new Error("restore failed"));

    const { result } = renderHook(() =>
      useFilesVersionDialog({
        containerId: "container-1",
        onDirectDownload: vi.fn(),
      }),
    );

    act(() => {
      result.current.openVersionDialog({
        id: "file-1",
        name: "a.docx",
      } as never);
    });

    await waitFor(() => {
      expect(result.current.currentVersionId).toBe("3.0");
    });

    await act(async () => {
      await result.current.restoreVersion(versionEntries[1]);
    });

    expect(result.current.versionDialogPendingAction).toBeNull();
    expect(result.current.versionDialogError).not.toBeNull();
  });
});
