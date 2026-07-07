import { describe, expect, it, vi } from "vitest";
import type { Client } from "@microsoft/microsoft-graph-client";
import { withErrorHandling } from "../../common/errorResponse";
import {
  createGraphClient,
  getGraphOBOToken,
  requireContainerAccessAsUserRequest,
} from "../../auth";
import {
  applyItemLinkPermissionsToGraph,
  listItemLinkPermissionsFromGraph,
} from "./itemLinkPermissionHandlers";

vi.mock("../../auth", () => ({
  createGraphClient: vi.fn(),
  getGraphOBOToken: vi.fn(),
  requireContainerAccessAsUserRequest: vi.fn(),
}));

describe("itemLinkPermissionHandlers", () => {
  it("should keep route-param validation errors as ValidationError", async () => {
    vi.mocked(requireContainerAccessAsUserRequest).mockResolvedValue({
      token: "access-token",
    } as Awaited<ReturnType<typeof requireContainerAccessAsUserRequest>>);

    const req = { params: {} } as Parameters<
      typeof listItemLinkPermissionsFromGraph
    >[0];
    const res = createMockResponse();

    await withErrorHandling(listItemLinkPermissionsFromGraph)(req, res);

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

  it("should require all link change arrays on apply", async () => {
    vi.mocked(requireContainerAccessAsUserRequest).mockResolvedValue({
      token: "access-token",
    } as Awaited<ReturnType<typeof requireContainerAccessAsUserRequest>>);
    vi.mocked(getGraphOBOToken).mockResolvedValue("graph-token");
    vi.mocked(createGraphClient).mockReturnValue({
      api: vi.fn(),
    } as Client);

    const req = {
      params: {
        driveId: "drive-1",
        itemId: "item-1",
      },
      body: {
        create: [],
      },
    } as Parameters<typeof applyItemLinkPermissionsToGraph>[0];
    const res = createMockResponse();

    await withErrorHandling(applyItemLinkPermissionsToGraph)(req, res);

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
});

const createMockResponse = () => ({
  header: vi.fn(),
  send: vi.fn(),
});
