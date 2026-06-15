import { describe, expect, it } from "vitest";
import { serializeUnknownValue } from "./appError";

describe("serializeUnknownValue", () => {
  it("should replace self-referential object links with [Circular]", () => {
    const input: Record<string, unknown> = {
      name: "loop-object",
    };
    input.self = input;

    const output = serializeUnknownValue(input) as Record<string, unknown>;

    expect(output).toMatchObject({
      name: "loop-object",
      self: "[Circular]",
    });
  });

  it("should replace self-referential array links with [Circular]", () => {
    const input: unknown[] = ["loop-array"];
    input.push(input);

    const output = serializeUnknownValue(input) as unknown[];

    expect(output).toEqual(["loop-array", "[Circular]"]);
  });

  it("should convert Date instances into ISO strings", () => {
    const input = new Date("2026-06-15T11:43:13.000Z");

    const output = serializeUnknownValue(input);

    expect(output).toBe("2026-06-15T11:43:13.000Z");
  });
});
