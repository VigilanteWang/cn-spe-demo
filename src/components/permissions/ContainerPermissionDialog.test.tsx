// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { Providers, ProviderState } from "@microsoft/mgt-element";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContainerPermissionDialog } from "./ContainerPermissionDialog";
import type { IDirectoryPrincipalSearchResult } from "./services/directoryPrincipalSearch/directoryPrincipalSearch";
import { searchDirectoryPrincipals } from "./services/directoryPrincipalSearch/directoryPrincipalSearch";

vi.mock("./services/directoryPrincipalSearch/directoryPrincipalSearch", async () => {
  const actual =
    await vi.importActual<
      typeof import("./services/directoryPrincipalSearch/directoryPrincipalSearch")
    >(
      "./services/directoryPrincipalSearch/directoryPrincipalSearch",
    );

  return {
    ...actual,
    searchDirectoryPrincipals: vi.fn(),
  };
});

const searchDirectoryPrincipalsMock = vi.mocked(searchDirectoryPrincipals);

/**
 * 用一个可控的 Promise 模拟“搜索请求还没返回”的场景，
 * 方便测试 Spinner 和异步状态切换。
 */
const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
};

/**
 * 渲染一个最小权限弹窗。
 *
 * 这里统一收口公共 props，减少每个测试里的重复样板代码。
 */
const renderDialog = () =>
  render(
    <ContainerPermissionDialog
      open
      containerId="container-a"
      containerName="Container A"
      onClose={() => undefined}
    />,
  );

/**
 * 推进一次 debounce 周期，并顺带冲刷一次微任务队列。
 *
 * 这样测试在使用 fake timers 时能稳定等到“setTimeout 回调 + Promise then”都执行完。
 */
const flushDebounce = async () => {
  await act(async () => {
    vi.advanceTimersByTime(300);
    await Promise.resolve();
  });
};

/**
 * 构造统一的目录搜索结果假数据。
 */
const createSearchResult = (
  overrides: Partial<IDirectoryPrincipalSearchResult>,
): IDirectoryPrincipalSearchResult => ({
  id: "user-adele-vance",
  displayName: "Adele Vance",
  secondaryText: "adele.vance@contoso.com",
  principalType: "user",
  ...overrides,
});

