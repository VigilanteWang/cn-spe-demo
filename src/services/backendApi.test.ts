import { describe, expect, it, vi } from "vitest";
import { listContainers } from "./backendApi";
import { sendAuthorizedRequest } from "./apiClient";

vi.mock("./apiClient", () => ({
  sendAuthorizedRequest: vi.fn(),
}));

const sendAuthorizedRequestMock = vi.mocked(sendAuthorizedRequest);

describe("backendApi", () => {
  it("should preserve structured backend error fields when listContainers fails", async () => {
    sendAuthorizedRequestMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "throttled",
            message: "Container request was throttled.",
            statusCode: 429,
            category: "graph",
            source: "graph",
            requestId: "req-backend-429",
            context: {
              scope: "containers",
            },
            originError: {
              service: "microsoft-graph",
              status: 429,
            },
          },
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "15",
          },
        },
      ),
    );

    await expect(listContainers()).rejects.toMatchObject({
      name: "BackendRequestError",
      code: "throttled",
      message: "Container request was throttled.",
      statusCode: 429,
      requestId: "req-backend-429",
      retryAfterSeconds: 15,
      context: {
        scope: "containers",
      },
      source: "graph",
      category: "graph",
      originError: {
        service: "microsoft-graph",
        status: 429,
      },
    });
  });
});
