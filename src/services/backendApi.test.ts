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
          code: "throttled",
          message: "Container request was throttled.",
          statusCode: 429,
          requestId: "req-backend-429",
          retryAfterSeconds: 15,
          details: {
            scope: "containers",
          },
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
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
      details: {
        scope: "containers",
      },
    });
  });
});
