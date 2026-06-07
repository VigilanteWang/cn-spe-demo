import { describe, expect, it } from "vitest";
import { AppError } from "../../common/appError";
import { sendGraphRequest, toGraphAppError } from "./appErrorHelpers";

const createHeadersLike = (entries: Record<string, string>) => ({
  get: (name: string) => entries[name],
});

describe("toGraphAppError", () => {
  it("should preserve Retry-After and request id from 429 responses", () => {
    const mappedError = toGraphAppError(
      Object.assign(new Error("Retry attempts exhausted"), {
        statusCode: 429,
        headers: createHeadersLike({
          "Retry-After": "12",
          "request-id": "req-429",
        }),
      }),
    );

    expect(mappedError.code).toBeUndefined();
    expect(mappedError.statusCode).toBe(429);
    expect(mappedError.originError?.retryAfter).toBe(12);
    expect(mappedError.originError?.requestId).toBe("req-429");
  });

  it("should fall back to response headers when the first header container is empty", () => {
    const mappedError = toGraphAppError(
      Object.assign(new Error("Retry attempts exhausted"), {
        statusCode: 429,
        headers: {},
        response: {
          headers: createHeadersLike({
            "Retry-After": "7",
            "request-id": "response-req-429",
          }),
        },
      }),
    );

    expect(mappedError.originError?.retryAfter).toBe(7);
    expect(mappedError.originError?.requestId).toBe("response-req-429");
  });

  it("should preserve Graph code path and raw diagnostics when available", () => {
    const mappedError = toGraphAppError({
      error: {
        code: "serviceUnavailable",
        innerError: {
          code: "timeout",
          message: "The upstream request timed out.",
          status: 503,
        },
      },
      message: "temporary outage",
    });

    expect(mappedError.originError).toMatchObject({
      source: "microsoft-graph",
      codePath: ["serviceUnavailable", "timeout"],
      cause: {
        code: "serviceUnavailable",
      },
    });
  });

  it("should preserve the original Graph message when no richer payload is available", () => {
    const mappedError = toGraphAppError(
      Object.assign(new Error("Retry attempts exhausted"), {
        statusCode: 429,
      }),
      "Unable to list containers.",
    );

    expect(mappedError.message).toBe("Retry attempts exhausted");
  });

  it("should keep an existing graph error instance", () => {
    const existingError = new AppError({
      name: "ExistingError",
      code: "graphFailure",
      message: "Already normalised",
      statusCode: 502,
      originError: {
        source: "microsoft-graph",
      },
    });

    const mappedError = toGraphAppError(existingError, "fallback");

    expect(mappedError).toBe(existingError);
  });

  it("should map Graph request failures inside sendGraphRequest", async () => {
    await expect(
      sendGraphRequest(async () => {
        throw Object.assign(new Error("Too many requests"), {
          statusCode: 429,
          headers: createHeadersLike({
            "Retry-After": "9",
            "request-id": "exec-429",
          }),
        });
      }, "Unable to read item permissions."),
    ).rejects.toMatchObject({
      name: "GraphError",
      message: "Too many requests",
      statusCode: 429,
      originError: {
        source: "microsoft-graph",
        retryAfter: 9,
        requestId: "exec-429",
      },
    });
  });

  it("should preserve existing AppError inside sendGraphRequest", async () => {
    const existingError = new AppError({
      name: "ValidationError",
      code: "invalidRequest",
      message: "displayName is required.",
      statusCode: 400,
      originError: {
        source: "validation",
      },
    });

    await expect(
      sendGraphRequest(async () => {
        throw existingError;
      }, "fallback"),
    ).rejects.toBe(existingError);
  });
});
