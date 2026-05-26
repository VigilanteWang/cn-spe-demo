// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Providers, ProviderState } from "@microsoft/mgt-element";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContainerPermissionDialog } from "./ContainerPermissionDialog";
import type { IContainerPermissionEntry } from "./models/containerPermissionModels";
import {
  ContainerPermissionApiError,
  applyContainerPermissionChanges,
  listContainerPermissions,
} from "../../services/containerPermissionApi";
import { searchDirectoryPrincipals } from "./services/directoryPrincipalSearch/directoryPrincipalSearch";
import type { IDirectoryPrincipalSearchResult } from "./services/directoryPrincipalSearch/directoryPrincipalSearch";

vi.mock(
  "./services/directoryPrincipalSearch/directoryPrincipalSearch",
  async () => {
    const actual = await vi.importActual<
      typeof import("./services/directoryPrincipalSearch/directoryPrincipalSearch")
    >("./services/directoryPrincipalSearch/directoryPrincipalSearch");

    return {
      ...actual,
      searchDirectoryPrincipals: vi.fn(),
    };
  },
);

vi.mock("../../services/containerPermissionApi", () => {
  class PermissionApiError extends Error {
    readonly code: string;

    readonly retryAfterSeconds?: number;

    readonly requestId?: string;

    readonly statusCode?: number;

    constructor(
      code: string,
      message: string,
      options?: {
        retryAfterSeconds?: number;
        requestId?: string;
        statusCode?: number;
      },
    ) {
      super(message);
      this.name = "PermissionApiError";
      this.code = code;
      this.retryAfterSeconds = options?.retryAfterSeconds;
      this.requestId = options?.requestId;
      this.statusCode = options?.statusCode;
    }
  }

  return {
    PermissionApiError,
    ContainerPermissionApiError: PermissionApiError,
    listContainerPermissions: vi.fn(),
    applyContainerPermissionChanges: vi.fn(),
  };
});

const searchDirectoryPrincipalsMock = vi.mocked(searchDirectoryPrincipals);
const listContainerPermissionsMock = vi.mocked(listContainerPermissions);
const applyContainerPermissionChangesMock = vi.mocked(
  applyContainerPermissionChanges,
);

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
 * 推进一次 debounce 周期，并顺带刷新一次微任务队列。
 */
const flushDebounce = async () => {
  await act(async () => {
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
  });
};

/**
 * 冲刷一次 effect + Promise 链带来的异步渲染。
 */
