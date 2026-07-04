// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { Providers } from "@microsoft/mgt-element";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFilesFolderCreation } from "./useFilesFolderCreation";

describe("useFilesFolderCreation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a folder, reload the current folder, and reset the input", async () => {
    const postMock = vi.fn().mockResolvedValue({});
    const reloadCurrentFolder = vi.fn().mockResolvedValue(true);

    Providers.globalProvider = {
      onStateChanged: vi.fn(),
      addStateChangedHandler: vi.fn(),
      removeStateChangedHandler: vi.fn(),
      graph: {
        client: {
          api: vi.fn(() => ({
            post: postMock,
          })),
        },
      },
    } as never;

    const { result } = renderHook(() =>
      useFilesFolderCreation({
        containerId: "container-1",
        folderId: "root",
        reloadCurrentFolder,
      }),
    );

    act(() => {
      result.current.onFolderNameChange({} as never, { value: "Reports" });
    });

    let didCreate = false;
    await act(async () => {
      didCreate = await result.current.createFolder();
    });

    expect(didCreate).toBe(true);
    expect(postMock).toHaveBeenCalledWith({
      name: "Reports",
      folder: {},
      "@microsoft.graph.conflictBehavior": "rename",
    });
    expect(reloadCurrentFolder).toHaveBeenCalledTimes(1);
    expect(result.current.folderName).toBe("");
    expect(result.current.newFolderError).toBeNull();
  });

  it("should expose a standardized error when folder creation fails", async () => {
    const reloadCurrentFolder = vi.fn().mockResolvedValue(true);

    Providers.globalProvider = {
      onStateChanged: vi.fn(),
      addStateChangedHandler: vi.fn(),
      removeStateChangedHandler: vi.fn(),
      graph: {
        client: {
          api: vi.fn(() => ({
            post: vi.fn().mockRejectedValue(new Error("Folder exists.")),
          })),
        },
      },
    } as never;

    const { result } = renderHook(() =>
      useFilesFolderCreation({
        containerId: "container-1",
        folderId: "root",
        reloadCurrentFolder,
      }),
    );

    act(() => {
      result.current.onFolderNameChange({} as never, { value: "Reports" });
    });

    await act(async () => {
      await result.current.createFolder();
    });

    expect(result.current.newFolderError?.name).toBe("FilesCreateFolderError");
    expect(result.current.newFolderError?.message).toBe("Folder exists.");
  });

  it("should clear input and errors when resetFolderCreationState is called", async () => {
    Providers.globalProvider = {
      onStateChanged: vi.fn(),
      addStateChangedHandler: vi.fn(),
      removeStateChangedHandler: vi.fn(),
      graph: {
        client: {
          api: vi.fn(() => ({
            post: vi.fn().mockRejectedValue(new Error("Folder exists.")),
          })),
        },
      },
    } as never;

    const { result } = renderHook(() =>
      useFilesFolderCreation({
        containerId: "container-1",
        folderId: "root",
        reloadCurrentFolder: vi.fn().mockResolvedValue(true),
      }),
    );

    act(() => {
      result.current.onFolderNameChange({} as never, { value: "Reports" });
    });

    await act(async () => {
      await result.current.createFolder();
    });

    act(() => {
      result.current.resetFolderCreationState();
    });

    expect(result.current.folderName).toBe("");
    expect(result.current.newFolderError).toBeNull();
  });
});
