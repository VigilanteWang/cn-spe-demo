import { describe, expect, it } from "vitest";
import {
  createMissingPreviewTargetError,
  createPreviewLoadFailedError,
  createPreviewUnavailableError,
} from "./previewErrors";

describe("previewErrors", () => {
  it("should build a standardized validation error for missing preview targets", () => {
    const error = createMissingPreviewTargetError();

    expect(error.code).toBe("missingPreviewTarget");
    expect(error.category).toBe("validation");
    expect(error.message).toBe("Unable to get drive or file information.");
  });

  it("should build a standardized api error for unavailable previews", () => {
    const error = createPreviewUnavailableError();

    expect(error.code).toBe("previewUnavailable");
    expect(error.category).toBe("api");
    expect(error.message).toBe("Preview not available for this file.");
  });

  it("should build a standardized api error for preview load failures", () => {
    const error = createPreviewLoadFailedError();

    expect(error.code).toBe("previewLoadFailed");
    expect(error.category).toBe("api");
    expect(error.message).toBe("Failed to load preview.");
  });
});