const flushAsyncWork = async () => {
  await act(async () => {
    await Promise.resolve();
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
  mail: "adele.vance@contoso.com",
  userPrincipalName: "adele.vance@contoso.com",
  ...overrides,
});

/**
 * 构造一个 access list 行模型。
 */
const createPermissionEntry = (
  overrides: Partial<IContainerPermissionEntry>,
): IContainerPermissionEntry => ({
  id: "people:user-adele-vance",
  permissionId: "perm-adele",
  principalId: "user-adele-vance",
  principalObjectId: "user-adele-vance",
  principalMail: "adele.vance@contoso.com",
  principalName: "Adele Vance",
  principalType: "people",
  description: "adele.vance@contoso.com",
  isInherited: false,
  isEditable: true,
  isRemovable: true,
  role: "Writer",
  ...overrides,
});

describe("ContainerPermissionDialog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchDirectoryPrincipalsMock.mockReset();
    listContainerPermissionsMock.mockReset();
    applyContainerPermissionChangesMock.mockReset();

    listContainerPermissionsMock.mockResolvedValue({
      people: [],
      groups: [],
    });

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
    vi.useRealTimers();
  });

  it("should load current container permissions and show them in access list", async () => {
    listContainerPermissionsMock.mockResolvedValue({
      people: [createPermissionEntry({ role: "Writer" })],
      groups: [
        createPermissionEntry({
          id: "groups:group-project-owners",
          permissionId: "perm-group",
          principalId: "group-project-owners",
          principalName: "Project Owners",
          principalType: "groups",
          description: "project.owners@contoso.com",
          role: "Manager",
        }),
      ],
    });

    renderDialog();
    await flushAsyncWork();

    const peopleRow = screen.getByTestId(
      "permission-row-people:user-adele-vance",
    );
    expect(within(peopleRow).getByText("Adele Vance")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Adele Vance role" }),
    ).toHaveValue("Writer");
    expect(listContainerPermissionsMock).toHaveBeenCalledWith("container-a");
  });

  it("should keep Combobox search behavior and add selected result directly into access list", async () => {
    searchDirectoryPrincipalsMock.mockResolvedValue([
      createSearchResult({
        id: "user-megan-bowen",
        displayName: "Megan Bowen",
        secondaryText: "megan.bowen@contoso.com",
        userPrincipalName: "megan.bowen@contoso.com",
      }),
    ]);

    renderDialog();
    await flushAsyncWork();

    const combobox = screen.getByRole("combobox", { name: "Add People" });
    expect(combobox).toBeEnabled();

    fireEvent.change(combobox, { target: { value: "Me" } });
    await flushDebounce();
    expect(searchDirectoryPrincipalsMock).not.toHaveBeenCalled();

    fireEvent.change(combobox, { target: { value: "Meg" } });
    await flushDebounce();

    expect(searchDirectoryPrincipalsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        principalKind: "people",
        query: "Meg",
      }),
    );

    fireEvent.click(screen.getByTestId("candidate-option-user-megan-bowen"));

    const addedRow = screen.getByTestId(
      "permission-row-people:user-megan-bowen",
    );
    expect(within(addedRow).getByText("Megan Bowen")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Megan Bowen role" }),
    ).toHaveValue("Reader");
  });

  it("should include userPrincipalName when applying a newly added people permission", async () => {
    searchDirectoryPrincipalsMock.mockResolvedValue([
      createSearchResult({
        id: "04fece17-914a-4418-b835-65507ab09c84",
        displayName: "Megan Bowen",
        secondaryText: "megan.bowen@contoso.com",
        userPrincipalName: "megan.bowen@contoso.com",
      }),
    ]);
    applyContainerPermissionChangesMock.mockResolvedValue({
      people: [
        createPermissionEntry({
          id: "permission:perm-megan",
          permissionId: "perm-megan",
          principalId: "04fece17-914a-4418-b835-65507ab09c84",
          principalUserPrincipalName: "megan.bowen@contoso.com",
          principalName: "Megan Bowen",
          description: "megan.bowen@contoso.com",
          role: "Reader",
        }),
      ],
      groups: [],
    });

    renderDialog();
    await flushAsyncWork();

    const combobox = screen.getByRole("combobox", { name: "Add People" });
    fireEvent.change(combobox, { target: { value: "Meg" } });
    await flushDebounce();
    fireEvent.click(
      screen.getByTestId(
        "candidate-option-04fece17-914a-4418-b835-65507ab09c84",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await flushAsyncWork();

    expect(applyContainerPermissionChangesMock).toHaveBeenCalledWith(
      "container-a",
      {
        create: [
          {
            principalType: "people",
            principalId: "04fece17-914a-4418-b835-65507ab09c84",
            userPrincipalName: "megan.bowen@contoso.com",
            role: "Reader",
          },
        ],
        update: [],
        remove: [],
      },
    );
  });

  it("should show Spinner in the dropdown while searching", async () => {
    const deferred = createDeferred<IDirectoryPrincipalSearchResult[]>();
    searchDirectoryPrincipalsMock.mockReturnValue(deferred.promise);

    renderDialog();
    await flushAsyncWork();

    const combobox = screen.getByRole("combobox", { name: "Add People" });
    fireEvent.change(combobox, { target: { value: "Adele" } });

    await flushDebounce();

    expect(screen.getByTestId("directory-search-loading")).toBeInTheDocument();

    deferred.resolve([createSearchResult({})]);
    await act(async () => {
      await deferred.promise;
    });
  });

  it("should show saving feedback while apply request is still pending", async () => {
    const deferred = createDeferred<{
      people: IContainerPermissionEntry[];
      groups: IContainerPermissionEntry[];
    }>();

    listContainerPermissionsMock.mockResolvedValue({
      people: [createPermissionEntry({ role: "Writer" })],
      groups: [],
    });
    applyContainerPermissionChangesMock.mockReturnValue(deferred.promise);

    renderDialog();
    await flushAsyncWork();

    const roleSelect = screen.getByRole("combobox", {
      name: "Adele Vance role",
    });
    fireEvent.change(roleSelect, { target: { value: "Manager" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByText("Saving...")).toBeInTheDocument();
    expect(screen.queryByText("Successful!")).not.toBeInTheDocument();
    expect(screen.queryByText("Failed")).not.toBeInTheDocument();

    deferred.resolve({
      people: [createPermissionEntry({ role: "Manager" })],
      groups: [],
    });
    await act(async () => {
      await deferred.promise;
    });
  });

  it("should apply role changes successfully and reset dirty state", async () => {
    listContainerPermissionsMock.mockResolvedValue({
      people: [createPermissionEntry({ role: "Writer" })],
      groups: [],
    });
    applyContainerPermissionChangesMock.mockResolvedValue({
      people: [createPermissionEntry({ role: "Manager" })],
      groups: [],
    });

    renderDialog();
    await flushAsyncWork();

    const roleSelect = screen.getByRole("combobox", {
      name: "Adele Vance role",
    });
    fireEvent.change(roleSelect, { target: { value: "Manager" } });

    const applyButton = screen.getByRole("button", { name: "Apply" });
    expect(applyButton).toBeEnabled();

    fireEvent.click(applyButton);
    await flushAsyncWork();

    expect(applyContainerPermissionChangesMock).toHaveBeenCalledWith(
      "container-a",
      {
        create: [],
        update: [{ permissionId: "perm-adele", role: "Manager" }],
        remove: [],
      },
    );
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "Adele Vance role" }),
    ).toHaveValue("Manager");
    expect(screen.getByText("Successful!")).toBeInTheDocument();
    expect(screen.queryByText("Failed")).not.toBeInTheDocument();
  });

  it("should preserve draft and show clear error when apply fails", async () => {
    listContainerPermissionsMock.mockResolvedValue({
      people: [createPermissionEntry({ role: "Writer" })],
      groups: [],
    });
    applyContainerPermissionChangesMock.mockRejectedValue(
      new ContainerPermissionApiError(
        "throttled",
        "Microsoft Graph throttled the container permission request after SDK retries were exhausted.",
        {
          retryAfterSeconds: 12,
          requestId: "req-429",
          statusCode: 429,
        },
      ),
    );

    renderDialog();
    await flushAsyncWork();

    const roleSelect = screen.getByRole("combobox", {
      name: "Adele Vance role",
    });
    fireEvent.change(roleSelect, { target: { value: "Owner" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await flushAsyncWork();

    expect(screen.getByText(/Retry after 12 seconds/)).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();

    expect(
      screen.getByRole("combobox", { name: "Adele Vance role" }),
    ).toHaveValue("Owner");
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
    expect(screen.queryByText("Successful!")).not.toBeInTheDocument();
  });
});
