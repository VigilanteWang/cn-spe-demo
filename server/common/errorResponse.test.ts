import { describe, expect, it, vi } from "vitest";
import { BackendAuthError, BackendBusinessError } from "./errors";
import {
  normalizeError,
  toApiErrorResponseBody,
  withErrorHandling,
} from "./errorResponse";

describe("normalizeError", () => {
  it("should map unknown errors to internalError without leaking the raw message", () => {
    const normalizedError = normalizeError(new Error("boom"));

    expect(normalizedError.code).toBe("internalError");
    expect(normalizedError.statusCode).toBe(500);
    expect(normalizedError.message).toBe("An unexpected server error occurred.");
  });

  it("should map status-based conflicts to stable business errors", () => {
    const normalizedError = normalizeError({
      statusCode: 409,
      message: "Archive manifest not ready yet.",
    });

    expect(normalizedError.code).toBe("conflict");
    expect(normalizedError.statusCode).toBe(409);
    expect(normalizedError.message).toBe("Archive manifest not ready yet.");
  });
});

describe("toApiErrorResponseBody", () => {
  it("should serialise stable metadata", () => {
    const responseBody = toApiErrorResponseBody(
      new BackendBusinessError({
        name: "SerializableError",
        code: "serviceUnavailable",
        category: "upstream",
        message: "Temporarily unavailable.",
        statusCode: 503,
        details: { operation: "listContainers" },
        requestId: "req-503",
        retryAfterSeconds: 9,
      }),
    );

    expect(responseBody).toEqual({
      code: "serviceUnavailable",
      message: "Temporarily unavailable.",
      statusCode: 503,
      details: { operation: "listContainers" },
      requestId: "req-503",
      retryAfterSeconds: 9,
    });
  });
});

describe("withErrorHandling", () => {
  it("should send a unified error response body", async () => {
    const res = { send: vi.fn() };
    const wrappedHandler = withErrorHandling(async () => {
      throw new BackendAuthError("unauthorized", "No access token provided.", {
        statusCode: 401,
      });
    });

    await wrappedHandler({} as never, res as never);

    expect(res.send).toHaveBeenCalledWith(401, {
      code: "unauthorized",
      message: "No access token provided.",
      statusCode: 401,
      details: undefined,
      requestId: undefined,
      retryAfterSeconds: undefined,
    });
  });
});
