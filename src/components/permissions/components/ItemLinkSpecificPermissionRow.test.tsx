// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ItemLinkSpecificPermissionRow } from "./ItemLinkSpecificPermissionRow";
import type {
  IItemLinkPermissionDerivedEntry,
  IItemLinkPermissionRecipientCandidate,
} from "../models/itemLinkPermissionModels";

const hookState = vi.hoisted(() => ({
  setSearchTab: vi.fn(),
  handleQueryChange: vi.fn(),
  handleCandidateSelect: vi.fn(),
}));

vi.mock("../hooks/useItemLinkPermissionRecipientSearch", () => ({
  useItemLinkPermissionRecipientSearch: () => ({
    searchTab: "people",
    setSearchTab: hookState.setSearchTab,
    query: "Ade",
    results: [
      {
        id: "user-adele-vance",
        objectId: "user-adele-vance",
        name: "Adele Vance",
        type: "people",
        secondaryText: "adele.vance@contoso.com",
        initials: "AV",
        mail: "adele.vance@contoso.com",
        userPrincipalName: "adele.vance@contoso.com",
      },
    ],
    status: "success",
    searchError: null,
    isDropdownOpen: true,
    handleQueryChange: hookState.handleQueryChange,
    handleCandidateSelect: hookState.handleCandidateSelect,
  }),
}));

const createRecipientCandidate = (
  overrides: Partial<IItemLinkPermissionRecipientCandidate> = {},
): IItemLinkPermissionRecipientCandidate => ({
  id: "user-adele-vance",
  objectId: "user-adele-vance",
  name: "Adele Vance",
  type: "people",
  secondaryText: "adele.vance@contoso.com",
  initials: "AV",
  mail: "adele.vance@contoso.com",
  userPrincipalName: "adele.vance@contoso.com",
  ...overrides,
});

const createEntry = (
  overrides: Partial<IItemLinkPermissionDerivedEntry> = {},
): IItemLinkPermissionDerivedEntry => ({
  id: "entry-specific-1",
  source: "persisted",
  permissionId: "perm-specific-1",
  shareId: "share-specific-1",
  webUrl: "https://contoso.example/specific-link",
  scope: "specific",
  type: "view",
  roleLabel: "View",
  preventsDownload: false,
  grantedToCount: 1,
  recipients: [
    {
      key: "user-adele-vance",
      source: "persisted",
      candidate: createRecipientCandidate(),
    },
  ],
  hasValidationError: false,
  ...overrides,
});

describe("ItemLinkSpecificPermissionRow", () => {
  beforeEach(() => {
    hookState.setSearchTab.mockClear();
    hookState.handleQueryChange.mockClear();
    hookState.handleCandidateSelect.mockClear();
  });

  it("should auto expand and render recipients and search UI", () => {
    render(
      <ItemLinkSpecificPermissionRow
        entry={createEntry()}
        interactionDisabled={false}
        autoExpand
        onCopyLink={vi.fn()}
        onDeleteLink={vi.fn()}
        onAddRecipient={vi.fn()}
        onRemoveRecipient={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Specific people and groups" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("tab", { name: "People" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Groups" })).toBeInTheDocument();
    expect(screen.getAllByText("Adele Vance")).toHaveLength(2);
  });

  it("should remove recipient and show validation error", () => {
    const onRemoveRecipient = vi.fn();
    const entry = createEntry({ hasValidationError: true });

    render(
      <ItemLinkSpecificPermissionRow
        entry={entry}
        interactionDisabled={false}
        autoExpand
        onCopyLink={vi.fn()}
        onDeleteLink={vi.fn()}
        onAddRecipient={vi.fn()}
        onRemoveRecipient={onRemoveRecipient}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Adele Vance from specific link",
      }),
    );

    expect(onRemoveRecipient).toHaveBeenCalledWith(entry, "user-adele-vance");
    expect(
      screen.getByText(
        "Specific links must include at least one person or group before Apply.",
      ),
    ).toBeInTheDocument();
  });
});
