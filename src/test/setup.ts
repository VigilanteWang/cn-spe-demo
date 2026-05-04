import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

const nodeFilterShim = {
  FILTER_ACCEPT: 1,
  FILTER_REJECT: 2,
  FILTER_SKIP: 3,
  SHOW_ALL: 0xffffffff,
  SHOW_ELEMENT: 0x1,
  SHOW_TEXT: 0x4,
} as typeof NodeFilter;

/**
 * 为 jsdom 环境补齐 Tabster 依赖的 NodeFilter。
 *
 * 说明：
 * - 统一通过共享 setup 注入，避免每个测试文件各自兜底。
 * - 这里既补全运行时全局标识符，也补全 window 上的同名属性。
 */
vi.stubGlobal("NodeFilter", nodeFilterShim);

if (typeof window !== "undefined") {
  Object.defineProperty(window, "NodeFilter", {
    value: nodeFilterShim,
    configurable: true,
    writable: true,
  });
}
