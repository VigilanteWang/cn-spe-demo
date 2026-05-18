import { beforeEach, describe, expect, it, vi } from "vitest";
import { withErrorHandling } from "./common/errorResponse";
import { listContainers } from "./listContainers";

const authMocks = vi.hoisted(() => ({
  requireContainerManageRequest: vi.fn(),
  getGraphToken: vi.fn(),
  createGraphClient: vi.fn(),
}));

vi.mock("./auth", () => authMocks);
vi.mock("./config", () => ({
  serverConfig: { containerTypeId: "container-type-id" },
}));

describe("listContainers error handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should return throttled error metadata for Graph 429 failures", async () => {
    authMocks.requireContainerManageRequest.mockResolvedValue({ token: "user-token" });
    authMocks.getGraphToken.mockResolvedValue("graph-token");
    authMocks.createGraphClient.mockReturnValue({
      api: vi.fn().mockReturnValue({
        version: vi.fn().mockReturnValue({
          filter: vi.fn().mockReturnValue({
            get: vi.fn().mockRejectedValue(
              Object.assign(new Error("Retry attempts exhausted"), {
                statusCode: 429,
                headers: {
                  "Retry-After": "12",
                  "request-id": "req-429",
                },
              }),
            ),
          }),
        }),
      }),
    });

    const req = {} as never;
    const res = { send: vi.fn() } as never;

    await withErrorHandling(listContainers)(req, res);

    expect(res.send).toHaveBeenCalledWith(429, {
      code: "throttled",
      message:
        "Microsoft Graph throttled the container list request after retries were exhausted.",
      statusCode: 429,
      details: undefined,
      requestId: "req-429",
      retryAfterSeconds: 12,
    });
  });
});
