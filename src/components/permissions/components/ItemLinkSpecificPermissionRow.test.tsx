// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ITEM_LINK_PERMISSION_SCOPES } from "../../../../common/contracts/itemPermissionCommonContracts";
import { ItemLinkSpecificPermissionRow } from "./ItemLinkSpecificPermissionRow";
import type {
  IItemLinkPermissionComputedEntry,
  IItemLinkPermissionRecipientCandidate,
} from "../models/itemLinkPermissionModels";

const hookState = vi.hoisted(() => ({
  searchTab: "people" as "people" | "groups",
  setSearchTab: vi.fn(),
  handleQueryChange: vi.fn(),
  handleCandidateSelect: vi.fn(),
}));

vi.mock("../hooks/useItemLinkPermissionRecipientSearch", () => ({
  useItemLinkPermissionRecipientSearch: () => ({
    searchTab: hookState.searchTab,
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
  overrides: Partial<IItemLinkPermissionComputedEntry> = {},
): IItemLinkPermissionComputedEntry => ({
  id: "entry-specific-1",
  source: "persisted",
  permissionId: "perm-specific-1",
  shareId: "share-specific-1",
  webUrl: "https://contoso.example/specific-link",
  scope: ITEM_LINK_PERMISSION_SCOPES.specific,
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
    hookState.searchTab = "people";
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
    expect(
      screen.getByRole("button", { name: "Copy specific link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete specific link" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "People" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Groups" })).toBeInTheDocument();
    expect(screen.getAllByText("Adele Vance")).toHaveLength(2);
  });

  it("should switch recipient list with the selected tab", () => {
    const mixedEntry = createEntry({
      recipients: [
        {
          key: "user-adele-vance",
          source: "persisted",
          candidate: createRecipientCandidate(),
        },
        {
          key: "group-sales",
          source: "persisted",
          candidate: createRecipientCandidate({
            id: "group-sales",
            objectId: "group-sales",
            name: "Sales Team",
            type: "groups",
            secondaryText: "sales@contoso.com",
            initials: "ST",
            mail: "sales@contoso.com",
            userPrincipalName: undefined,
          }),
        },
      ],
    });

    const { rerender } = render(
      <ItemLinkSpecificPermissionRow
        entry={mixedEntry}
        interactionDisabled={false}
        autoExpand
        onCopyLink={vi.fn()}
        onDeleteLink={vi.fn()}
        onAddRecipient={vi.fn()}
        onRemoveRecipient={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Adele Vance")).toHaveLength(2);
    expect(
      screen.getByRole("button", {
        name: "Remove Adele Vance from specific link",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Remove Sales Team from specific link",
      }),
    ).not.toBeInTheDocument();

    hookState.searchTab = "groups";
    rerender(
      <ItemLinkSpecificPermissionRow
        entry={mixedEntry}
        interactionDisabled={false}
        autoExpand
        onCopyLink={vi.fn()}
        onDeleteLink={vi.fn()}
        onAddRecipient={vi.fn()}
        onRemoveRecipient={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", {
        name: "Remove Adele Vance from specific link",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Remove Sales Team from specific link",
      }),
    ).toBeInTheDocument();
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
