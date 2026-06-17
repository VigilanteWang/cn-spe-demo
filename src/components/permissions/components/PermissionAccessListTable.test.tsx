// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PermissionAccessListTable,
  type IPermissionAccessListTableProps,
  type PermissionAccessListEntryWithRole,
} from "./PermissionAccessListTable";

type ITestPermissionEntry = PermissionAccessListEntryWithRole & {
  role: "Reader" | "Writer";
};

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

const renderTable = (
  overrides: Partial<
    IPermissionAccessListTableProps<ITestPermissionEntry>
  > = {},
) => {
  const onRoleChange = vi.fn();
  const onRemove = vi.fn();

  render(
    <PermissionAccessListTable<ITestPermissionEntry>
      selectedTab="people"
      entries={[createEntry()]}
      isLoading={false}
      roleOptions={["Reader", "Writer"]}
      isInteractionDisabled={false}
      onRoleChange={onRoleChange}
      onRemove={onRemove}
      isRoleDisabled={() => false}
      isRemoveDisabled={() => false}
      {...overrides}
    />,
  );

  return {
    onRoleChange,
    onRemove,
  };
};

describe("PermissionAccessListTable", () => {
  it("should render the shared principal cell layout and role options", () => {
    const { onRoleChange, onRemove } = renderTable();

    const row = screen.getByTestId("permission-row-people:user-adele-vance");
    expect(within(row).getByText("Adele Vance")).toBeInTheDocument();
    expect(
      within(row).getByText("adele.vance@contoso.com"),
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("combobox", { name: "Adele Vance role" }),
      {
        target: { value: "Writer" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Adele Vance" }));

    expect(screen.getByRole("option", { name: "Reader" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Writer" })).toBeInTheDocument();
    expect(onRoleChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "people:user-adele-vance" }),
      "Writer",
    );
    expect(onRemove).toHaveBeenCalledWith(
      expect.objectContaining({ id: "people:user-adele-vance" }),
    );
  });

  it("should render inherited icon only when tooltip text is provided", async () => {
    renderTable({
      entries: [
        createEntry({
          id: "permission:perm-inherited",
          principalDisplayName: "Inherited User",
          isInherited: true,
        }),
      ],
      inheritedTooltipText: "Inherited from the parent folder",
    });

    const inheritedIcon = screen.getByTestId(
      "permission-inherited-icon-permission:perm-inherited",
    );
    fireEvent.mouseOver(inheritedIcon);
    fireEvent.focus(inheritedIcon);

    expect(
      await screen.findByText("Inherited from the parent folder"),
    ).toBeInTheDocument();
  });

  it("should honor loading, empty state and row-level disabled flags", () => {
    const { rerender } = render(
      <PermissionAccessListTable<ITestPermissionEntry>
        selectedTab="people"
        entries={[]}
        isLoading
        roleOptions={["Reader", "Writer"]}
        isInteractionDisabled={false}
        onRoleChange={vi.fn()}
        onRemove={vi.fn()}
        isRoleDisabled={() => false}
        isRemoveDisabled={() => false}
      />,
    );

    expect(screen.getByText("Loading current permissions")).toBeInTheDocument();

    rerender(
      <PermissionAccessListTable<ITestPermissionEntry>
        selectedTab="people"
        entries={[
          createEntry({
            principalDisplayName: "Readonly User",
            isEditable: false,
            isRemovable: false,
          }),
        ]}
        isLoading={false}
        roleOptions={["Reader", "Writer"]}
        isInteractionDisabled={false}
        onRoleChange={vi.fn()}
        onRemove={vi.fn()}
        isRoleDisabled={(entry) => !entry.isEditable}
        isRemoveDisabled={(entry) => !entry.isRemovable}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "Readonly User role" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Remove Readonly User" }),
    ).toBeDisabled();

    rerender(
      <PermissionAccessListTable<ITestPermissionEntry>
        selectedTab="people"
        entries={[]}
        isLoading={false}
        roleOptions={["Reader", "Writer"]}
        isInteractionDisabled={false}
        onRoleChange={vi.fn()}
        onRemove={vi.fn()}
        isRoleDisabled={() => false}
        isRemoveDisabled={() => false}
      />,
    );

    expect(screen.getByText("No permissions added yet.")).toBeInTheDocument();
  });
});
