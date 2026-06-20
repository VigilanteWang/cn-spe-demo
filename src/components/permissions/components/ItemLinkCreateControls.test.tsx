// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItemLinkCreateControls } from "./ItemLinkCreateControls";

describe("ItemLinkCreateControls", () => {
  it("should reflect disabled state for stable controls and disable add when canAddLink is false", () => {
    render(
      <ItemLinkCreateControls
        createScope="anonymous"
        createType="review"
        interactionDisabled={false}
        scopeOptionDisabledState={{
          anonymous: false,
          organization: true,
          users: false,
        }}
        typeOptionDisabledState={{
          view: false,
          edit: false,
          review: true,
          blocksDownload: false,
        }}
        canAddLink={false}
        onCreateScopeChange={vi.fn()}
        onCreateTypeChange={vi.fn()}
        onAddLink={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Link scope" })).toBeEnabled();
    expect(screen.getByRole("option", { name: "Review" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add link" })).toBeDisabled();
  });

  it("should call the stable change handlers and add handler", () => {
    const onCreateTypeChange = vi.fn();
    const onAddLink = vi.fn();

    render(
      <ItemLinkCreateControls
        createScope="anonymous"
        createType="view"
        interactionDisabled={false}
        scopeOptionDisabledState={{
          anonymous: false,
          organization: false,
          users: false,
        }}
        typeOptionDisabledState={{
          view: false,
          edit: false,
          review: false,
          blocksDownload: false,
        }}
        canAddLink
        onCreateScopeChange={vi.fn()}
        onCreateTypeChange={onCreateTypeChange}
        onAddLink={onAddLink}
      />,
    );

    fireEvent.change(
      screen.getByRole("combobox", { name: "Link permission type" }),
      {
        target: { value: "edit" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));

    expect(onCreateTypeChange).toHaveBeenCalledWith("edit");
    expect(onAddLink).toHaveBeenCalled();
  });
});
