// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Containers } from "./index";
import { IContainer } from "../../common/types";

if (typeof globalThis.NodeFilter === "undefined") {
  globalThis.NodeFilter = {
    SHOW_ELEMENT: 1,
  } as typeof NodeFilter;
}

const { listContainersMock, createContainerMock } = vi.hoisted(() => {
  return {
    listContainersMock: vi.fn<() => Promise<IContainer[] | undefined>>(),
    createContainerMock: vi.fn(),
  };
});

vi.mock("../../services/spembedded", () => {
  return {
    default: class MockSpEmbedded {
      listContainers = listContainersMock;
      createContainer = createContainerMock;
    },
  };
});

vi.mock("../files", () => {
  return {
    Files: ({ container }: { container: IContainer }) => (
      <div data-testid="mock-files">Files for {container.displayName}</div>
    ),
  };
});

describe("Containers", () => {
  beforeEach(() => {
    listContainersMock.mockReset();
    createContainerMock.mockReset();
  });

  afterEach(() => {
    cleanup();
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

    expect(screen.getByRole("button", { name: "Create container" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Manage Container Permission" }),
    ).toBeInTheDocument();
  });

  it("should open permission dialog when clicking manage button", async () => {
    listContainersMock.mockResolvedValue([]);

    render(<Containers />);

    const header = await screen.findByTestId("containers-header");

    fireEvent.click(
      within(header).getByRole("button", {
        name: "Manage Container Permission",
      }),
    );

    expect(
      screen.getByRole("dialog", { name: "Manage Container Permission" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Container: 未选择容器")).toBeInTheDocument();
    expect(
      screen.getByText("静态列表占位：后续将在这里渲染容器权限访问列表。"),
    ).toBeInTheDocument();
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

    expect(within(header).getByTestId("container-selector")).toBeInTheDocument();
    expect(within(header).getByTestId("container-actions")).toBeInTheDocument();
    expect(within(filesRegion).queryByTestId("mock-files")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText("Container A"));

    expect(await within(filesRegion).findByTestId("mock-files")).toHaveTextContent(
      "Files for Container A",
    );
  });
});
