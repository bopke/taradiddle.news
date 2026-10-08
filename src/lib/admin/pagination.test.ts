import { describe, expect, it } from "vitest";
import { ADMIN_PAGE_SIZE, pageWindow } from "./pagination";

describe("pageWindow", () => {
  it("defaults to the first page", () => {
    expect(pageWindow(undefined, 120)).toEqual({ page: 1, pageCount: 3, offset: 0, limit: ADMIN_PAGE_SIZE });
  });

  it("computes the offset for a later page", () => {
    expect(pageWindow("3", 120)).toMatchObject({ page: 3, offset: 2 * ADMIN_PAGE_SIZE });
  });

  it("clamps out-of-range and junk values", () => {
    expect(pageWindow("99", 120).page).toBe(3);
    expect(pageWindow("0", 120).page).toBe(1);
    expect(pageWindow("abc", 120).page).toBe(1);
    expect(pageWindow(["2", "5"], 120).page).toBe(2);
  });

  it("has one page when the list is empty", () => {
    expect(pageWindow("4", 0)).toMatchObject({ page: 1, pageCount: 1, offset: 0 });
  });
});
