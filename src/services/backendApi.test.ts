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
            name: "GraphError",
            code: "throttled",
            message: "Container request was throttled.",
            statusCode: 429,
            originError: {
              source: "microsoft-graph",
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
      name: "GraphError",
      code: "throttled",
      message: "Container request was throttled.",
      statusCode: 429,
      originError: {
        source: "microsoft-graph",
        retryAfter: 15,
      },
    });
  });
});
