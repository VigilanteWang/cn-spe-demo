// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Containers } from "./index";
import { IContainer } from "../../common/types";

const { listContainersMock, createContainerMock } = vi.hoisted(() => {
  return {
    listContainersMock: vi.fn<() => Promise<IContainer[] | undefined>>(),
    createContainerMock: vi.fn(),
  };
});

vi.mock("../../services/containerAndFileApi", () => {
  return {
    listContainers: listContainersMock,
    createContainer: createContainerMock,
  };
});

vi.mock("../files", () => {
  return {
    Files: ({ container }: { container: IContainer }) => (
      <div data-testid="mock-files">Files for {container.displayName}</div>
    ),
  };
});

// 容器测试只验证对话框的静态 UI，不测权限 API 行为；
// mock 服务层避免 containerPermissionApi → apiClient → config.ts 在测试环境立即求值报错。
vi.mock("../../services/containerPermissionApi", () => ({
  listContainerPermissions: vi
    .fn()
    .mockResolvedValue({ people: [], groups: [] }),
  applyContainerPermissionChanges: vi.fn(),
  ContainerPermissionApiError: class extends Error {
    code = "";
  },
}));

describe("Containers", () => {
  beforeEach(() => {
    listContainersMock.mockReset();
    createContainerMock.mockReset();
  });

  it("should render create and permission buttons", async () => {
    listContainersMock.mockResolvedValue([
      {
        id: "container-a",
        displayName: "Container A",
        containerTypeId: "type-a",
        createdDateTime: "2026-05-02T00:00:00Z",
      },
    ]);

    render(<Containers />);

    await waitFor(() => {
      expect(listContainersMock).toHaveBeenCalledTimes(1);
    });

    expect(
      screen.getByRole("button", { name: "Create container" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Manage Permission" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Manage Permission" }),
    ).toBeDisabled();
  });

  it("should keep permission button disabled before a container is selected", async () => {
    listContainersMock.mockResolvedValue([
      {
        id: "container-a",
        displayName: "Container A",
        containerTypeId: "type-a",
        createdDateTime: "2026-05-02T00:00:00Z",
      },
    ]);

    render(<Containers />);

    await waitFor(() => {
      expect(listContainersMock).toHaveBeenCalledTimes(1);
    });

    expect(
      screen.getByRole("button", { name: "Manage Permission" }),
    ).toBeDisabled();
  });

  it("should keep header controls and files region as separate layout areas", async () => {
    listContainersMock.mockResolvedValue([
      {
        id: "container-a",
        displayName: "Container A",
        containerTypeId: "type-a",
        createdDateTime: "2026-05-02T00:00:00Z",
      },
    ]);

    render(<Containers />);

    const header = await screen.findByTestId("containers-header");
    const filesRegion = screen.getByTestId("containers-files-region");

    expect(
      within(header).getByTestId("container-selector"),
    ).toBeInTheDocument();
    expect(within(header).getByTestId("container-actions")).toBeInTheDocument();
    expect(
      within(filesRegion).queryByTestId("mock-files"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("Container A"));

    expect(
      screen.getByRole("button", { name: "Manage Permission" }),
    ).toBeEnabled();
    expect(
      await within(filesRegion).findByTestId("mock-files"),
    ).toHaveTextContent("Files for Container A");
  });

  it("should open permission dialog after a container is selected", async () => {
    listContainersMock.mockResolvedValue([
      {
        id: "container-a",
        displayName: "Container A",
        containerTypeId: "type-a",
        createdDateTime: "2026-05-02T00:00:00Z",
      },
    ]);

    render(<Containers />);

    await waitFor(() => {
      expect(listContainersMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("Container A"));
    fireEvent.click(screen.getByRole("button", { name: "Manage Permission" }));

    const dialog = screen.getByRole("dialog", {
      name: "Manage Container Permission",
    });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Container A")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Add People" }),
    ).toBeInTheDocument();
  });

  it("should surface structured backend request details when loading containers fails", async () => {
    const error = Object.assign(
      new Error("Container list request was throttled."),
      {
        code: "throttled",
        retryAfterSeconds: 8,
      },
    );
    listContainersMock.mockRejectedValue(error);

    render(<Containers />);

    expect(
      await screen.findByText("Error: Container list request was throttled."),
    ).toBeInTheDocument();
  });

  it("should keep createContainer errors inside the create dialog instead of the page header", async () => {
    listContainersMock.mockResolvedValue([]);
    createContainerMock.mockRejectedValue(
      new Error("Expired Container type."),
    );

    render(<Containers />);

    await waitFor(() => {
      expect(listContainersMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Create container" }));
    fireEvent.change(screen.getByLabelText("Container name:"), {
      target: { value: "test" },
    });
    fireEvent.change(screen.getByLabelText("Container description:"), {
      target: { value: "test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    const dialog = screen.getByRole("dialog", { name: "Create container" });
    const header = screen.getByTestId("containers-header");
    expect(
      await within(dialog).findByText("Error: Expired Container type."),
    ).toBeInTheDocument();
    expect(createContainerMock).toHaveBeenCalledWith("test", "test");
    expect(
      within(header).queryByText("Error: Expired Container type."),
    ).not.toBeInTheDocument();
  });
});
