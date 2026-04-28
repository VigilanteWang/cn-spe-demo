import { describe, expect, it } from "vitest";
import {
  createDownloadProgressState,
  formatFileSize,
  formatPercent,
  getArchiveProgressBarValue,
  getArchiveProgressPercentText,
  getArchiveProgressText,
  toProgressValue,
} from "./filesUtils";

describe("filesUtils", () => {
  it("should format file size correctly", () => {
    expect(formatFileSize(0)).toBe("0 Bytes");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("should format percentage safely", () => {
    expect(formatPercent(1, 0)).toBe("0%");
    expect(formatPercent(25, 100)).toBe("25%");
    expect(formatPercent(200, 100)).toBe("100%");
  });

  it("should convert progress value safely", () => {
    expect(toProgressValue(1, 0)).toBe(0);
    expect(toProgressValue(10, 20)).toBe(0.5);
    expect(toProgressValue(40, 20)).toBe(1);
  });

  it("should calculate preparing progress and text", () => {
    const progress = createDownloadProgressState({
      phase: "preparing",
      backendProgress: {
        status: "preparing",
        processedFiles: 2,
        totalFiles: 4,
        currentItem: "a.txt",
        preparedBytes: 0,
        totalBytes: 0,
        errors: [],
      },
    });

    expect(getArchiveProgressBarValue(progress)).toBe(0.125);
    expect(getArchiveProgressPercentText(progress)).toBe("13%");
    expect(getArchiveProgressText(progress)).toBe("Preparing manifest: 2/4");
  });

  it("should calculate downloading text with truncation", () => {
    const progress = createDownloadProgressState({
      phase: "downloading",
      clientProgress: {
        stage: "downloading",
        totalFiles: 1,
        processedFiles: 0,
        totalBytes: 200,
        downloadedBytes: 100,
        zippedBytes: 0,
        currentItem: "very-long-file-name-that-should-be-truncated.txt",
      },
    });

    expect(getArchiveProgressBarValue(progress)).toBe(0.575);
    expect(getArchiveProgressText(progress)).toContain(
      "Downloading and zipping:",
    );
  });
});
