import { describe, expect, it, vi } from "vitest";
import { BackendAuthError, BackendError } from "./errorDefinitions";
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
    expect(normalizedError.message).toBe(
      "An unexpected server error occurred.",
    );
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
      new BackendError({
        name: "SerializableError",
        code: "serviceUnavailable",
        category: "graph",
        source: "graph",
        message: "Temporarily unavailable.",
        statusCode: 503,
        context: { operation: "listContainers" },
        requestId: "req-503",
        retryAfterSeconds: 9,
        originError: { service: "microsoft-graph", status: 503 },
      }),
    );

    expect(responseBody).toEqual({
      error: {
        code: "serviceUnavailable",
        message: "Temporarily unavailable.",
        statusCode: 503,
        category: "graph",
        source: "graph",
        details: undefined,
        context: { operation: "listContainers" },
        requestId: "req-503",
        originError: { service: "microsoft-graph", status: 503 },
      },
    });
  });
});

describe("withErrorHandling", () => {
  it("should send a unified error response body", async () => {
    const res = { send: vi.fn(), header: vi.fn() };
    const wrappedHandler = withErrorHandling(async () => {
      throw new BackendAuthError("unauthorized", "No access token provided.", {
        statusCode: 401,
      });
    });

    await wrappedHandler({} as never, res as never);

    expect(res.send).toHaveBeenCalledWith(401, {
      error: {
        code: "unauthorized",
        message: "No access token provided.",
        statusCode: 401,
        category: "auth",
        source: "backend",
        details: undefined,
        context: undefined,
        requestId: undefined,
        originError: undefined,
      },
    });
  });
});
