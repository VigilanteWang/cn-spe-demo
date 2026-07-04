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
  it("should call onClose when clicking the close button", () => {
    const onClose = vi.fn();

    render(
      <VersionHistoryDialog
        open
        versions={versions}
        currentVersionId="3.0"
        isLoading={false}
        isActionPending={false}
        pendingAction={null}
        error={null}
        onClose={onClose}
        onDownload={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
        onDeleteHistoryVersions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close versions" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should disable restore and delete for the current version", () => {
    render(
      <VersionHistoryDialog
        open
        versions={versions}
        currentVersionId="3.0"
        isLoading={false}
        isActionPending={false}
        pendingAction={null}
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
        pendingAction={null}
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
        pendingAction={null}
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

  it("should ask for confirmation before restoring a version", () => {
    const onRestore = vi.fn();

    render(
      <VersionHistoryDialog
        open
        versions={versions}
        currentVersionId="3.0"
        isLoading={false}
        isActionPending={false}
        pendingAction={null}
        error={null}
        onClose={vi.fn()}
        onDownload={vi.fn()}
        onRestore={onRestore}
        onDelete={vi.fn()}
        onDeleteHistoryVersions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Restore" })[1]);

    expect(
      screen.getByText(
        "Are you sure you want to restore this version? This will create a copy of it and make it the latest version.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Yes" }));

    expect(onRestore).toHaveBeenCalledWith(versions[1]);
  });

  it("should ask for confirmation before deleting a version", () => {
    const onDelete = vi.fn();

    render(
      <VersionHistoryDialog
        open
        versions={versions}
        currentVersionId="3.0"
        isLoading={false}
        isActionPending={false}
        pendingAction={null}
        error={null}
        onClose={vi.fn()}
        onDownload={vi.fn()}
        onRestore={vi.fn()}
        onDelete={onDelete}
        onDeleteHistoryVersions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[1]);

    expect(
      screen.getByText("Are you sure you want to delete this version?"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Yes" }));

    expect(onDelete).toHaveBeenCalledWith(versions[1]);
  });

  it("should show loading state inside the active restore popover", () => {
    const { rerender } = render(
      <VersionHistoryDialog
        open
        versions={versions}
        currentVersionId="3.0"
        isLoading={false}
        isActionPending={false}
        pendingAction={null}
        error={null}
        onClose={vi.fn()}
        onDownload={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
        onDeleteHistoryVersions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Restore" })[1]);

    rerender(
      <VersionHistoryDialog
        open
        versions={versions}
        currentVersionId="3.0"
        isLoading={false}
        isActionPending
        pendingAction="restoreVersion"
        error={null}
        onClose={vi.fn()}
        onDownload={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
        onDeleteHistoryVersions={vi.fn()}
      />,
    );

    expect(screen.getByText("Restoring")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "No" })).toBeDisabled();
  });
});
