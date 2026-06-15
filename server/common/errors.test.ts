import { describe, expect, it } from "vitest";
import { AppError } from "../../common/appError";
import { sendGraphRequest, toGraphAppError } from "./appErrorHelpers";

const createHeadersLike = (entries: Record<string, string>) =>
  new Headers(entries);

describe("toGraphAppError", () => {
  it("should preserve Retry-After from 429 responses", () => {
    const mappedError = toGraphAppError(
      Object.assign(new Error("Retry attempts exhausted"), {
        statusCode: 429,
        headers: createHeadersLike({
          "Retry-After": "12",
          "request-id": "req-429",
        }),
      }),
      "Unable to list containers.",
    );

    expect(mappedError.code).toBeUndefined();
    expect(mappedError.statusCode).toBe(429);
    expect(mappedError.originError?.retryAfter).toBe(12);
  });

  it("should preserve Graph code path and raw diagnostics from body json", () => {
    const mappedError = toGraphAppError(
      {
        body: JSON.stringify({
          code: "serviceUnavailable",
          message: "temporary outage",
          innerError: {
            code: "timeout",
            message: "The upstream request timed out.",
            status: 503,
          },
        }),
      },
      "temporary outage",
    );

    expect(mappedError.originError).toMatchObject({
      source: "microsoft-graph",
      codePath: ["serviceUnavailable", "timeout"],
      cause: {
        code: "serviceUnavailable",
      },
    });
  });

  it("should not infer HTTP statusCode from body innerError", () => {
    const mappedError = toGraphAppError(
      {
        body: JSON.stringify({
          code: "serviceUnavailable",
          message: "temporary outage",
          innerError: {
            code: "timeout",
            status: 503,
          },
        }),
      },
      "temporary outage",
    );

    expect(mappedError.statusCode).toBe(502);
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

  it("should keep a real Graph Error instance before HTTP serialization", () => {
    const rawDate = new Date("2026-06-15T11:43:13.000Z");
    const rawHeaders = createHeadersLike({
      "request-id": "req-keep-error",
      date: "Mon, 15 Jun 2026 11:43:13 GMT",
    });
    const mappedError = toGraphAppError(
      Object.assign(new Error("Graph request failed"), {
        statusCode: 503,
        headers: rawHeaders,
        date: rawDate,
      }),
      "Unable to create container.",
    );

    expect(mappedError.originError?.cause).toBeInstanceOf(Error);
    expect(mappedError.originError?.cause).toMatchObject({
      message: "Graph request failed",
      statusCode: 503,
      headers: rawHeaders,
      date: rawDate,
    });
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
