import { describe, expect, it, vi } from "vitest";
import type { Client } from "@microsoft/microsoft-graph-client";
import { withErrorHandling } from "../common/errorResponse";
import {
  createGraphClient,
  getGraphOBOToken,
  requireContainerAccessAsUserRequest,
} from "../auth";
import {
  getCurrentItemVersionFromGraph,
  getItemVersionFromGraph,
  listItemVersionsFromGraph,
  restoreItemVersionFromGraph,
} from "./itemVersionHandlers";

vi.mock("../auth", () => ({
  createGraphClient: vi.fn(),
  getGraphOBOToken: vi.fn(),
  requireContainerAccessAsUserRequest: vi.fn(),
}));

describe("itemVersionHandlers", () => {
  it("should keep list route-param validation errors as ValidationError", async () => {
    vi.mocked(requireContainerAccessAsUserRequest).mockResolvedValue({
      token: "access-token",
    } as Awaited<ReturnType<typeof requireContainerAccessAsUserRequest>>);

    const req = { params: {} } as Parameters<
      typeof listItemVersionsFromGraph
    >[0];
    const res = createMockResponse();

    await withErrorHandling(listItemVersionsFromGraph)(req, res);

    expect(res.send).toHaveBeenCalledWith(
      400,
      expect.objectContaining({
        error: expect.objectContaining({
          name: "ValidationError",
          code: "invalidRequest",
        }),
      }),
    );
  });

  it("should keep single-version route-param validation errors as ValidationError", async () => {
    vi.mocked(requireContainerAccessAsUserRequest).mockResolvedValue({
      token: "access-token",
    } as Awaited<ReturnType<typeof requireContainerAccessAsUserRequest>>);

    const req = {
      params: {
        driveId: "drive-1",
        itemId: "item-1",
      },
    } as Parameters<typeof getItemVersionFromGraph>[0];
    const res = createMockResponse();

    await withErrorHandling(getItemVersionFromGraph)(req, res);

    expect(res.send).toHaveBeenCalledWith(
      400,
      expect.objectContaining({
        error: expect.objectContaining({
          name: "ValidationError",
          code: "invalidRequest",
        }),
      }),
    );
  });

  it("should keep current-version route-param validation errors as ValidationError", async () => {
    vi.mocked(requireContainerAccessAsUserRequest).mockResolvedValue({
      token: "access-token",
    } as Awaited<ReturnType<typeof requireContainerAccessAsUserRequest>>);

    const req = {
      params: {
        driveId: "drive-1",
      },
    } as Parameters<typeof getCurrentItemVersionFromGraph>[0];
    const res = createMockResponse();

    await withErrorHandling(getCurrentItemVersionFromGraph)(req, res);

    expect(res.send).toHaveBeenCalledWith(
      400,
      expect.objectContaining({
        error: expect.objectContaining({
          name: "ValidationError",
          code: "invalidRequest",
        }),
      }),
    );
  });

  it("should return 204 after restore succeeds", async () => {
    vi.mocked(requireContainerAccessAsUserRequest).mockResolvedValue({
      token: "access-token",
    } as Awaited<ReturnType<typeof requireContainerAccessAsUserRequest>>);
    vi.mocked(getGraphOBOToken).mockResolvedValue("graph-token");
    vi.mocked(createGraphClient).mockReturnValue(
      createMockGraphClient() as unknown as Client,
    );

    const req = {
      params: {
        driveId: "drive-1",
        itemId: "item-1",
        versionId: "2.0",
      },
    } as Parameters<typeof restoreItemVersionFromGraph>[0];
    const res = createMockResponse();

    await restoreItemVersionFromGraph(req, res);

    expect(res.send).toHaveBeenCalledWith(204);
  });
});

const createMockGraphClient = () => ({
  api: () => {
    const request = {
      version: () => request,
      post: async () => undefined,
    };

    return request;
  },
});

const createMockResponse = () => ({
  header: vi.fn(),
  send: vi.fn(),
});
