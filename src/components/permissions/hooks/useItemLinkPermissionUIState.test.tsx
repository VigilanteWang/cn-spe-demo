// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { IItemLinkPermissionEntryForUI } from "../../../../common/contracts/itemPermissionCommonContracts";
import { useItemLinkPermissionUIState } from "./useItemLinkPermissionUIState";

const createPersistedEntry = (
  overrides: Partial<IItemLinkPermissionEntryForUI> = {},
): IItemLinkPermissionEntryForUI => ({
  id: "link-1",
  permissionId: "perm-1",
  shareId: "share-1",
  webUrl: "https://contoso.example/link-1",
  scope: "users",
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

describe("useItemLinkPermissionUIState", () => {
  it("should auto-create a users link draft entry that the panel can expand", () => {
    const { result } = renderHook(() =>
      useItemLinkPermissionUIState({
        resetKey: "drive-a:item-a",
        originalEntries: [],
      }),
    );

    act(() => {
      result.current.setCreateLinkScope("users");
    });

    act(() => {
      result.current.onAddLink();
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]).toMatchObject({
      source: "draft",
      scope: "users",
      hasValidationError: true,
    });
  });

  it("should clear local draft state after resetDraftState", () => {
    const { result } = renderHook(() =>
      useItemLinkPermissionUIState({
        resetKey: "drive-a:item-a",
        originalEntries: [createPersistedEntry()],
      }),
    );

    act(() => {
      result.current.onDeleteLink(result.current.entries[0]);
    });

    expect(result.current.hasUnsavedChanges).toBe(true);

    act(() => {
      result.current.resetDraftState();
    });

    expect(result.current.hasUnsavedChanges).toBe(false);
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]).toMatchObject({
      source: "persisted",
      permissionId: "perm-1",
    });
  });
});
