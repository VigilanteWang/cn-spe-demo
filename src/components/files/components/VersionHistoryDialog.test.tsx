// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../../common/appError";
import { VersionHistoryDialog } from "./VersionHistoryDialog";

const versions = [
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

describe("VersionHistoryDialog", () => {
  it("should disable restore and delete for the current version", () => {
    render(
      <VersionHistoryDialog
        open
        versions={versions}
        currentVersionId="3.0"
        isLoading={false}
        isActionPending={false}
        error={null}
        onClose={vi.fn()}
        onDownload={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
        onDeleteHistoryVersions={vi.fn()}
      />,
    );

    const restoreButtons = screen.getAllByRole("button", { name: "Restore" });
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });

    expect(restoreButtons[0]).toBeDisabled();
    expect(deleteButtons[0]).toBeDisabled();
    expect(restoreButtons[1]).not.toBeDisabled();
    expect(deleteButtons[1]).not.toBeDisabled();
  });

  it("should render dialog errors inside the dialog", () => {
    render(
      <VersionHistoryDialog
        open
        versions={[]}
        currentVersionId={null}
        isLoading={false}
        isActionPending={false}
        error={
          new AppError({
            name: "FilesVersionLoadError",
            code: "loadVersionsFailed",
            message: "Failed to load versions.",
          })
        }
        onClose={vi.fn()}
        onDownload={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
        onDeleteHistoryVersions={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Failed to load versions.",
    );
  });

  it("should show Yes and No in delete history confirmation", async () => {
    const onDeleteHistoryVersions = vi.fn();

    render(
      <VersionHistoryDialog
        open
        versions={versions}
        currentVersionId="3.0"
        isLoading={false}
        isActionPending={false}
        error={null}
        onClose={vi.fn()}
        onDownload={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
        onDeleteHistoryVersions={onDeleteHistoryVersions}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Delete history versions" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Yes" }));

    expect(onDeleteHistoryVersions).toHaveBeenCalledTimes(1);
  });
});
