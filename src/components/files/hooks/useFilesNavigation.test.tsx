// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFilesNavigation } from "./useFilesNavigation";

describe("useFilesNavigation", () => {
  it("should initialize at root", async () => {
    const loadItems = vi.fn().mockResolvedValue(undefined);
    const clearSelection = vi.fn();

    const { result } = renderHook(() =>
      useFilesNavigation({
        loadItems,
        clearSelection,
      }),
    );

    await waitFor(() => {
      expect(loadItems).toHaveBeenCalledWith("root");
    });

    expect(result.current.folderId).toBe("root");
    expect(result.current.breadcrumbPath).toEqual([{ id: "root", name: "Root" }]);
  });

  it("should append breadcrumb when navigating into child folder", async () => {
    const loadItems = vi.fn().mockResolvedValue(undefined);
    const clearSelection = vi.fn();

    const { result } = renderHook(() =>
      useFilesNavigation({
        loadItems,
        clearSelection,
      }),
    );

    await act(async () => {
      await result.current.navigateToFolder("folder-a", "Folder A");
    });

    expect(result.current.folderId).toBe("folder-a");
    expect(result.current.breadcrumbPath).toEqual([
      { id: "root", name: "Root" },
      { id: "folder-a", name: "Folder A" },
    ]);
  });

  it("should truncate breadcrumb when navigating back through breadcrumb", async () => {
    const loadItems = vi.fn().mockResolvedValue(undefined);
    const clearSelection = vi.fn();

    const { result } = renderHook(() =>
      useFilesNavigation({
        loadItems,
        clearSelection,
      }),
    );

    await act(async () => {
      await result.current.navigateToFolder("folder-a", "Folder A");
      await result.current.navigateToFolder("folder-b", "Folder B");
      await result.current.onBreadcrumbClick("folder-a", "Folder A");
    });

    expect(result.current.folderId).toBe("folder-a");
    expect(result.current.breadcrumbPath).toEqual([
      { id: "root", name: "Root" },
      { id: "folder-a", name: "Folder A" },
    ]);
  });
});
