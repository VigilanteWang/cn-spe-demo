// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFilesArchiveDownload } from "./useFilesArchiveDownload";

const {
  startDownloadMock,
  selectDownloadSaveTargetMock,
  getDownloadProgressMock,
  getDownloadManifestMock,
} = vi.hoisted(() => ({
  startDownloadMock: vi.fn(),
  selectDownloadSaveTargetMock: vi.fn(),
  getDownloadProgressMock: vi.fn(),
  getDownloadManifestMock: vi.fn(),
}));

vi.mock("../../../services/downloadApi", () => ({
  DownloadSaveTargetSelectionCancelledError: class extends Error {},
  startDownload: startDownloadMock,
  selectDownloadSaveTarget: selectDownloadSaveTargetMock,
  getDownloadProgress: getDownloadProgressMock,
  getDownloadManifest: getDownloadManifestMock,
}));

vi.mock("../../../services/archiveDownloader", () => ({
  downloadArchiveFromManifest: vi.fn(),
}));

describe("useFilesArchiveDownload", () => {
  it("should format structured archive api errors instead of reading raw message directly", async () => {
    selectDownloadSaveTargetMock.mockResolvedValue({
      filename: "archive.zip",
      writable: null,
    });
    startDownloadMock.mockRejectedValue(
      Object.assign(new Error("Archive request was throttled."), {
        code: "throttled",
        retryAfterSeconds: 6,
        requestId: "req-archive-429",
      }),
    );

    const { result } = renderHook(() =>
      useFilesArchiveDownload({
        containerId: "container-a",
        driveItems: [
          {
            id: "folder-a",
            name: "Folder A",
            isFolder: true,
          },
        ] as never,
        selectedRows: new Set(["folder-a"]),
        onDirectDownload: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.onToolbarDownloadClick();
    });

    expect(result.current.downloadProgress.phase).toBe("failed");
    expect(result.current.downloadProgress.errorMessage).toBe(
      "Archive request was throttled. Retry after 6 seconds.",
    );
    expect(getDownloadProgressMock).not.toHaveBeenCalled();
    expect(getDownloadManifestMock).not.toHaveBeenCalled();
  });
});
