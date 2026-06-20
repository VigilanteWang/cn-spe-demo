// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItemLinkPermissionPanel } from "./ItemLinkPermissionPanel";
import type { IItemLinkPermissionDerivedEntry } from "../models/itemLinkPermissionModels";

const createEntry = (
  overrides: Partial<IItemLinkPermissionDerivedEntry>,
): IItemLinkPermissionDerivedEntry => ({
  id: "entry-1",
  source: "persisted",
  permissionId: "perm-1",
  shareId: "share-1",
  webUrl: "https://contoso.example/link-1",
  scope: "anonymous",
  type: "view",
  roleLabel: "View",
  preventsDownload: false,
  grantedToCount: 0,
  recipients: [],
  hasValidationError: false,
  ...overrides,
});

describe("ItemLinkPermissionPanel", () => {
  it("should render review in the type selector and disable occupied scope:type combinations", () => {
    render(
      <ItemLinkPermissionPanel
        entries={[
          createEntry({
            scope: "anonymous",
            type: "review",
            roleLabel: "Review",
          }),
        ]}
        isLoading={false}
        interactionDisabled={false}
        createScope="anonymous"
        createType="review"
        onCreateScopeChange={vi.fn()}
        onCreateTypeChange={vi.fn()}
        onAddLink={() => "draft-1"}
        onDeleteLink={vi.fn()}
        onCopyLink={vi.fn()}
        onAddRecipient={vi.fn()}
        onRemoveRecipient={vi.fn()}
      />,
    );

    expect(screen.getByRole("option", { name: "Review" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add link" })).toBeDisabled();
  });

  it("should disable add when all four types for a scope are already occupied", () => {
    render(
      <ItemLinkPermissionPanel
        entries={[
          createEntry({
            id: "entry-1",
            permissionId: "perm-1",
            scope: "anonymous",
            type: "view",
          }),
          createEntry({
            id: "entry-2",
            permissionId: "perm-2",
            scope: "anonymous",
            type: "edit",
            roleLabel: "Edit",
          }),
          createEntry({
            id: "entry-3",
            permissionId: "perm-3",
            scope: "anonymous",
            type: "review",
            roleLabel: "Review",
          }),
          createEntry({
            id: "entry-4",
            permissionId: "perm-4",
            scope: "anonymous",
            type: "blocksDownload",
            roleLabel: "Block download",
            preventsDownload: true,
          }),
        ]}
        isLoading={false}
        interactionDisabled={false}
        createScope="anonymous"
        createType="view"
        onCreateScopeChange={vi.fn()}
        onCreateTypeChange={vi.fn()}
        onAddLink={() => "draft-1"}
        onDeleteLink={vi.fn()}
        onCopyLink={vi.fn()}
        onAddRecipient={vi.fn()}
        onRemoveRecipient={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Add link" })).toBeDisabled();
    expect(
      screen.getByRole("option", { name: "Block download" }),
    ).toBeDisabled();
  });
});
