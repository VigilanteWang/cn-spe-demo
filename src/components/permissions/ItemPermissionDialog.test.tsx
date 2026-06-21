// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Providers, ProviderState } from "@microsoft/mgt-element";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ItemPermissionDialog } from "./ItemPermissionDialog";
import type { IItemUserPermissionEntry } from "./models/itemUserPermissionModels";
import type { IItemLinkPermissionEntryForUI } from "../../../common/contracts/itemPermissionCommonContracts";
import {
  applyItemLinkPermissionChanges,
  applyItemPermissionChanges,
  listItemLinkPermissions,
  listItemPermissions,
} from "../../services/itemPermissionApi";
import { searchDirectoryPrincipals } from "./services/directoryPrincipalSearch/directoryPrincipalSearch";
import { computeItemPermissionChanges } from "./services/itemUserPermissionDiff";

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

vi.mock("../../services/itemPermissionApi", () => ({
  listItemPermissions: vi.fn(),
  applyItemPermissionChanges: vi.fn(),
  listItemLinkPermissions: vi.fn(),
  applyItemLinkPermissionChanges: vi.fn(),
}));

vi.mock("./services/itemUserPermissionDiff", async () => {
  const actual = await vi.importActual<
    typeof import("./services/itemUserPermissionDiff")
  >("./services/itemUserPermissionDiff");

  return {
    ...actual,
    computeItemPermissionChanges: vi.fn(actual.computeItemPermissionChanges),
  };
});

const searchDirectoryPrincipalsMock = vi.mocked(searchDirectoryPrincipals);
const listItemPermissionsMock = vi.mocked(listItemPermissions);
const applyItemPermissionChangesMock = vi.mocked(applyItemPermissionChanges);
const listItemLinkPermissionsMock = vi.mocked(listItemLinkPermissions);
const applyItemLinkPermissionChangesMock = vi.mocked(
  applyItemLinkPermissionChanges,
);
const computeItemPermissionChangesMock = vi.mocked(
  computeItemPermissionChanges,
);

const renderDialog = (
  overrides?: Partial<ComponentProps<typeof ItemPermissionDialog>>,
) =>
  render(
    <ItemPermissionDialog
      open
      driveId="drive-a"
      itemId="item-a"
      itemName="Quarterly report"
      onClose={() => undefined}
      onManageContainerPermission={() => undefined}
      {...overrides}
    />,
  );

const flushAsyncWork = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const createPermissionEntry = (
  overrides: Partial<IItemUserPermissionEntry>,
): IItemUserPermissionEntry => ({
  id: "people:user-adele-vance",
  permissionId: "perm-adele",
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
  role: "Writer",
  ...overrides,
});

const createLinkEntry = (
  overrides: Partial<IItemLinkPermissionEntryForUI> = {},
): IItemLinkPermissionEntryForUI => ({
  id: "link-1",
  permissionId: "perm-link-1",
  shareId: "share-link-1",
  webUrl: "https://contoso.example/link-1",
  scope: "anonymous",
  type: "view",
  roleLabel: "View",
  preventsDownload: false,
  grantedToIdentities: [],
  grantedToCount: 0,
  capabilities: {
    canGrantRecipients: true,
    canRevokeRecipients: true,
    canDeleteLink: true,
  },
  ...overrides,
});

