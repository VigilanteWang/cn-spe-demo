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
});
