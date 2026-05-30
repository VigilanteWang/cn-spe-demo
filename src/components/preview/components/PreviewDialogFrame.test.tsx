// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FrontendApiError } from "../../../common/errors.ts";
import { PreviewDialogFrame } from "./PreviewDialogFrame";

const renderFrame = (
  overrides: Partial<ComponentProps<typeof PreviewDialogFrame>> = {},
) => {
  const onDismiss = vi.fn();
  const onDownload = vi.fn();
  const onOpenInNewTab = vi.fn();
  const onDelete = vi.fn();
  const goToPrevious = vi.fn();
  const goToNext = vi.fn();

  const renderResult = render(
    <PreviewDialogFrame
      open
      fileName="Quarterly Report.pdf"
      previewState={{
        previewUrl: "",
        isLoading: false,
        error: null,
      }}
      navigationState={{
        hasPrevious: true,
        hasNext: true,
        goToPrevious,
        goToNext,
      }}
      isDownloadDisabled={false}
      isOpenInNewTabDisabled={false}
      onDismiss={onDismiss}
      onDownload={onDownload}
      onOpenInNewTab={onOpenInNewTab}
      onDelete={onDelete}
      {...overrides}
    />,
  );

  return {
    onDismiss,
    onDownload,
    onOpenInNewTab,
    onDelete,
    goToPrevious,
    goToNext,
    ...renderResult,
  };
};

describe("PreviewDialogFrame", () => {
  it("should render loading feedback", () => {
    renderFrame({
      previewState: {
        previewUrl: "",
        isLoading: true,
        error: null,
      },
    });

    expect(screen.getByText("Loading preview...")).toBeInTheDocument();
  });

  it("should render error feedback", () => {
    renderFrame({
      previewState: {
        previewUrl: "",
        isLoading: false,
        error: new FrontendApiError(
          "previewLoadFailed",
          "Failed to load preview.",
        ),
      },
    });

    expect(screen.getByText("Failed to load preview.")).toBeInTheDocument();
  });

  it("should render the preview iframe when a preview URL exists", () => {
    renderFrame({
      previewState: {
        previewUrl: "https://preview.contoso.com/report",
        isLoading: false,
        error: null,
      },
    });

    expect(
      screen.getByTitle("Preview of Quarterly Report.pdf"),
    ).toHaveAttribute("src", "https://preview.contoso.com/report");
  });

  it("should render empty feedback when no preview is available", () => {
    renderFrame();

    expect(screen.getByText("No preview available")).toBeInTheDocument();
  });

  it("should disable footer actions according to the provided state", () => {
    renderFrame({
      navigationState: {
        hasPrevious: false,
        hasNext: false,
        goToPrevious: vi.fn(),
        goToNext: vi.fn(),
      },
      isDownloadDisabled: true,
      isOpenInNewTabDisabled: true,
    });

    expect(
      screen.getByRole("button", { name: "Previous file" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next file" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Download file" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Open in new tab" }),
    ).toBeDisabled();
  });

  it("should call the provided handlers from the header and footer", () => {
    const {
      onDismiss,
      onDownload,
      onOpenInNewTab,
      onDelete,
      goToPrevious,
      goToNext,
    } = renderFrame();

    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous file" }));
    fireEvent.click(screen.getByRole("button", { name: "Next file" }));
    fireEvent.click(screen.getByRole("button", { name: "Download file" }));
    fireEvent.click(screen.getByRole("button", { name: "Open in new tab" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete file" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(goToPrevious).toHaveBeenCalledTimes(1);
    expect(goToNext).toHaveBeenCalledTimes(1);
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onOpenInNewTab).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
