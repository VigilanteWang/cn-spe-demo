// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../../../common/appError";
import { useFilesPreviewActions } from "./useFilesPreviewActions";

const { deleteItemsMock } = vi.hoisted(() => ({
  deleteItemsMock: vi.fn(),
}));

vi.mock("../../../services/containerAndFileApi", () => ({
  deleteItems: deleteItemsMock,
}));

describe("useFilesPreviewActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reload and call onDeleteSuccess when preview delete succeeds", async () => {
    const loadItems = vi.fn().mockResolvedValue(true);
    const onDeleteSuccess = vi.fn();
    deleteItemsMock.mockResolvedValue({ successful: [{ id: "file-1" }], failed: [] });

    const { result } = renderHook(() =>
      useFilesPreviewActions({
        containerId: "container-1",
        currentPreviewFile: { id: "file-1", isFolder: false } as never,
        folderId: "root",
        loadItems,
        onDeleteSuccess,
      }),
    );

    let didDelete = false;
    await act(async () => {
      didDelete = await result.current.deletePreviewItem();
    });

    expect(didDelete).toBe(true);
    expect(loadItems).toHaveBeenCalledWith("root");
    expect(onDeleteSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.previewActionError).toBeNull();
  });

  it("should keep the error when preview delete fails", async () => {
    deleteItemsMock.mockRejectedValue(
      new AppError({
        name: "AppError",
        code: "previewDeleteFailed",
        message: "Failed to delete the current file.",
      }),
    );

    const { result } = renderHook(() =>
      useFilesPreviewActions({
        containerId: "container-1",
        currentPreviewFile: { id: "file-1", isFolder: false } as never,
        folderId: "root",
        loadItems: vi.fn().mockResolvedValue(true),
        onDeleteSuccess: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.deletePreviewItem();
    });

    expect(result.current.previewActionError?.message).toBe(
      "Failed to delete the current file.",
    );
  });

  it("should clear preview errors when clearPreviewActionError is called", async () => {
    deleteItemsMock.mockRejectedValue(new Error("Delete failed."));

    const { result } = renderHook(() =>
      useFilesPreviewActions({
        containerId: "container-1",
        currentPreviewFile: { id: "file-1", isFolder: false } as never,
        folderId: "root",
        loadItems: vi.fn().mockResolvedValue(true),
        onDeleteSuccess: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.deletePreviewItem();
    });

    act(() => {
      result.current.clearPreviewActionError();
    });

    expect(result.current.previewActionError).toBeNull();
  });
});