describe("ContainerPermissionDialog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchDirectoryPrincipalsMock.mockReset();

    // 这里模拟一个已登录的最小 MGT Provider，
    // 让权限弹窗可以拿到 active account 和 Graph client。
    Providers.globalProvider = {
      state: ProviderState.SignedIn,
      onStateChanged: vi.fn(),
      removeStateChangedHandler: vi.fn(),
      onActiveAccountChanged: vi.fn(),
      removeActiveAccountChangedHandler: vi.fn(),
      getAccessToken: vi.fn(),
      getActiveAccount: vi.fn(() => ({
        id: "account-a",
        tenantId: "tenant-a",
      })),
      graph: {
        client: {
          api: vi.fn(),
        },
      },
    } as never;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("should wait until 3 characters before triggering directory search", async () => {
    searchDirectoryPrincipalsMock.mockResolvedValue([
      createSearchResult({ displayName: "Adele Vance" }),
    ]);

    renderDialog();

    const combobox = screen.getByRole("combobox", { name: "Add People" });

    fireEvent.change(combobox, { target: { value: "A" } });
    await flushDebounce();
    expect(searchDirectoryPrincipalsMock).not.toHaveBeenCalled();

    fireEvent.change(combobox, { target: { value: "Ad" } });
    await flushDebounce();
    expect(searchDirectoryPrincipalsMock).not.toHaveBeenCalled();

    fireEvent.change(combobox, { target: { value: "Ade" } });
    await flushDebounce();

    expect(searchDirectoryPrincipalsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        principalKind: "people",
        query: "Ade",
      }),
    );
  });

  it("should show Spinner in the dropdown while searching", async () => {
    const deferred = createDeferred<IDirectoryPrincipalSearchResult[]>();
    searchDirectoryPrincipalsMock.mockReturnValue(deferred.promise);

    renderDialog();

    const combobox = screen.getByRole("combobox", { name: "Add People" });
    fireEvent.change(combobox, { target: { value: "Adele" } });

    await flushDebounce();

    expect(screen.getByTestId("directory-search-loading")).toBeInTheDocument();

    deferred.resolve([createSearchResult({})]);
    await act(async () => {
      await deferred.promise;
    });
  });

  it("should switch search source when changing between people and groups tabs", async () => {
    searchDirectoryPrincipalsMock.mockResolvedValue([]);

    renderDialog();

    const peopleCombobox = screen.getByRole("combobox", { name: "Add People" });
    fireEvent.change(peopleCombobox, { target: { value: "Adele" } });

    await flushDebounce();

    expect(searchDirectoryPrincipalsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        principalKind: "people",
        query: "Adele",
      }),
    );

    fireEvent.click(screen.getByRole("tab", { name: "Groups" }));

    const groupsCombobox = screen.getByRole("combobox", { name: "Add Groups" });
    fireEvent.change(groupsCombobox, { target: { value: "Project" } });

    await flushDebounce();

    expect(searchDirectoryPrincipalsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        principalKind: "groups",
        query: "Project",
      }),
    );
  });

  it("should render Avatar initials, display name and secondary text for search results", async () => {
    searchDirectoryPrincipalsMock.mockResolvedValue([
      createSearchResult({
        id: "user-adele-vance",
        displayName: "Adele Vance",
        secondaryText: "adele.vance@contoso.com",
      }),
    ]);

    renderDialog();

    const combobox = screen.getByRole("combobox", { name: "Add People" });
    fireEvent.change(combobox, { target: { value: "Adele" } });

    await flushDebounce();

    const option = screen.getByTestId("candidate-option-user-adele-vance");
    expect(within(option).getByText("AV")).toBeInTheDocument();
    expect(within(option).getByText("Adele Vance")).toBeInTheDocument();
    expect(
      within(option).getByText("adele.vance@contoso.com"),
    ).toBeInTheDocument();
  });

  it("should add the selected result directly into access list", async () => {
    searchDirectoryPrincipalsMock.mockResolvedValue([
      createSearchResult({
        id: "user-megan-bowen",
        displayName: "Megan Bowen",
        secondaryText: "megan.bowen@contoso.com",
      }),
    ]);

    renderDialog();

    const combobox = screen.getByRole("combobox", { name: "Add People" });
    fireEvent.change(combobox, { target: { value: "Megan" } });

    await flushDebounce();

    fireEvent.click(screen.getByTestId("candidate-option-user-megan-bowen"));

    const addedRow = screen.getByTestId(
      "permission-row-people:user-megan-bowen",
    );
    expect(within(addedRow).getByText("Megan Bowen")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Megan Bowen role" }),
    ).toHaveValue("Reader");
  });

  it("should not add duplicate objects and should show concise feedback", async () => {
    searchDirectoryPrincipalsMock.mockResolvedValue([
      createSearchResult({
        id: "user-adele-vance",
        displayName: "Adele Vance",
        secondaryText: "adele.vance@contoso.com",
      }),
    ]);

    renderDialog();

    const combobox = screen.getByRole("combobox", { name: "Add People" });
    fireEvent.change(combobox, { target: { value: "Adele" } });

    await flushDebounce();

    fireEvent.click(screen.getByTestId("candidate-option-user-adele-vance"));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Adele Vance 已在 access list 中",
    );
    expect(
      screen.getAllByTestId("permission-row-people:user-adele-vance"),
    ).toHaveLength(1);
  });

  it("should render an empty state when no results match", async () => {
    searchDirectoryPrincipalsMock.mockResolvedValue([]);

    renderDialog();

    const combobox = screen.getByRole("combobox", { name: "Add People" });
    fireEvent.change(combobox, { target: { value: "NoMatch" } });

    await flushDebounce();

    expect(screen.getByTestId("directory-search-empty-state")).toHaveTextContent(
      "没有找到匹配的目录对象。请尝试更完整的姓名、邮箱或组名关键字。",
    );
  });
});
