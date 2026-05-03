import { describe, expect, it } from "vitest";
import { mapGraphPresenceToBadgeState } from "./peopleEnrichment";

describe("mapGraphPresenceToBadgeState", () => {
  it("should map available with out of office overlay", () => {
    const result = mapGraphPresenceToBadgeState({
      availability: "Available",
      activity: "Available",
      outOfOfficeSettings: {
        isOutOfOffice: true,
      },
    });

    expect(result).toEqual({
      status: "available",
      outOfOffice: true,
    });
  });

  it("should map busy with in a call activity", () => {
    const result = mapGraphPresenceToBadgeState({
      availability: "Busy",
      activity: "InACall",
    });

    expect(result).toEqual({
      status: "busy",
      outOfOffice: false,
    });
  });

  it("should map busy with in a meeting activity", () => {
    const result = mapGraphPresenceToBadgeState({
      availability: "Busy",
      activity: "InAMeeting",
    });

    expect(result).toEqual({
      status: "busy",
      outOfOffice: false,
    });
  });

  it("should map do not disturb family with presenting", () => {
    const result = mapGraphPresenceToBadgeState({
      availability: "DoNotDisturb",
      activity: "Presenting",
    });

    expect(result).toEqual({
      status: "do-not-disturb",
      outOfOffice: false,
    });
  });

  it("should map focusing to do not disturb", () => {
    const result = mapGraphPresenceToBadgeState({
      availability: "Focusing",
      activity: "Focusing",
    });

    expect(result).toEqual({
      status: "do-not-disturb",
      outOfOffice: false,
    });
  });

  it("should map offline and presence unknown to offline", () => {
    const offlineResult = mapGraphPresenceToBadgeState({
      availability: "Offline",
    });

    const unknownResult = mapGraphPresenceToBadgeState({
      availability: "PresenceUnknown",
    });

    expect(offlineResult).toEqual({
      status: "offline",
      outOfOffice: false,
    });
    expect(unknownResult).toEqual({
      status: "offline",
      outOfOffice: false,
    });
  });

  it("should fallback to unknown for unrecognized values", () => {
    const result = mapGraphPresenceToBadgeState({
      availability: "TotallyNewStatus",
      activity: "AnotherNewStatus",
    });

    expect(result).toEqual({
      status: "unknown",
      outOfOffice: false,
    });
  });

  it("should detect out of office from activity token", () => {
    const result = mapGraphPresenceToBadgeState({
      availability: "Busy",
      activity: "OutOfOffice",
    });

    expect(result).toEqual({
      status: "busy",
      outOfOffice: true,
    });
  });
});
