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
    authMocks.requireContainerManageRequest.mockResolvedValue({
      token: "user-token",
    });
    authMocks.getGraphOBOToken.mockResolvedValue("graph-token");
  });

  it("should return invalidRequest when itemIds is empty", async () => {
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
          cause: undefined,
        },
        details: undefined,
      },
    });
  });

  it("should keep single-item Graph delete failures in the failed list", async () => {
    authMocks.createGraphClient.mockReturnValue({
      api: vi.fn((path: string) => ({
        delete: vi.fn().mockImplementation(() => {
          if (path.endsWith("/item-1")) {
            throw new Error("delete failed");
          }

          return Promise.resolve();
        }),
      })),
    });

    const req = {
      body: {
        containerId: "drive-id",
        itemIds: ["item-1", "item-2"],
      },
    } as never;
    const res = { send: vi.fn(), header: vi.fn() } as never;

    await deleteItems(req, res);

    expect(res.send).toHaveBeenCalledWith(200, {
      successful: ["item-2"],
      failed: [{ id: "item-1", reason: "delete failed" }],
    });
  });

  it("should keep outer local errors out of GraphError", async () => {
    authMocks.createGraphClient.mockImplementation(() => {
      throw new Error("client init failed");
    });

    const req = {
      body: {
        containerId: "drive-id",
        itemIds: ["item-1"],
      },
    } as never;
    const res = { send: vi.fn(), header: vi.fn() } as never;

    await withErrorHandling(deleteItems)(req, res);

    expect(res.send).toHaveBeenCalledWith(
      500,
      expect.objectContaining({
        error: expect.objectContaining({
          name: "Error",
          message: "client init failed",
          statusCode: 500,
        }),
      }),
    );
  });
});
