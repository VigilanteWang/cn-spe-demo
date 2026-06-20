// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyItemLinkPermissionChanges,
  listItemLinkPermissions,
} from "../../../services/itemPermissionApi";
import type {
  IItemLinkPermissionDraftState,
  IItemLinkPermissionEntryForUI,
} from "../models/itemLinkPermissionModels";
import { useItemLinkPermissionApiRequestState } from "./useItemLinkPermissionApiRequestState";

vi.mock("../../../services/itemPermissionApi", () => ({
  listItemLinkPermissions: vi.fn(),
  applyItemLinkPermissionChanges: vi.fn(),
}));

const listItemLinkPermissionsMock = vi.mocked(listItemLinkPermissions);
const applyItemLinkPermissionChangesMock = vi.mocked(
  applyItemLinkPermissionChanges,
);

const createPersistedEntry = (
  overrides: Partial<IItemLinkPermissionEntryForUI> = {},
): IItemLinkPermissionEntryForUI => ({
  id: "link-1",
  permissionId: "perm-1",
  shareId: "share-1",
  webUrl: "https://contoso.example/link-1",
  scope: "specific",
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

const createEmptyDraft = (): IItemLinkPermissionDraftState => ({
  createdLinks: [],
  deletedPermissionIds: [],
  grantsByPermissionId: {},
  revokesByPermissionId: {},
});

describe("useItemLinkPermissionApiRequestState", () => {
  beforeEach(() => {
    listItemLinkPermissionsMock.mockReset();
    applyItemLinkPermissionChangesMock.mockReset();
    listItemLinkPermissionsMock.mockResolvedValue([createPersistedEntry()]);
    applyItemLinkPermissionChangesMock.mockResolvedValue([createPersistedEntry()]);
  });

  it("should lazy-load links only when the links tab becomes active", async () => {
    const { result, rerender } = renderHook(
      ({ selectedDialogTab }: { selectedDialogTab: "people" | "groups" | "links" }) =>
        useItemLinkPermissionApiRequestState({
          open: true,
          driveId: "drive-a",
          itemId: "item-a",
          resetKey: "drive-a:item-a",
          isSupportedLinkTarget: true,
          selectedDialogTab,
        }),
      {
        initialProps: {
          selectedDialogTab: "people" as const,
        },
      },
    );

    expect(listItemLinkPermissionsMock).not.toHaveBeenCalled();
    expect(result.current.originalEntries).toHaveLength(0);

    rerender({ selectedDialogTab: "links" });

    await waitFor(() => {
      expect(listItemLinkPermissionsMock).toHaveBeenCalledWith(
        "drive-a",
        "item-a",
      );
    });

    expect(result.current.originalEntries).toHaveLength(1);
  });

  it("should reconcile refreshed entries and clear draft via callback", async () => {
    const resetDraftState = vi.fn();
    const { result, rerender } = renderHook(
      ({ resetKey }: { resetKey: string }) =>
        useItemLinkPermissionApiRequestState({
          open: true,
          driveId: "drive-a",
          itemId: "item-a",
          resetKey,
          isSupportedLinkTarget: true,
          selectedDialogTab: "links",
        }),
      {
        initialProps: {
          resetKey: "drive-a:item-a",
        },
      },
    );

    await waitFor(() => {
      expect(listItemLinkPermissionsMock).toHaveBeenCalledTimes(1);
    });

    const changeSet = result.current.prepareChangeSet(
      {
        ...createEmptyDraft(),
        deletedPermissionIds: ["perm-1"],
      },
      true,
    );

    expect(changeSet).not.toBeNull();

    act(() => {
      result.current.reconcileAppliedEntries([createPersistedEntry()], resetDraftState);
    });

    expect(resetDraftState).toHaveBeenCalledTimes(1);
    expect(result.current.originalEntries).toHaveLength(1);

    rerender({ resetKey: "drive-a:item-b" });

    expect(result.current.originalEntries).toHaveLength(0);
  });
});
