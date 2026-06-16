import { beforeEach, describe, expect, it, vi } from "vitest";
import { withErrorHandling } from "./common/errorResponse";
import { createContainer } from "./createContainer";

const authMocks = vi.hoisted(() => ({
  requireContainerManageRequest: vi.fn(),
  getGraphOBOToken: vi.fn(),
  createGraphClient: vi.fn(),
}));

vi.mock("./auth", () => authMocks);
vi.mock("./config", () => ({
  serverConfig: { containerTypeId: "container-type-id" },
}));

describe("createContainer error handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authMocks.requireContainerManageRequest.mockResolvedValue({
      token: "user-token",
    });
    authMocks.getGraphOBOToken.mockResolvedValue("graph-token");
  });

  it("should return invalidRequest when displayName is missing", async () => {
    const req = { body: {} } as never;
    const res = { send: vi.fn(), header: vi.fn() } as never;

    await withErrorHandling(createContainer)(req, res);

    expect(res.send).toHaveBeenCalledWith(400, {
      error: {
        name: "ValidationError",
        code: "invalidRequest",
        message: "displayName is required.",
        statusCode: 400,
        originError: {
          source: "validation",
          cause: undefined,
        },
        details: undefined,
      },
    });
  });

  it("should keep local request-body construction failures out of GraphError", async () => {
    authMocks.createGraphClient.mockReturnValue({
      api: vi.fn(),
    });

    const body = {
      displayName: "Demo Container",
      get description() {
        throw new Error("description boom");
      },
    };
    const req = { body } as never;
    const res = { send: vi.fn(), header: vi.fn() } as never;

    await withErrorHandling(createContainer)(req, res);

    expect(res.send).toHaveBeenCalledWith(
      500,
      expect.objectContaining({
        error: expect.objectContaining({
          name: "Error",
          message: "description boom",
          statusCode: 500,
        }),
      }),
    );
  });

  it("should still map Graph post failures to GraphError", async () => {
    const post = vi.fn().mockRejectedValue(
      Object.assign(new Error("post failed"), {
        statusCode: 503,
      }),
    );
    authMocks.createGraphClient.mockReturnValue({
      api: vi.fn().mockReturnValue({
        version: vi.fn().mockReturnValue({
          post,
        }),
      }),
    });

    const req = {
      body: {
        displayName: "Demo Container",
        description: "desc",
      },
    } as never;
    const res = { send: vi.fn(), header: vi.fn() } as never;

    await withErrorHandling(createContainer)(req, res);

    expect(res.send).toHaveBeenCalledWith(
      503,
      expect.objectContaining({
        error: expect.objectContaining({
          name: "GraphError",
          message: "post failed",
          statusCode: 503,
        }),
      }),
    );
  });
});
