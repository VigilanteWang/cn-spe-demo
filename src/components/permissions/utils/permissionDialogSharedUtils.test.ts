import { describe, expect, it } from "vitest";
import {
  buildPermissionErrorMessages,
  getPermissionTabTitle,
} from "./permissionDialogSharedUtils";

describe("permissionDialogSharedUtils", () => {
  it("should return the shared tab title for each permission tab", () => {
    expect(getPermissionTabTitle("people")).toBe("People");
    expect(getPermissionTabTitle("groups")).toBe("Groups");
  });

  it("should build merged api and search status messages", () => {
    expect(
      buildPermissionErrorMessages(
        "Unable to load permissions.",
        new Error("Directory unavailable."),
      ),
    ).toEqual([
      "Api Error: Unable to load permissions.",
      "Search Error: Directory unavailable.",
    ]);
  });
});
