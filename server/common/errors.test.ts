import { describe, expect, it } from "vitest";
import {
  BackendBusinessError,
  toBackendUpstreamError,
} from "./errors";

describe("toBackendUpstreamError", () => {
  it("should map 429 errors with Retry-After and request id", () => {
    const mappedError = toBackendUpstreamError(
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

  it("should keep an existing upstream error instance", () => {
    const existingError = new BackendBusinessError({
      name: "ExistingError",
      code: "upstreamFailure",
      category: "upstream",
      message: "Already normalised",
      statusCode: 502,
    });

    const mappedError = toBackendUpstreamError(existingError);

    expect(mappedError).toBe(existingError);
  });
});
