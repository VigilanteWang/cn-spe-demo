// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ITEM_LINK_PERMISSION_SCOPES } from "../../../../common/contracts/itemPermissionCommonContracts";
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
  it("should render review in the type selector and disable occupied scope:type combinations", async () => {
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

    await userEvent.click(
      screen.getByRole("combobox", { name: "Link permission type" }),
    );
    expect(
      await screen.findByRole("option", { name: "Review" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Add link" })).toBeDisabled();
  });

  it("should disable add when all four types for a scope are already occupied", async () => {
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

    await userEvent.click(
      screen.getByRole("combobox", { name: "Link permission type" }),
    );
    expect(screen.getByRole("button", { name: "Add link" })).toBeDisabled();
    expect(
      await screen.findByRole("option", { name: "Block download" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("should auto expand a newly added specific link row", async () => {
    render(
      <ItemLinkPermissionPanel
        entries={[
          createEntry({
            id: "draft-specific-1",
            source: "draft",
            permissionId: undefined,
            shareId: undefined,
            scope: ITEM_LINK_PERMISSION_SCOPES.specific,
            type: "view",
            roleLabel: "View",
          }),
        ]}
        isLoading={false}
        interactionDisabled={false}
        createScope={ITEM_LINK_PERMISSION_SCOPES.specific}
        createType="edit"
        onCreateScopeChange={vi.fn()}
        onCreateTypeChange={vi.fn()}
        onAddLink={() => "draft-specific-1"}
        onDeleteLink={vi.fn()}
        onCopyLink={vi.fn()}
        onAddRecipient={vi.fn()}
        onRemoveRecipient={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add link" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Specific people and groups" }),
      ).toHaveAttribute("aria-expanded", "true");
    });
  });
});
