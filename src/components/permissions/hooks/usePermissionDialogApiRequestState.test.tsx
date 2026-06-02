// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePermissionDialogApiRequestState } from "./usePermissionDialogApiRequestState";

interface ITestEntriesByTab {
  people: string[];
  groups: string[];
}

interface ITestChanges {
  create: string[];
  update: string[];
  remove: string[];
}

interface ITestHookOptions {
  open: boolean;
  isTargetReady: boolean;
  searchError: unknown;
  resourceLabel: "container" | "item";
  createEmptyEntriesByTab: () => ITestEntriesByTab;
  originalEntriesByTab: ITestEntriesByTab;
  draftEntriesByTab: ITestEntriesByTab;
  replaceEntries: (entriesByTab: ITestEntriesByTab) => void;
  loadPermissions: () => Promise<ITestEntriesByTab>;
  computeChanges: (
    originalEntriesByTab: ITestEntriesByTab,
    draftEntriesByTab: ITestEntriesByTab,
  ) => ITestChanges;
  applyChanges: (changes: ITestChanges) => Promise<ITestEntriesByTab>;
}

const createEntriesByTab = (): ITestEntriesByTab => ({
  people: [],
  groups: [],
});

const createChanges = (): ITestChanges => ({
  create: ["person-a"],
  update: [],
  remove: [],
});

const createOptions = (
  overrides: Partial<ITestHookOptions> = {},
): ITestHookOptions => {
  const replaceEntries = vi.fn();
  const loadPermissions = vi.fn().mockResolvedValue(createEntriesByTab());
  const computeChanges = vi.fn().mockReturnValue(createChanges());
  const applyChanges = vi.fn().mockResolvedValue(createEntriesByTab());

  return {
    open: true,
    isTargetReady: true,
    searchError: null,
    resourceLabel: "item",
    createEmptyEntriesByTab: createEntriesByTab,
    originalEntriesByTab: createEntriesByTab(),
    draftEntriesByTab: createEntriesByTab(),
    replaceEntries,
    loadPermissions,
    computeChanges,
    applyChanges,
    ...overrides,
  };
};

describe("usePermissionDialogApiRequestState", () => {
  it("should reset to empty entries and surface a resource-specific message when the target is missing", async () => {
    const options = createOptions({
      isTargetReady: false,
      resourceLabel: "container",
    });

    const { result } = renderHook(() =>
      usePermissionDialogApiRequestState(options),
    );

    await waitFor(() => {
      expect(options.replaceEntries).toHaveBeenCalledWith(createEntriesByTab());
    });

    expect(result.current.permissionErrorMessages).toEqual([
      "Api Error: PermissionValidationError: No container selected.",
    ]);
  });

  it("should load permissions successfully when the dialog opens", async () => {
    const entriesByTab = {
      people: ["person-a"],
      groups: ["group-a"],
    };
    const options = createOptions({
      loadPermissions: vi.fn().mockResolvedValue(entriesByTab),
    });

    const { result } = renderHook(() =>
      usePermissionDialogApiRequestState(options),
    );

    await waitFor(() => {
      expect(options.replaceEntries).toHaveBeenCalledWith(entriesByTab);
    });

    expect(result.current.isLoadingPermissions).toBe(false);
    expect(result.current.permissionErrorMessages).toEqual([]);
  });

  it("should surface a load error and reset to empty entries when loading fails", async () => {
    const options = createOptions({
      loadPermissions: vi.fn().mockRejectedValue(new Error("load failed")),
    });

    const { result } = renderHook(() =>
      usePermissionDialogApiRequestState(options),
    );

    await waitFor(() => {
      expect(result.current.permissionErrorMessages).toEqual([
        "Api Error: Error: load failed",
      ]);
    });

    expect(options.replaceEntries).toHaveBeenCalledWith(createEntriesByTab());
    expect(result.current.isLoadingPermissions).toBe(false);
  });

  it("should compute and apply changes successfully with the refreshed result", async () => {
    const refreshedEntries = {
      people: ["person-b"],
      groups: [],
    };
    const originalEntriesByTab = {
      people: ["person-a"],
      groups: [],
    };
    const draftEntriesByTab = {
      people: ["person-a", "person-b"],
      groups: [],
    };
    const options = createOptions({
      open: false,
      originalEntriesByTab,
      draftEntriesByTab,
      applyChanges: vi.fn().mockResolvedValue(refreshedEntries),
    });

    const { result } = renderHook(() =>
      usePermissionDialogApiRequestState(options),
    );

    await act(async () => {
      await result.current.handleApply();
    });

    expect(options.computeChanges).toHaveBeenCalledWith(
      originalEntriesByTab,
      draftEntriesByTab,
    );
    expect(options.applyChanges).toHaveBeenCalledWith(createChanges());
    expect(options.replaceEntries).toHaveBeenCalledWith(refreshedEntries);
    expect(result.current.applyFeedbackStatus).toBe("success");
  });

  it("should skip apply when the computed change set is empty", async () => {
    const options = createOptions({
      open: false,
      computeChanges: vi.fn().mockReturnValue({
        create: [],
        update: [],
        remove: [],
      }),
    });

    const { result } = renderHook(() =>
      usePermissionDialogApiRequestState(options),
    );

    await act(async () => {
      await result.current.handleApply();
    });

    expect(options.applyChanges).not.toHaveBeenCalled();
    expect(result.current.applyFeedbackStatus).toBeNull();
  });

  it("should keep the draft baseline untouched when apply fails", async () => {
    const options = createOptions({
      open: false,
      applyChanges: vi.fn().mockRejectedValue(new Error("apply failed")),
    });

    const { result } = renderHook(() =>
      usePermissionDialogApiRequestState(options),
    );

    await act(async () => {
      await result.current.handleApply();
    });

    expect(options.replaceEntries).not.toHaveBeenCalled();
    expect(result.current.applyFeedbackStatus).toBe("error");
    expect(result.current.permissionErrorMessages).toEqual([
      "Api Error: Error: apply failed",
    ]);
  });

  it("should expose missing target through the shared validation-error path", async () => {
    const options = createOptions({
      isTargetReady: false,
      resourceLabel: "item",
    });

    const { result } = renderHook(() =>
      usePermissionDialogApiRequestState(options),
    );

    await waitFor(() => {
      expect(options.replaceEntries).toHaveBeenCalledWith(createEntriesByTab());
    });

    expect(result.current.permissionRequestErrorMessage).toBe(
      "PermissionValidationError: No item selected.",
    );
    expect(result.current.permissionErrorMessages).toEqual([
      "Api Error: PermissionValidationError: No item selected.",
    ]);
  });
});
