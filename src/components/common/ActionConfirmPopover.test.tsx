// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@fluentui/react-components";
import { ActionConfirmPopover } from "./ActionConfirmPopover";

const ActionConfirmPopoverTestHost = ({
  isPending = false,
  onConfirm = vi.fn(),
}: {
  isPending?: boolean;
  onConfirm?: () => void;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <ActionConfirmPopover
      trigger={<Button>Delete version</Button>}
      open={open}
      onOpenChange={setOpen}
      message="Are you sure you want to delete this version?"
      loadingLabel="Deleting"
      isPending={isPending}
      onConfirm={onConfirm}
    />
  );
};

describe("ActionConfirmPopover", () => {
  it("should show confirmation message and buttons after opening", () => {
    render(<ActionConfirmPopoverTestHost />);

    fireEvent.click(screen.getByRole("button", { name: "Delete version" }));

    expect(
      screen.getByText("Are you sure you want to delete this version?"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No" })).toBeInTheDocument();
  });

  it("should switch to loading view when pending", () => {
    const { rerender } = render(<ActionConfirmPopoverTestHost />);

    fireEvent.click(screen.getByRole("button", { name: "Delete version" }));

    rerender(<ActionConfirmPopoverTestHost isPending />);

    expect(screen.getByText("Deleting")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "No" })).toBeDisabled();
  });

  it("should call onConfirm when clicking Yes", () => {
    const onConfirm = vi.fn();

    render(<ActionConfirmPopoverTestHost onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete version" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
