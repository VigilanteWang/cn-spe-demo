// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../../../common/appError";
import { useFilesDeleteAction } from "./useFilesDeleteAction";

const { deleteItemsMock } = vi.hoisted(() => ({
  deleteItemsMock: vi.fn(),
}));

vi.mock("../../../services/containerAndFileApi", () => ({
  deleteItems: deleteItemsMock,
}));

describe("useFilesDeleteAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should clear selection and reload current folder when delete succeeds", async () => {
    const loadItems = vi.fn().mockResolvedValue(true);
    const updateSelectedRows = vi.fn();
    deleteItemsMock.mockResolvedValue({ successful: [{ id: "file-1" }], failed: [] });

    const { result } = renderHook(() =>
      useFilesDeleteAction({
        containerId: "container-1",
        selectedRows: new Set(["file-1"]),
        folderId: "root",
        loadItems,
        updateSelectedRows,
      }),
    );

    let didDelete = false;
    await act(async () => {
      didDelete = await result.current.deleteSelectedItems();
    });

    expect(didDelete).toBe(true);
    expect(loadItems).toHaveBeenCalledWith("root");
    expect(updateSelectedRows).toHaveBeenCalledWith(new Set());
    expect(result.current.deleteDialogError).toBeNull();
  });

  it("should keep only failed items selected when partial delete happens", async () => {
    const loadItems = vi.fn().mockResolvedValue(true);
    const updateSelectedRows = vi.fn();
    deleteItemsMock.mockResolvedValue({
      successful: [],
      failed: [{ id: "file-1", reason: "Folder is locked." }],
    });

    const { result } = renderHook(() =>
      useFilesDeleteAction({
        containerId: "container-1",
        selectedRows: new Set(["file-1"]),
        folderId: "root",
        loadItems,
        updateSelectedRows,
      }),
    );

    let didDelete = true;
    await act(async () => {
      didDelete = await result.current.deleteSelectedItems();
    });

    expect(didDelete).toBe(false);
    expect(updateSelectedRows).toHaveBeenCalledWith(new Set(["file-1"]));
    expect(result.current.deleteDialogError?.name).toBe("FilesDeleteError");
  });

  it("should expose a standardized error when delete throws", async () => {
    deleteItemsMock.mockRejectedValue(
      new AppError({
        name: "AppError",
        code: "deleteItemsFailed",
        message: "Failed to delete selected items.",
      }),
    );

    const { result } = renderHook(() =>
      useFilesDeleteAction({
        containerId: "container-1",
        selectedRows: new Set(["file-1"]),
        folderId: "root",
        loadItems: vi.fn().mockResolvedValue(true),
        updateSelectedRows: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.deleteSelectedItems();
    });

    expect(result.current.deleteDialogError?.message).toBe(
      "Failed to delete selected items.",
    );
  });

  it("should clear dialog errors when resetDeleteError is called", async () => {
    deleteItemsMock.mockRejectedValue(new Error("Delete failed."));

    const { result } = renderHook(() =>
      useFilesDeleteAction({
        containerId: "container-1",
        selectedRows: new Set(["file-1"]),
        folderId: "root",
        loadItems: vi.fn().mockResolvedValue(true),
        updateSelectedRows: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.deleteSelectedItems();
    });

    act(() => {
      result.current.resetDeleteError();
    });

    expect(result.current.deleteDialogError).toBeNull();
  });
});
