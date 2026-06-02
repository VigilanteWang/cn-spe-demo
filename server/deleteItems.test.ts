import { beforeEach, describe, expect, it, vi } from "vitest";
import { withErrorHandling } from "./common/errorResponse";
import { deleteItems } from "./deleteItems";

const authMocks = vi.hoisted(() => ({
  requireContainerManageRequest: vi.fn(),
  getGraphOBOToken: vi.fn(),
  createGraphClient: vi.fn(),
}));

vi.mock("./auth", () => authMocks);

describe("deleteItems error handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should return invalidRequest when itemIds is empty", async () => {
    authMocks.requireContainerManageRequest.mockResolvedValue({
      token: "user-token",
    });

    const req = {
      body: {
        containerId: "drive-id",
        itemIds: [],
      },
    } as never;
    const res = { send: vi.fn(), header: vi.fn() } as never;

    await withErrorHandling(deleteItems)(req, res);

    expect(res.send).toHaveBeenCalledWith(400, {
      error: {
        name: "ValidationError",
        code: "invalidRequest",
        message: "containerId and a non-empty itemIds array are required.",
        statusCode: 400,
        originError: {
          source: "validation",
          raw: undefined,
        },
        cause: undefined,
      },
    });
  });
});
