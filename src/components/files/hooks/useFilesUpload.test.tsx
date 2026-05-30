// @vitest-environment jsdom
import type { ChangeEvent } from "react";
import { act, renderHook } from "@testing-library/react";
import { Providers } from "@microsoft/mgt-element";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFilesUpload } from "./useFilesUpload";

const createFileList = (files: File[]): FileList =>
  ({
    length: files.length,
    item: (index: number) => files[index] ?? null,
    ...files,
  }) as unknown as FileList;

describe("useFilesUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should expose a standardized upload error instead of only logging failures", async () => {
    const putStreamMock = vi
      .fn()
      .mockRejectedValue(new Error("Graph upload request failed."));
    const apiMock = vi.fn(() => ({
      putStream: putStreamMock,
    }));
    const reloadCurrentFolder = vi.fn().mockResolvedValue(true);
    Providers.globalProvider = {
      onStateChanged: vi.fn(),
      addStateChangedHandler: vi.fn(),
      removeStateChangedHandler: vi.fn(),
      graph: {
        client: {
          api: apiMock,
        },
      },
    } as never;

    const { result } = renderHook(() =>
      useFilesUpload({
        containerId: "container-1",
        currentFolderId: "root",
        reloadCurrentFolder,
      }),
    );

    const file = new File(["report"], "report.txt", {
      type: "text/plain",
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    });

    const event = {
      target: {
        files: createFileList([file]),
        value: "picked-file",
      },
    } as ChangeEvent<HTMLInputElement>;

    await act(async () => {
      await result.current.onUploadFileSelected(event);
    });

    expect(result.current.uploadProgress.isUploading).toBe(false);
    expect(result.current.uploadProgress.isCompleted).toBe(true);
    expect(result.current.uploadProgress.failedFiles).toBe(1);
    expect(result.current.uploadProgress.error?.code).toBe("uploadFileFailed");
    expect(result.current.uploadProgress.error?.message).toBe(
      "Failed to upload file report.txt: Graph upload request failed.",
    );
    expect(reloadCurrentFolder).toHaveBeenCalledTimes(1);
    expect(event.target.value).toBe("");
  });
});
