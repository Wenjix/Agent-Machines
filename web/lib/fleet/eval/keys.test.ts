import { describe, expect, it } from "vitest";

import { cycleMode, keyToAction, keyUpToAction } from "./keys";

describe("cycleMode", () => {
	it("cycles forward with wraparound", () => {
		expect(cycleMode("existing", 1)).toBe("synthesis");
		expect(cycleMode("synthesis", 1)).toBe("organism");
		expect(cycleMode("organism", 1)).toBe("existing");
	});

	it("cycles backward with wraparound", () => {
		expect(cycleMode("existing", -1)).toBe("organism");
		expect(cycleMode("organism", -1)).toBe("synthesis");
	});
});

describe("keyToAction", () => {
	it("maps backtick to forward/back cycle by shift", () => {
		expect(keyToAction("`", { shift: false })).toEqual({ type: "cycle", dir: 1 });
		expect(keyToAction("`", { shift: true })).toEqual({ type: "cycle", dir: -1 });
	});

	it("maps digits to direct jumps", () => {
		expect(keyToAction("1", { shift: false })).toEqual({ type: "jump", mode: "existing" });
		expect(keyToAction("2", { shift: false })).toEqual({ type: "jump", mode: "synthesis" });
		expect(keyToAction("3", { shift: false })).toEqual({ type: "jump", mode: "organism" });
	});

	it("maps space to peek start and n to focus note", () => {
		expect(keyToAction(" ", { shift: false })).toEqual({ type: "peekStart" });
		expect(keyToAction("n", { shift: false })).toEqual({ type: "focusNote" });
	});

	it("maps shift+n (N) to focus note too", () => {
		expect(keyToAction("N", { shift: true })).toEqual({ type: "focusNote" });
	});

	it("returns null for unmapped keys", () => {
		expect(keyToAction("x", { shift: false })).toBeNull();
		expect(keyToAction("4", { shift: false })).toBeNull();
	});
});

describe("keyUpToAction", () => {
	it("maps space release to peek end", () => {
		expect(keyUpToAction(" ")).toEqual({ type: "peekEnd" });
	});

	it("returns null for other keys", () => {
		expect(keyUpToAction("`")).toBeNull();
	});
});
