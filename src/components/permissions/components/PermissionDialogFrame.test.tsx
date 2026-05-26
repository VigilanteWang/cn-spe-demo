// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  TableCell,
  TableCellLayout,
  TableRow,
} from "@fluentui/react-components";
import { PermissionDialogFrame } from "./PermissionDialogFrame";
import type { IPermissionPrincipalCandidate } from "../models/permissionSharedModels";

const createCandidate = (
  overrides: Partial<IPermissionPrincipalCandidate> = {},
): IPermissionPrincipalCandidate => ({
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

const renderFrame = (
  overrides: Partial<Parameters<typeof PermissionDialogFrame>[0]> = {},
) => {
  const onRequestClose = vi.fn();
  const onSelectedTabChange = vi.fn();
  const onSearchQueryChange = vi.fn();
  const onSearchCandidateSelect = vi.fn();
  const onApply = vi.fn();

  const renderResult = render(
    <PermissionDialogFrame
      open
      title="Manage Permission"
      headerContent={<div>Header</div>}
      permissionStatusMessages={[]}
      selectedTab="people"
      interactionDisabled={false}
      searchInputId="permission-search"
      query=""
      searchResults={[]}
      searchStatus="idle"
      isDropdownOpen={false}
      isApplyingPermissions={false}
      applyFeedbackStatus={null}
      isApplyDisabled={false}
      tableBodyContent={
        <TableRow>
          <TableCell colSpan={3}>
            <TableCellLayout>Row</TableCellLayout>
          </TableCell>
        </TableRow>
      }
      onRequestClose={onRequestClose}
      onSelectedTabChange={onSelectedTabChange}
      onSearchQueryChange={onSearchQueryChange}
      onSearchCandidateSelect={onSearchCandidateSelect}
      isCandidateAdded={() => false}
      onApply={onApply}
      {...overrides}
    />,
  );

  return {
    onRequestClose,
    onSelectedTabChange,
    onSearchQueryChange,
    onSearchCandidateSelect,
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

  it("should render search guidance and candidate results from the shared search state", () => {
    const { onSearchCandidateSelect } = renderFrame({
      query: "Ade",
      searchStatus: "success",
      isDropdownOpen: true,
      searchResults: [createCandidate()],
      isCandidateAdded: () => true,
    });

    expect(screen.getByText("Adele Vance")).toBeInTheDocument();
    expect(screen.getByText("Already added")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("candidate-option-user-adele-vance"));

    expect(onSearchCandidateSelect).toHaveBeenCalledWith("user-adele-vance");
  });

  it("should render waiting-for-input feedback from the shared search state", () => {
    renderFrame({
      query: "Ad",
      searchStatus: "waitingForMoreInput",
      isDropdownOpen: true,
    });

    expect(
      screen.getByText("Keep typing at least 3 characters to search."),
    ).toBeInTheDocument();
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