describe("ItemPermissionDialog", () => {
  beforeEach(() => {
    searchDirectoryPrincipalsMock.mockReset();
    listItemPermissionsMock.mockReset();
    applyItemPermissionChangesMock.mockReset();
    listItemLinkPermissionsMock.mockReset();
    applyItemLinkPermissionChangesMock.mockReset();
    computeItemPermissionChangesMock.mockClear();

    listItemPermissionsMock.mockResolvedValue({
      entriesByTab: {
        people: [],
        groups: [],
      },
    });
    listItemLinkPermissionsMock.mockResolvedValue([]);
    applyItemLinkPermissionChangesMock.mockResolvedValue([]);

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
    vi.restoreAllMocks();
  });

  it("should render inherited rows as readonly and keep user permission rows editable", async () => {
    listItemPermissionsMock.mockResolvedValue({
      entriesByTab: {
        people: [
          createPermissionEntry({
            id: "permission:perm-inherited",
            permissionId: "perm-inherited",
            principalDisplayName: "Inherited User",
            isInherited: true,
            isEditable: false,
            isRemovable: false,
          }),
          createPermissionEntry({
            id: "permission:perm-user-permission",
            permissionId: "perm-user-permission",
            principalDisplayName: "User Permission User",
          }),
        ],
        groups: [],
      },
    });

    renderDialog();
    await flushAsyncWork();

    const inheritedRow = screen.getByTestId(
      "permission-row-permission:perm-inherited",
    );
    expect(
      within(inheritedRow).getByTestId(
        "permission-inherited-icon-permission:perm-inherited",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Inherited User role" }),
    ).toBeDisabled();
    expect(
      within(inheritedRow).getByText("adele.vance@contoso.com"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Inherited User" }),
    ).toBeDisabled();
    expect(
      within(inheritedRow).queryByText("Inherited from parent"),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("combobox", { name: "User Permission User role" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Remove User Permission User" }),
    ).toBeEnabled();

    const inheritedIcon = within(inheritedRow).getByTestId(
      "permission-inherited-icon-permission:perm-inherited",
    );

    fireEvent.mouseOver(inheritedIcon);
    fireEvent.mouseEnter(inheritedIcon);
    fireEvent.focus(inheritedIcon);

    expect(
      await screen.findByText("Inherited from the parent folder"),
    ).toBeInTheDocument();
  });

  it("should reuse item permission diff and api when applying changes", async () => {
    listItemPermissionsMock.mockResolvedValue({
      entriesByTab: {
        people: [createPermissionEntry({ role: "Writer" })],
        groups: [],
      },
    });
    applyItemPermissionChangesMock.mockResolvedValue({
      entriesByTab: {
        people: [createPermissionEntry({ role: "Reader" })],
        groups: [],
      },
    });

    renderDialog();
    await flushAsyncWork();

    fireEvent.change(
      screen.getByRole("combobox", { name: "Adele Vance role" }),
      {
        target: { value: "Reader" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await flushAsyncWork();

    expect(computeItemPermissionChangesMock).toHaveBeenCalledTimes(1);
    expect(applyItemPermissionChangesMock).toHaveBeenCalledWith(
      "drive-a",
      "item-a",
      {
        create: [],
        update: [
          {
            permissionId: "perm-adele",
            principalType: "people",
            principalId: "user-adele-vance",
            recipientObjectId: "user-adele-vance",
            recipientEmail: "adele.vance@contoso.com",
            role: "Reader",
          },
        ],
        remove: [],
      },
    );
  });

  it("should confirm before switching to container permissions when the draft is dirty", async () => {
    const onClose = vi.fn();
    const onManageContainerPermission = vi.fn();

    listItemPermissionsMock.mockResolvedValue({
      entriesByTab: {
        people: [createPermissionEntry({ role: "Writer" })],
        groups: [],
      },
    });

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderDialog({
      onClose,
      onManageContainerPermission,
    });
    await flushAsyncWork();

    fireEvent.change(
      screen.getByRole("combobox", { name: "Adele Vance role" }),
      {
        target: { value: "Reader" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Container Permission" }),
    );

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onManageContainerPermission).toHaveBeenCalledTimes(1);
  });

  it("should show the Graph visibility disclaimer and learn-more links when the list is empty", async () => {
    listItemPermissionsMock.mockResolvedValue({
      entriesByTab: {
        people: [],
        groups: [],
      },
    });

    renderDialog();
    await flushAsyncWork();

    expect(
      screen.getByTestId("item-permission-visibility-disclaimer"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /This list may be empty even when item-level permissions exist\./,
      ),
    ).toBeInTheDocument();

    const links = screen.getAllByRole("link", { name: "here" });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute(
      "href",
      "https://learn.microsoft.com/en-us/graph/api/driveitem-list-permissions?view=graph-rest-1.0&tabs=http#access-to-sharing-permissions",
    );
    expect(links[1]).toHaveAttribute(
      "href",
      "https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/sharing-and-perm#role-based-sharing-setting",
    );
  });

  it("should render item name without prefix and keep the container link inline", async () => {
    renderDialog({
      itemName: "AddInsACSAssessmentReport",
    });
    await flushAsyncWork();

    expect(screen.getByText("AddInsACSAssessmentReport")).toBeInTheDocument();
    expect(
      screen.queryByText(/^Item:\s*AddInsACSAssessmentReport$/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Container Permission" }),
    ).toBeInTheDocument();
  });

  it("should show the Links tab only for supported Office files and lazy-load links on demand", async () => {
    renderDialog({
      fileName: "Quarterly report.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      isFolder: false,
    });
    await flushAsyncWork();

    expect(screen.getByRole("tab", { name: "Links" })).toBeInTheDocument();
    expect(listItemLinkPermissionsMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "Links" }));
    await flushAsyncWork();

    expect(listItemLinkPermissionsMock).toHaveBeenCalledWith(
      "drive-a",
      "item-a",
    );
  });

  it("should apply link changes before people/groups changes when both sides are dirty", async () => {
    listItemPermissionsMock.mockResolvedValue({
      entriesByTab: {
        people: [createPermissionEntry({ role: "Writer" })],
        groups: [],
      },
    });
    applyItemPermissionChangesMock.mockResolvedValue({
      entriesByTab: {
        people: [createPermissionEntry({ role: "Reader" })],
        groups: [],
      },
    });

    renderDialog({
      fileName: "Quarterly report.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      isFolder: false,
    });
    await flushAsyncWork();

    fireEvent.click(screen.getByRole("tab", { name: "Links" }));
    await flushAsyncWork();
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    fireEvent.click(screen.getByRole("tab", { name: "People" }));

    fireEvent.change(
      screen.getByRole("combobox", { name: "Adele Vance role" }),
      {
        target: { value: "Reader" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await flushAsyncWork();

    expect(applyItemLinkPermissionChangesMock).toHaveBeenCalledTimes(1);
    expect(applyItemPermissionChangesMock).toHaveBeenCalledTimes(1);
    expect(
      applyItemLinkPermissionChangesMock.mock.invocationCallOrder[0],
    ).toBeLessThan(applyItemPermissionChangesMock.mock.invocationCallOrder[0]);
  });

  it("should keep refreshed links and show partial failure message when user permission apply fails after links succeed", async () => {
    listItemPermissionsMock.mockResolvedValue({
      entriesByTab: {
        people: [createPermissionEntry({ role: "Writer" })],
        groups: [],
      },
    });
    listItemLinkPermissionsMock.mockResolvedValue([]);
    applyItemLinkPermissionChangesMock.mockResolvedValue([
      createLinkEntry({
        id: "link-2",
        permissionId: "perm-link-2",
        webUrl: "https://contoso.example/link-2",
        scope: "anonymous",
      }),
    ]);
    applyItemPermissionChangesMock.mockRejectedValue(
      new Error("user permission apply failed"),
    );

    renderDialog({
      fileName: "Quarterly report.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      isFolder: false,
    });
    await flushAsyncWork();

    fireEvent.click(screen.getByRole("tab", { name: "Links" }));
    await flushAsyncWork();
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    fireEvent.click(screen.getByRole("tab", { name: "People" }));
    fireEvent.change(
      screen.getByRole("combobox", { name: "Adele Vance role" }),
      {
        target: { value: "Reader" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await flushAsyncWork();

    expect(
      screen.getByText(/Links were saved, but people\/groups changes failed:/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Links" }));
    expect(
      screen.getByRole("button", { name: /Copy Anyone with the link link/i }),
    ).toBeInTheDocument();
  });
});
