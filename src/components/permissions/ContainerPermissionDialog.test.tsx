// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ContainerPermissionDialog } from "./ContainerPermissionDialog";

/**
 * 为 Close 放弃草稿场景提供一个最小测试壳。
 *
 * 这样可以更贴近真实使用方式，
 * 验证关闭后再重新打开时草稿是否已经回滚。
 */
const DialogHarness = () => {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen
      </button>
      <ContainerPermissionDialog
        open={open}
        containerId="container-a"
        containerName="Container A"
        onClose={() => setOpen(false)}
      />
    </div>
  );
};

describe("ContainerPermissionDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("should switch between people and groups tabs", () => {
    render(
      <ContainerPermissionDialog
        open
        containerId="container-a"
        containerName="Container A"
        onClose={() => undefined}
      />,
    );

    expect(
      screen.getByTestId("permission-row-people:user-adele-vance"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("permission-row-groups:group-project-owners"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Groups" }));

    expect(
      screen.getByTestId("permission-row-groups:group-project-owners"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("permission-row-people:user-adele-vance"),
    ).not.toBeInTheDocument();
  });

  it("should show local dropdown options after typing", () => {
    render(
      <ContainerPermissionDialog
        open
        containerId="container-a"
        containerName="Container A"
        onClose={() => undefined}
      />,
    );

    const combobox = screen.getByRole("combobox", { name: "Add People" });
    fireEvent.change(combobox, { target: { value: "Diego" } });

    expect(
      screen.getByTestId("candidate-option-user-diego-siciliani"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("candidate-option-user-megan-bowen"),
    ).not.toBeInTheDocument();
  });

  it("should add a local permission entry with default Reader role", () => {
    render(
      <ContainerPermissionDialog
        open
        containerId="container-a"
        containerName="Container A"
        onClose={() => undefined}
      />,
    );

    const combobox = screen.getByRole("combobox", { name: "Add People" });
    fireEvent.change(combobox, { target: { value: "Megan" } });
    fireEvent.click(screen.getByTestId("candidate-option-user-megan-bowen"));

    const addedRow = screen.getByTestId(
      "permission-row-people:user-megan-bowen",
    );
    expect(within(addedRow).getByText("Megan Bowen")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Megan Bowen role" }),
    ).toHaveValue("Reader");
  });

  it("should update a permission role inline", () => {
    render(
      <ContainerPermissionDialog
        open
        containerId="container-a"
        containerName="Container A"
        onClose={() => undefined}
      />,
    );

    const row = screen.getByTestId("permission-row-people:user-adele-vance");
    const roleSelect = within(row).getByRole("combobox", {
      name: "Adele Vance role",
    });

    fireEvent.change(roleSelect, { target: { value: "Owner" } });

    expect(roleSelect).toHaveValue("Owner");
  });

  it("should remove a permission entry inline", () => {
    render(
      <ContainerPermissionDialog
        open
        containerId="container-a"
        containerName="Container A"
        onClose={() => undefined}
      />,
    );

    const row = screen.getByTestId("permission-row-people:user-adele-vance");
    fireEvent.click(
      within(row).getByRole("button", { name: "Remove Adele Vance" }),
    );

    expect(
      screen.queryByTestId("permission-row-people:user-adele-vance"),
    ).not.toBeInTheDocument();
  });

  it("should discard draft changes when closing the dialog", () => {
    render(<DialogHarness />);

    const combobox = screen.getByRole("combobox", { name: "Add People" });
    fireEvent.change(combobox, { target: { value: "Megan" } });
    fireEvent.click(screen.getByTestId("candidate-option-user-megan-bowen"));

    expect(
      screen.getByTestId("permission-row-people:user-megan-bowen"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.queryByTestId("permission-row-people:user-megan-bowen"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));

    expect(
      screen.queryByTestId("permission-row-people:user-megan-bowen"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("permission-row-people:user-adele-vance"),
    ).toBeInTheDocument();
  });
});
