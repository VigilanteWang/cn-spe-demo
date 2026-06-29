// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UserPermissionPanel } from "./UserPermissionPanel";
import type { IPermissionPrincipalSearchCandidate } from "../models/permissionSharedModels";
import type { UserPermissionAccessListEntryWithRole } from "./UserPermissionAccessListTable";

type ITestPermissionEntry = UserPermissionAccessListEntryWithRole & {
  role: "Reader" | "Writer";
};

const createCandidate = (
  overrides: Partial<IPermissionPrincipalSearchCandidate> = {},
): IPermissionPrincipalSearchCandidate => ({
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
  overrides: Partial<ITestPermissionEntry> = {},
): ITestPermissionEntry => ({
  id: "people:user-adele-vance",
  principalId: "user-adele-vance",
  principalObjectId: "user-adele-vance",
  principalUserPrincipalName: "adele.vance@contoso.com",
  principalMail: "adele.vance@contoso.com",
  principalDisplayName: "Adele Vance",
  principalType: "people",
  description: "adele.vance@contoso.com",
  isInherited: false,
  isEditable: true,
  isRemovable: true,
  role: "Reader",
  ...overrides,
});

const renderBody = () => {
  const onSearchQueryChange = vi.fn();
  const onSearchCandidateSelect = vi.fn();
  const onRoleChange = vi.fn();
  const onRemove = vi.fn();

  render(
    <UserPermissionPanel
      selectedTab="people"
      interactionDisabled={false}
      searchInputId="permission-search"
      query="Ade"
      searchResults={[createCandidate()]}
      searchStatus="success"
      isDropdownOpen
      onSearchQueryChange={onSearchQueryChange}
      onSearchCandidateSelect={onSearchCandidateSelect}
      isCandidateAdded={() => true}
      beforeAccessListContent={<div>Before Access List</div>}
      accessListProps={{
        entries: [createEntry({ role: "Writer" })],
        isLoading: false,
        roleOptions: ["Reader", "Writer"],
        isInteractionDisabled: false,
        onRoleChange,
        onRemove,
        isRoleDisabled: () => false,
        isRemoveDisabled: () => false,
      }}
    />,
  );

  return {
    onSearchQueryChange,
    onSearchCandidateSelect,
    onRoleChange,
    onRemove,
  };
};

describe("UserPermissionPanel", () => {
  it("should render search guidance and candidate results", () => {
    const { onSearchCandidateSelect } = renderBody();

    expect(screen.getAllByText("Adele Vance")).toHaveLength(2);
    expect(screen.getByText("Already added")).toBeInTheDocument();
    expect(screen.getByText("Before Access List")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("candidate-option-user-adele-vance"));

    expect(onSearchCandidateSelect).toHaveBeenCalledWith("user-adele-vance");
  });

  it("should render the access list configuration", () => {
    const { onRoleChange, onRemove } = renderBody();

    fireEvent.change(
      screen.getByRole("combobox", { name: "Adele Vance role" }),
      {
        target: { value: "Reader" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Adele Vance" }));

    expect(screen.getAllByText("adele.vance@contoso.com")).toHaveLength(2);
    expect(onRoleChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "people:user-adele-vance" }),
      "Reader",
    );
    expect(onRemove).toHaveBeenCalledWith(
      expect.objectContaining({ id: "people:user-adele-vance" }),
    );
  });
});
