// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilesDataGrid } from "./FilesDataGrid";
import { IDriveItemExtended } from "../../../common/types";

if (typeof globalThis.NodeFilter === "undefined") {
  globalThis.NodeFilter = {
    SHOW_ELEMENT: 1,
  } as typeof NodeFilter;
}

const createItem = (overrides: Partial<IDriveItemExtended>): IDriveItemExtended =>
  ({
    id: "1",
    name: "file.txt",
    isFolder: false,
    modifiedByName: "Tester",
    iconElement: <span>icon</span>,
    lastModifiedDateTime: "2026-04-28",
    ...overrides,
  }) as IDriveItemExtended;

describe("FilesDataGrid", () => {
  it("should call preview callback when clicking a file", () => {
    const onPreviewFile = vi.fn();

    render(
      <FilesDataGrid
        driveItems={[createItem({ id: "file-1", name: "file.txt" })]}
        selectedRows={new Set()}
        onSelectionChange={vi.fn()}
        onOpenFolder={vi.fn().mockResolvedValue(undefined)}
        onPreviewFile={onPreviewFile}
        actionsButtonGroupClassName="actions"
      />,
    );

    fireEvent.click(screen.getByText("file.txt"));
    expect(onPreviewFile).toHaveBeenCalledTimes(1);
  });

  it("should call folder navigation callback when clicking a folder", () => {
    const onOpenFolder = vi.fn().mockResolvedValue(undefined);

    render(
      <FilesDataGrid
        driveItems={[createItem({ id: "folder-1", name: "Folder A", isFolder: true })]}
        selectedRows={new Set()}
        onSelectionChange={vi.fn()}
        onOpenFolder={onOpenFolder}
        onPreviewFile={vi.fn()}
        actionsButtonGroupClassName="actions"
      />,
    );

    fireEvent.click(screen.getByText("Folder A"));
    expect(onOpenFolder).toHaveBeenCalledWith("folder-1", "Folder A");
  });
});
