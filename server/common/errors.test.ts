import { describe, expect, it } from "vitest";
import { BackendError, toBackendGraphError } from "./errors";

describe("toBackendGraphError", () => {
  it("should map 429 errors with Retry-After and request id", () => {
    const mappedError = toBackendGraphError(
      Object.assign(new Error("Retry attempts exhausted"), {
        statusCode: 429,
        headers: {
          "Retry-After": "12",
          "request-id": "req-429",
        },
      }),
    );

    expect(mappedError.code).toBe("throttled");
    expect(mappedError.statusCode).toBe(429);
    expect(mappedError.retryAfterSeconds).toBe(12);
    expect(mappedError.requestId).toBe("req-429");
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
