// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { Providers } from "@microsoft/mgt-element";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FrontendApiError } from "../../../common/errors.ts";

import { useFilesData } from "./useFilesData";

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
};

describe("useFilesData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should resolve loadItems before photo and presence enrichment completes", async () => {
    const presenceDeferred = createDeferred<{ value: [] }>();
    const photoDeferred = createDeferred<Blob>();

    const getMock = vi.fn().mockResolvedValue({
      value: [
        {
          id: "item-1",
          name: "file-a.txt",
          lastModifiedBy: {
            user: {
              id: "user-1",
              displayName: "User One",
            },
          },
        },
      ],
    });
    const postMock = vi.fn().mockReturnValue(presenceDeferred.promise);
    const apiMock = vi.fn((path: string) => {
      if (path.includes("/children")) {
        return { get: getMock };
      }

      if (path.includes("/photos/48x48/$value")) {
        return {
          responseType: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(photoDeferred.promise),
          }),
        };
      }

      if (path === "/communications/getPresencesByUserId") {
        return { post: postMock };
      }

      throw new Error(`Unexpected path: ${path}`);
    });
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
      useFilesData({
        containerId: "container-1",
      }),
    );

    let resolved = false;

    await act(async () => {
      const loadPromise = result.current.loadItems("root").then(() => {
        resolved = true;
      });

      await loadPromise;
    });

    expect(resolved).toBe(true);
    expect(result.current.driveItems).toHaveLength(1);
    expect(result.current.driveItems[0].modifiedByName).toBe("User One");
    expect(postMock).toHaveBeenCalledWith({ ids: ["user-1"] });

    photoDeferred.resolve(new Blob());
    presenceDeferred.resolve({ value: [] });
  });

  it("should expose a standardized page error when the main file list load fails", async () => {
    const getMock = vi.fn().mockRejectedValue(
      Object.assign(
        new FrontendApiError("throttled", "Items request was throttled."),
        {
          retryAfterSeconds: 9,
          requestId: "req-files-load",
        },
      ),
    );
    const apiMock = vi.fn(() => ({ get: getMock }));
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
      useFilesData({
        containerId: "container-1",
      }),
    );

    let didLoad = true;

    await act(async () => {
      didLoad = await result.current.loadItems("root");
    });

    expect(didLoad).toBe(false);
    expect(result.current.driveItems).toEqual([]);
    expect(result.current.loadError?.code).toBe("throttled");
    expect(result.current.loadError?.message).toBe(
      "Items request was throttled.",
    );
  });
});
