import { describe, expect, it } from "vitest";
import { formatDateTimeColumnValue } from "./dateTime";

describe("formatDateTimeColumnValue", () => {
  const nowMs = new Date("2026-05-03T12:00:00Z").getTime();

  it("should format recent seconds", () => {
    expect(formatDateTimeColumnValue("2026-05-03T11:59:30Z", nowMs)).toBe(
      "30 sec ago",
    );
  });

  it("should format recent minutes", () => {
    expect(formatDateTimeColumnValue("2026-05-03T11:45:00Z", nowMs)).toBe(
      "15 min ago",
    );
  });

  it("should format recent hours", () => {
    expect(formatDateTimeColumnValue("2026-05-03T10:00:00Z", nowMs)).toBe(
      "2 hours ago",
    );
  });

  it("should format older timestamps as date only", () => {
    expect(formatDateTimeColumnValue("2026-05-01T10:00:00Z", nowMs)).toBe(
      new Date("2026-05-01T10:00:00Z").toLocaleDateString(),
    );
  });
});
