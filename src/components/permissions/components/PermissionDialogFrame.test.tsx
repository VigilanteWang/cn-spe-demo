// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PermissionDialogFrame,
  type IPermissionDialogFrameProps,
} from "./PermissionDialogFrame";

const renderFrame = (
  overrides: Partial<IPermissionDialogFrameProps> = {},
) => {
  const onRequestClose = vi.fn();
  const onSelectedTabChange = vi.fn();
  const onApply = vi.fn();

  const renderResult = render(
    <PermissionDialogFrame
      open
      title="Manage Permission"
      headerContent={<div>Header</div>}
      permissionErrorMessages={[]}
      selectedTab="people"
      interactionDisabled={false}
      isApplyingPermissions={false}
      applyFeedbackStatus={null}
      isApplyDisabled={false}
      bodyContent={<div>Body Content</div>}
      onRequestClose={onRequestClose}
      onSelectedTabChange={onSelectedTabChange}
      onApply={onApply}
      {...overrides}
    />,
  );

  return {
    onRequestClose,
    onSelectedTabChange,
    onApply,
    ...renderResult,
  };
};

describe("PermissionDialogFrame", () => {
  it("should switch tabs through the shared tab list", () => {
    const { onSelectedTabChange } = renderFrame();

    fireEvent.click(screen.getByRole("tab", { name: "Groups" }));

    expect(onSelectedTabChange).toHaveBeenCalledWith("groups");
  });

  it("should render custom body content from the caller", () => {
    renderFrame({
      bodyContent: <div>Custom Permission Body</div>,
    });

    expect(screen.getByText("Custom Permission Body")).toBeInTheDocument();
  });

  it("should render success feedback and disabled footer state", () => {
    renderFrame({
      applyFeedbackStatus: "success",
      isApplyDisabled: true,
      isCloseDisabled: true,
    });

    expect(screen.getByText("Successful!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  });

  it("should render saving feedback while applying", () => {
    renderFrame({
      isApplyingPermissions: true,
      isApplyDisabled: false,
    });

    expect(screen.getByText("Saving...")).toBeInTheDocument();
  });

  it("should call close and apply handlers from the shared footer", () => {
    const { onRequestClose, onApply } = renderFrame();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});
