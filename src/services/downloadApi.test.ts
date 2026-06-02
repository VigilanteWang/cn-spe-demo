import { describe, expect, it, vi } from "vitest";
import { getDownloadProgress, startDownload } from "./downloadApi";
import { sendAuthorizedRequest } from "./apiClient";

vi.mock("./apiClient", () => ({
  sendAuthorizedRequest: vi.fn(),
}));

const sendAuthorizedRequestMock = vi.mocked(sendAuthorizedRequest);

describe("downloadApi", () => {
  it("should preserve structured backend error fields when startDownload fails", async () => {
    sendAuthorizedRequestMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            name: "ArchiveRequestError",
            code: "throttled",
            message: "Archive preparation was throttled.",
            statusCode: 429,
            originError: {
              source: "microsoft-graph",
              requestId: "req-download-429",
            },
          },
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "9",
          },
        },
      ),
    );

    await expect(
      startDownload("container-a", ["item-a"]),
    ).rejects.toMatchObject({
      name: "ArchiveRequestError",
      code: "throttled",
      message: "Archive preparation was throttled.",
      statusCode: 429,
      originError: {
        source: "microsoft-graph",
        requestId: "req-download-429",
        retryAfter: 9,
      },
    });
  });

  it("should fall back to operation and status when progress error body is not structured json", async () => {
    sendAuthorizedRequestMock.mockResolvedValueOnce(
      new Response("server exploded", {
        status: 500,
        headers: {
          "Content-Type": "text/plain",
        },
      }),
    );

    await expect(getDownloadProgress("job-a")).rejects.toMatchObject({
      name: "ArchiveRequestError",
      message: "getDownloadProgress failed: 500",
      statusCode: 500,
    });
  });
});
