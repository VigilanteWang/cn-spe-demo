import { describe, expect, it, vi } from "vitest";
import { withErrorHandling } from "../../common/errorResponse";
import {
  createGraphClient,
  getGraphOBOToken,
  requireContainerManageRequest,
} from "../../auth";
import {
  applyItemLinkPermissionsToGraph,
  listItemLinkPermissionsFromGraph,
} from "./itemLinkPermissionHandlers";

vi.mock("../../auth", () => ({
  createGraphClient: vi.fn(),
  getGraphOBOToken: vi.fn(),
  requireContainerManageRequest: vi.fn(),
}));

describe("itemLinkPermissionHandlers", () => {
  it("should keep route-param validation errors as ValidationError", async () => {
    vi.mocked(requireContainerManageRequest).mockResolvedValue({
      token: "access-token",
    } as Awaited<ReturnType<typeof requireContainerManageRequest>>);

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
    vi.mocked(requireContainerManageRequest).mockResolvedValue({
      token: "access-token",
    } as Awaited<ReturnType<typeof requireContainerManageRequest>>);
    vi.mocked(getGraphOBOToken).mockResolvedValue("graph-token");
    vi.mocked(createGraphClient).mockReturnValue({
      api: vi.fn(),
    } as ReturnType<typeof createGraphClient>);

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
