// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IDriveItemExtended } from "../../../common/types";
import { usePreviewNavigation } from "./usePreviewNavigation";

const createFile = (
  id: string,
  name: string,
): IDriveItemExtended =>
  ({
    id,
    name,
    isFolder: false,
    modifiedByName: "Adele Vance",
    iconElement: <div>icon</div>,
  }) as IDriveItemExtended;

describe("usePreviewNavigation", () => {
  it("should disable previous navigation for the first file", () => {
    const onNavigate = vi.fn();
    const files = [createFile("file-1", "A"), createFile("file-2", "B")];

    const { result } = renderHook(() =>
      usePreviewNavigation({
        allFiles: files,
        currentFile: files[0],
        onNavigate,
      }),
    );

    expect(result.current.currentIndex).toBe(0);
    expect(result.current.hasPrevious).toBe(false);
    expect(result.current.hasNext).toBe(true);
  });

  it("should navigate to the adjacent files when next or previous is available", () => {
    const onNavigate = vi.fn();
    const files = [
      createFile("file-1", "A"),
      createFile("file-2", "B"),
      createFile("file-3", "C"),
    ];

    const { result } = renderHook(() =>
      usePreviewNavigation({
        allFiles: files,
        currentFile: files[1],
        onNavigate,
      }),
    );

    act(() => {
      result.current.goToPrevious();
      result.current.goToNext();
    });

    expect(onNavigate).toHaveBeenNthCalledWith(1, files[0]);
    expect(onNavigate).toHaveBeenNthCalledWith(2, files[2]);
  });

  it("should disable next navigation for the last file", () => {
    const onNavigate = vi.fn();
    const files = [createFile("file-1", "A"), createFile("file-2", "B")];

    const { result } = renderHook(() =>
      usePreviewNavigation({
        allFiles: files,
        currentFile: files[1],
        onNavigate,
      }),
    );

    expect(result.current.hasPrevious).toBe(true);
    expect(result.current.hasNext).toBe(false);
  });
});
