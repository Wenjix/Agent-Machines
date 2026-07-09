import { describe, expect, it } from "vitest";

import { resolveEvalMode } from "./eval-mode";

describe("resolveEvalMode", () => {
	it("turns on and persists when ?eval=1", () => {
		expect(resolveEvalMode("1", null)).toEqual({ on: true, persist: "1" });
	});

	it("turns off and persists when ?eval=0", () => {
		expect(resolveEvalMode("0", "1")).toEqual({ on: false, persist: "0" });
	});

	it("falls back to the stored flag when no param", () => {
		expect(resolveEvalMode(null, "1")).toEqual({ on: true, persist: null });
		expect(resolveEvalMode(null, null)).toEqual({ on: false, persist: null });
	});

	it("treats any non-1/0 param as absent (stored wins)", () => {
		expect(resolveEvalMode("yes", "1")).toEqual({ on: true, persist: null });
	});
});
