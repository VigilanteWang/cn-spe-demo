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
  });

  it("should return invalidRequest when displayName is missing", async () => {
    authMocks.requireContainerManageRequest.mockResolvedValue({
      token: "user-token",
    });

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
          raw: undefined,
        },
        cause: undefined,
      },
    });
  });
});
