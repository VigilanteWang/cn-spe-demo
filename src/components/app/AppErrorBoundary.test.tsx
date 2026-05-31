// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { AppErrorBoundary } from "./AppErrorBoundary";

const ThrowOnRender = () => {
  throw new Error("Render exploded.");
};

describe("AppErrorBoundary", () => {
  it("should show the original render error message in the fallback UI", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    render(
      <FluentProvider theme={webLightTheme}>
        <AppErrorBoundary>
          <ThrowOnRender />
        </AppErrorBoundary>
      </FluentProvider>,
    );

    expect(
      screen.getByText("Application render failed"),
    ).toBeInTheDocument();
    expect(screen.getByText("Render exploded.")).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
