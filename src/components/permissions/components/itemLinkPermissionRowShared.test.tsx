// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { Text } from "@fluentui/react-components";
import { describe, expect, it, vi } from "vitest";
import { ItemLinkPermissionRowShell } from "./itemLinkPermissionRowShared";
import type { IItemLinkPermissionDerivedEntry } from "../models/itemLinkPermissionModels";

const createEntry = (
  overrides: Partial<IItemLinkPermissionDerivedEntry> = {},
): IItemLinkPermissionDerivedEntry => ({
  id: "entry-1",
  source: "persisted",
  permissionId: "perm-1",
  shareId: "share-1",
  webUrl: "https://contoso.example/link-1",
  scope: "organization",
  type: "view",
  roleLabel: "View",
  preventsDownload: false,
  grantedToCount: 3,
  recipients: [],
  hasValidationError: false,
  ...overrides,
});

describe("ItemLinkPermissionRowShell", () => {
  it("should render organization grantedToCount and invoke copy/delete handlers", () => {
    const onCopyLink = vi.fn();
    const onDeleteLink = vi.fn();
    const entry = createEntry();

    render(
      <ItemLinkPermissionRowShell
        entry={entry}
        interactionDisabled={false}
        onCopyLink={onCopyLink}
        onDeleteLink={onDeleteLink}
        subtitle={<Text size={200}>people who have access: 3</Text>}
      />,
    );

    expect(screen.getByText("people who have access: 3")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Copy People in Organization link" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete People in Organization link",
      }),
    );

    expect(onCopyLink).toHaveBeenCalledWith("https://contoso.example/link-1");
    expect(onDeleteLink).toHaveBeenCalledWith(entry);
  });

  it("should disable copy when webUrl is missing", () => {
    render(
      <ItemLinkPermissionRowShell
        entry={createEntry({ webUrl: undefined })}
        interactionDisabled={false}
        onCopyLink={vi.fn()}
        onDeleteLink={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Copy People in Organization link",
      }),
    ).toBeDisabled();
  });

  it("should show copy tooltip on hover", async () => {
    render(
      <ItemLinkPermissionRowShell
        entry={createEntry()}
        interactionDisabled={false}
        onCopyLink={vi.fn()}
        onDeleteLink={vi.fn()}
      />,
    );

    fireEvent.mouseEnter(
      screen.getByRole("button", { name: "Copy People in Organization link" }),
    );

    expect(screen.getByLabelText("Copy Link")).toBeInTheDocument();
  });
});
