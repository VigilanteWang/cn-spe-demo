// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilesDataGrid } from "./FilesDataGrid";
import { IDriveItemExtended } from "../../../common/types";

const createItem = (
  overrides: Partial<IDriveItemExtended>,
): IDriveItemExtended =>
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
        onManagePermissions={vi.fn()}
        actionsButtonGroupClassName="actions"
        nameCellContentClassName="name-cell"
      />,
    );

    fireEvent.click(screen.getByText("file.txt"));
    expect(onPreviewFile).toHaveBeenCalledTimes(1);
  });

  it("should call folder navigation callback when clicking a folder", () => {
    const onOpenFolder = vi.fn().mockResolvedValue(undefined);

    render(
      <FilesDataGrid
        driveItems={[
          createItem({ id: "folder-1", name: "Folder A", isFolder: true }),
        ]}
        selectedRows={new Set()}
        onSelectionChange={vi.fn()}
        onOpenFolder={onOpenFolder}
        onPreviewFile={vi.fn()}
        onManagePermissions={vi.fn()}
        actionsButtonGroupClassName="actions"
        nameCellContentClassName="name-cell"
      />,
    );

    fireEvent.click(screen.getByText("Folder A"));
    expect(onOpenFolder).toHaveBeenCalledWith("folder-1", "Folder A");
  });

  it("should render formatted relative time for recent timestamps", () => {
    render(
      <FilesDataGrid
        driveItems={[
          createItem({
            id: "file-2",
            name: "Recent file.txt",
            lastModifiedDateTime: new Date(
              Date.now() - 60 * 60 * 1000,
            ).toISOString(),
          }),
        ]}
        selectedRows={new Set()}
        onSelectionChange={vi.fn()}
        onOpenFolder={vi.fn().mockResolvedValue(undefined)}
        onPreviewFile={vi.fn()}
        onManagePermissions={vi.fn()}
        actionsButtonGroupClassName="actions"
        nameCellContentClassName="name-cell"
      />,
    );

    expect(screen.getByText("1 hour ago")).toBeTruthy();
  });

  it("should call manage permissions callback when clicking the permissions action", () => {
    const onManagePermissions = vi.fn();
    const targetItem = createItem({ id: "file-3", name: "report.docx" });

    render(
      <FilesDataGrid
        driveItems={[targetItem]}
        selectedRows={new Set()}
        onSelectionChange={vi.fn()}
        onOpenFolder={vi.fn().mockResolvedValue(undefined)}
        onPreviewFile={vi.fn()}
        onManagePermissions={onManagePermissions}
        actionsButtonGroupClassName="actions"
        nameCellContentClassName="name-cell"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Permissions" }));
    expect(onManagePermissions).toHaveBeenCalledWith(targetItem);
  });
});
