import { beforeEach, describe, expect, it, vi } from "vitest";
import { withErrorHandling } from "./common/errorResponse";
import { listContainers } from "./listContainers";

const createHeadersLike = (entries: Record<string, string>) =>
  new Headers(entries);

const authMocks = vi.hoisted(() => ({
  requireContainerManageRequest: vi.fn(),
  getGraphOBOToken: vi.fn(),
  createGraphClient: vi.fn(),
}));

vi.mock("./auth", () => authMocks);
vi.mock("./config", () => ({
  serverConfig: { containerTypeId: "container-type-id" },
}));

describe("listContainers error handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authMocks.requireContainerManageRequest.mockResolvedValue({
      token: "user-token",
    });
    authMocks.getGraphOBOToken.mockResolvedValue("graph-token");
  });

  it("should return throttled error metadata for Graph 429 failures", async () => {
    authMocks.createGraphClient.mockReturnValue({
      api: vi.fn().mockReturnValue({
        version: vi.fn().mockReturnValue({
          filter: vi.fn().mockReturnValue({
            get: vi.fn().mockRejectedValue(
              Object.assign(new Error("Retry attempts exhausted"), {
                statusCode: 429,
                headers: createHeadersLike({
                  "Retry-After": "12",
                  "request-id": "req-429",
                }),
              }),
            ),
          }),
        }),
      }),
    });

    const req = {};
    const res = { send: vi.fn(), header: vi.fn() };

    await withErrorHandling(listContainers)(req as never, res as never);

    expect(res.send).toHaveBeenCalledWith(
      429,
      expect.objectContaining({
        error: expect.objectContaining({
          name: "GraphError",
          message: "Retry attempts exhausted",
          statusCode: 429,
          originError: expect.objectContaining({
            source: "microsoft-graph",
            requestId: "req-429",
            retryAfter: 12,
          }),
        }),
      }),
    );
    expect(res.header).toHaveBeenCalledWith("Retry-After", "12");
  });

  it("should keep local request-construction failures out of GraphError", async () => {
    authMocks.createGraphClient.mockReturnValue({
      api: vi.fn().mockReturnValue({
        version: vi.fn().mockReturnValue({
          filter: vi.fn(() => {
            throw new Error("filter build failed");
          }),
        }),
      }),
    });

    const req = {};
    const res = { send: vi.fn(), header: vi.fn() };

    await withErrorHandling(listContainers)(req as never, res as never);

    expect(res.send).toHaveBeenCalledWith(
      500,
      expect.objectContaining({
        error: expect.objectContaining({
          name: "Error",
          message: "filter build failed",
          statusCode: 500,
        }),
      }),
    );
    expect(res.send).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        error: expect.objectContaining({ name: "GraphError" }),
      }),
    );
  });
});
