import { describe, expect, it } from "vitest";
import { readGraphErrorMessage } from "./errorUtils";

describe("readGraphErrorMessage", () => {
  it("should prefer nested Graph body error messages", () => {
    expect(
      readGraphErrorMessage({
        body: {
          error: {
            message: "Graph body message",
          },
        },
        message: "top-level message",
      }),
    ).toBe("Graph body message");
  });

  it("should read direct nested error messages when body.error is absent", () => {
    expect(
      readGraphErrorMessage({
        error: {
          message: "Direct nested Graph message",
        },
        message: "top-level message",
      }),
    ).toBe("Direct nested Graph message");
  });

  it("should preserve native Error messages", () => {
    expect(readGraphErrorMessage(new Error("Retry attempts exhausted"))).toBe(
      "Retry attempts exhausted",
    );
  });

  it("should fall back to a top-level message", () => {
    expect(
      readGraphErrorMessage({
        message: "temporary outage",
      }),
    ).toBe("temporary outage");
  });

  it("should use the stable fallback when no message is available", () => {
    expect(readGraphErrorMessage({})).toBe(
      "The request still failed after the SDK retry policy completed.",
    );
  });
});
