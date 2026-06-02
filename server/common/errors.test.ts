import { describe, expect, it } from "vitest";
import { BackendError } from "./errorDefinitions";
import { toBackendGraphError } from "./errorUtils";

const createHeadersLike = (entries: Record<string, string>) => ({
  get: (name: string) => entries[name],
});

describe("toBackendGraphError", () => {
  it("should map 429 errors with Retry-After and request id", () => {
    const mappedError = toBackendGraphError(
      Object.assign(new Error("Retry attempts exhausted"), {
        statusCode: 429,
        headers: createHeadersLike({
          "Retry-After": "12",
          "request-id": "req-429",
        }),
      }),
    );

    expect(mappedError.code).toBe("throttled");
    expect(mappedError.statusCode).toBe(429);
    expect(mappedError.retryAfterSeconds).toBe(12);
    expect(mappedError.requestId).toBe("req-429");
  });

  it("should fall back to response headers when the first header container is empty", () => {
    const mappedError = toBackendGraphError(
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

    expect(mappedError.retryAfterSeconds).toBe(7);
    expect(mappedError.requestId).toBe("response-req-429");
  });

  it("should preserve innerError message in originError when available", () => {
    const mappedError = toBackendGraphError({
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

    expect(mappedError.originError).toEqual({
      service: "microsoft-graph",
      code: "serviceUnavailable",
      innerErrorCode: "timeout",
      innerErrorMessage: "The upstream request timed out.",
      status: 503,
    });
  });

  it("should preserve the original Graph message when no richer payload is available", () => {
    const mappedError = toBackendGraphError(
      Object.assign(new Error("Retry attempts exhausted"), {
        statusCode: 429,
      }),
      {
        failureMessage: "Unable to list containers.",
        operationDescription: "container list",
      },
    );

    expect(mappedError.message).toBe("Retry attempts exhausted");
  });

  it("should keep an existing graph error instance", () => {
    const existingError = new BackendError({
      name: "ExistingError",
      code: "graphFailure",
      category: "graph",
      source: "graph",
      message: "Already normalised",
      statusCode: 502,
    });

    const mappedError = toBackendGraphError(existingError);

    expect(mappedError).toBe(existingError);
  });
});
