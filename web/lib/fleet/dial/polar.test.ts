import { describe, expect, it } from "vitest";

import { clamp, hashUnit, lerp, pointsOnArc, polarToXY } from "./polar";

describe("polarToXY", () => {
	it("places angle 0 straight up (screen y points down)", () => {
		const p = polarToXY(0, 0, 10, 0);
		expect(p.x).toBeCloseTo(0, 6);
		expect(p.y).toBeCloseTo(-10, 6);
	});

	it("places angle π/2 to the right", () => {
		const p = polarToXY(0, 0, 10, Math.PI / 2);
		expect(p.x).toBeCloseTo(10, 6);
		expect(p.y).toBeCloseTo(0, 6);
	});

	it("places angle π straight down", () => {
		const p = polarToXY(0, 0, 10, Math.PI);
		expect(p.x).toBeCloseTo(0, 6);
		expect(p.y).toBeCloseTo(10, 6);
	});

	it("respects the center offset", () => {
		const p = polarToXY(100, 50, 5, Math.PI / 2);
		expect(p.x).toBeCloseTo(105, 6);
		expect(p.y).toBeCloseTo(50, 6);
	});
});

describe("clamp / lerp", () => {
	it("clamps into range", () => {
		expect(clamp(-1, 0, 10)).toBe(0);
		expect(clamp(11, 0, 10)).toBe(10);
		expect(clamp(5, 0, 10)).toBe(5);
	});

	it("lerps endpoints", () => {
		expect(lerp(0, 10, 0)).toBe(0);
		expect(lerp(0, 10, 1)).toBe(10);
		expect(lerp(0, 10, 0.5)).toBe(5);
	});
});

describe("hashUnit", () => {
	it("is deterministic and within [0,1)", () => {
		const a = hashUnit("machine-abc");
		const b = hashUnit("machine-abc");
		expect(a).toBe(b);
		expect(a).toBeGreaterThanOrEqual(0);
		expect(a).toBeLessThan(1);
	});

	it("differs across ids", () => {
		expect(hashUnit("a")).not.toBe(hashUnit("b"));
	});
});

describe("pointsOnArc", () => {
	it("returns the requested number of points spanning the radius", () => {
		const pts = pointsOnArc(0, 0, 10, 0, 3, 0);
		expect(pts).toHaveLength(3);
		// first near start radius (up), last near full radius (up)
		expect(pts[0].y).toBeCloseTo(0, 6);
		expect(pts[2].y).toBeCloseTo(-10, 6);
	});

	it("returns empty for non-positive count", () => {
		expect(pointsOnArc(0, 0, 10, 0, 0, 0)).toHaveLength(0);
	});
});
