// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ItemLinkCreateControls } from "./ItemLinkCreateControls";

describe("ItemLinkCreateControls", () => {
  it("should reflect disabled state for stable controls and disable add when canAddLink is false", async () => {
    render(
      <ItemLinkCreateControls
        createScope="anonymous"
        createType="review"
        interactionDisabled={false}
        scopeOptionDisabledState={{
          anonymous: false,
          organization: true,
          specific: false,
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
    expect(
      screen.getByRole("combobox", { name: "Link permission type" }),
    ).toHaveValue("Review");
    await userEvent.click(
      screen.getByRole("button", { name: "Open Link permission type" }),
    );
    expect(
      await screen.findByRole("option", { name: "Review" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Add link" })).toBeDisabled();
  });

  it("should call the stable change handlers and add handler", async () => {
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
          specific: false,
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

    await userEvent.click(
      screen.getByRole("button", { name: "Open Link permission type" }),
    );
    await userEvent.click(await screen.findByRole("option", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));

    expect(onCreateTypeChange).toHaveBeenCalledWith("edit");
    expect(onAddLink).toHaveBeenCalled();
  });
});
