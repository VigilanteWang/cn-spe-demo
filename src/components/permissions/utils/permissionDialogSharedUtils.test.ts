import { describe, expect, it } from "vitest";
import { PermissionApiError } from "../../../services/permissionApiShared";
import {
  buildPermissionStatusMessages,
  formatPermissionRequestErrorMessage,
  getPermissionTabTitle,
} from "./permissionDialogSharedUtils";

describe("permissionDialogSharedUtils", () => {
  it("should return the shared tab title for each permission tab", () => {
    expect(getPermissionTabTitle("people")).toBe("People");
    expect(getPermissionTabTitle("groups")).toBe("Groups");
  });

  it("should include retry-after details for throttled permission api errors", () => {
    const error = new PermissionApiError(
      "throttled",
      "Permission request was throttled.",
      {
        retryAfterSeconds: 12,
      },
    );

    expect(
      formatPermissionRequestErrorMessage(error, "Fallback message"),
    ).toBe("Permission request was throttled. Retry after 12 seconds.");
  });

  it("should include request id details for permission api errors", () => {
    const error = new PermissionApiError(
      "graphFailure",
      "Permission request failed.",
      {
        requestId: "req-123",
      },
    );

    expect(
      formatPermissionRequestErrorMessage(error, "Fallback message"),
    ).toBe("Permission request failed. Request ID: req-123.");
  });

  it("should build merged api and search status messages", () => {
    expect(
      buildPermissionStatusMessages(
        "Unable to load permissions.",
        new Error("Directory unavailable."),
      ),
    ).toEqual([
      "Api Error: Unable to load permissions.",
      "Search Error: Directory unavailable.",
    ]);
  });
});
