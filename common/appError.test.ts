import { describe, expect, it } from "vitest";
import { serializeUnknownCause } from "./appError";

describe("serializeUnknownCause", () => {
  it("should replace self-referential object links with [Circular]", () => {
    const input: Record<string, unknown> = {
      name: "loop-object",
    };
    input.self = input;

    const output = serializeUnknownCause(input) as Record<string, unknown>;

    expect(output).toMatchObject({
      name: "loop-object",
      self: "[Circular]",
    });
  });

  it("should replace self-referential array links with [Circular]", () => {
    const input: unknown[] = ["loop-array"];
    input.push(input);

    const output = serializeUnknownCause(input) as unknown[];

    expect(output).toEqual(["loop-array", "[Circular]"]);
  });
});
