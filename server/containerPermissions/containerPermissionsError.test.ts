import { describe, expect, it } from "vitest";
import { mapContainerPermissionsGraphError } from "./containerPermissionsError";

describe("mapContainerPermissionsGraphError", () => {
  it("should map retry-exhausted 429 errors with Retry-After and request id", () => {
    const error = Object.assign(new Error("Retry attempts exhausted"), {
      statusCode: 429,
      headers: {
        "Retry-After": "12",
        "request-id": "req-429",
      },
    });

    const mappedError = mapContainerPermissionsGraphError(error);

    expect(mappedError.code).toBe("throttled");
    expect(mappedError.statusCode).toBe(429);
    expect(mappedError.retryAfterSeconds).toBe(12);
    expect(mappedError.requestId).toBe("req-429");
    expect(mappedError.message).toContain("SDK retries were exhausted");
  });

  it("should read request id and retry-after from innerError when headers are absent", () => {
    const mappedError = mapContainerPermissionsGraphError({
      statusCode: 503,
      error: {
        innerError: {
          requestId: "inner-503",
          retryAfterSeconds: 7,
        },
      },
      message: "temporary outage",
    });

    expect(mappedError.code).toBe("serviceUnavailable");
    expect(mappedError.requestId).toBe("inner-503");
    expect(mappedError.retryAfterSeconds).toBe(7);
  });

  it("should read header values from Headers-like get() objects", () => {
    const mappedError = mapContainerPermissionsGraphError({
      statusCode: 429,
      headers: {
        get: (name: string) => {
          if (name === "Retry-After") {
            return "5";
          }

          if (name === "request-id") {
            return "headers-like-req";
          }

          return undefined;
        },
      },
      message: "throttled",
    });

    expect(mappedError.retryAfterSeconds).toBe(5);
    expect(mappedError.requestId).toBe("headers-like-req");
  });
});
