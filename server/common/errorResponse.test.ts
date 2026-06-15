import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../common/appError";
import { createAuthError, toGraphAppError } from "./appErrorHelpers";
import {
  normalizeError,
  toApiErrorResponseBody,
  withErrorHandling,
} from "./errorResponse";

const createHeadersLike = (entries: Record<string, string>) =>
  new Headers(entries);

describe("normalizeError", () => {
  it("should keep the original message when the unknown error already has one", () => {
    const normalizedError = normalizeError(new Error("boom"));

    expect(normalizedError.code).toBeUndefined();
    expect(normalizedError.statusCode).toBe(500);
    expect(normalizedError.message).toBe("boom");
  });

  it("should keep explicit status and message without额外推导 code", () => {
    const normalizedError = normalizeError({
      statusCode: 409,
      message: "Archive manifest not ready yet.",
    });

    expect(normalizedError.code).toBeUndefined();
    expect(normalizedError.statusCode).toBe(409);
    expect(normalizedError.message).toBe("Archive manifest not ready yet.");
  });
});

describe("toApiErrorResponseBody", () => {
  it("should serialise stable metadata", () => {
    const responseBody = toApiErrorResponseBody(
      new AppError({
        name: "SerializableError",
        code: "serviceUnavailable",
        message: "Temporarily unavailable.",
        statusCode: 503,
        details: [{ operation: "listContainers" }],
        originError: {
          source: "microsoft-graph",
          retryAfter: 9,
          cause: Object.assign(new Error("upstream failed"), {
            status: 503,
          }),
        },
      }),
    );

    expect(responseBody).toEqual({
      error: {
        name: "SerializableError",
        code: "serviceUnavailable",
        message: "Temporarily unavailable.",
        statusCode: 503,
        details: [
          {
            operation: "listContainers",
          },
        ],
        originError: {
          source: "microsoft-graph",
          retryAfter: 9,
          cause: {
            name: "Error",
            message: "upstream failed",
            stack: expect.any(String),
            status: 503,
          },
        },
      },
    });
  });

  it("should flatten Graph headers and stringify Graph date at the HTTP boundary", () => {
    const responseBody = toApiErrorResponseBody(
      toGraphAppError(
        Object.assign(new Error("Graph request failed"), {
          statusCode: 503,
          headers: createHeadersLike({
            "cache-control": "no-store, no-cache",
            "client-request-id": "client-123",
            "content-type": "application/json",
            date: "Mon, 15 Jun 2026 11:43:13 GMT",
            "request-id": "req-123",
          }),
          date: new Date("2026-06-15T11:43:13.000Z"),
          body: JSON.stringify({
            code: "serviceUnavailable",
            message: "temporary outage",
          }),
        }),
        "Unable to create container.",
      ),
    );

    expect(responseBody.error.originError).toMatchObject({
      source: "microsoft-graph",
      cause: {
        name: "Error",
        message: "Graph request failed",
        statusCode: 503,
        code: "serviceUnavailable",
        date: "2026-06-15T11:43:13.000Z",
        body: JSON.stringify({
          code: "serviceUnavailable",
          message: "temporary outage",
        }),
        headers: {
          "cache-control": "no-store, no-cache",
          "client-request-id": "client-123",
          "content-type": "application/json",
          date: "Mon, 15 Jun 2026 11:43:13 GMT",
          "request-id": "req-123",
        },
      },
    });
  });
});

describe("withErrorHandling", () => {
  it("should send a unified error response body", async () => {
    const res = { send: vi.fn(), header: vi.fn() };
    const wrappedHandler = withErrorHandling(async () => {
      throw createAuthError("unauthorized", "No access token provided.");
    });

    await wrappedHandler({} as never, res as never);

    expect(res.send).toHaveBeenCalledWith(401, {
      error: {
        name: "AuthError",
        code: "unauthorized",
        message: "No access token provided.",
        statusCode: 401,
        originError: {
          source: "app",
          cause: undefined,
        },
        details: undefined,
      },
    });
  });
});
