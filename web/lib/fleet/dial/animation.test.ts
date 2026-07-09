import { describe, expect, it } from "vitest";

import { deriveNodeAnimation, normalizeCpuLoad } from "./animation";
import { ORGANISM_SKIN, SYNTHESIS_SKIN } from "./skins";
import type { NodeVisualState } from "./types";

function visual(over: Partial<NodeVisualState>): NodeVisualState {
	return {
		tone: "ok",
		toneVar: "--ret-green",
		ring: "live",
		shape: "filled",
		label: "Running",
		booting: false,
		bootProgress: 1,
		bootPhase: null,
		bootFailed: false,
		gatewayLive: true,
		intensity: 1,
		error: null,
		...over,
	};
}

describe("normalizeCpuLoad", () => {
	it("maps percent → unit and clamps", () => {
		expect(normalizeCpuLoad(0)).toBe(0);
		expect(normalizeCpuLoad(50)).toBe(0.5);
		expect(normalizeCpuLoad(150)).toBe(1);
	});
	it("returns undefined for missing/invalid", () => {
		expect(normalizeCpuLoad(null)).toBeUndefined();
		expect(normalizeCpuLoad(undefined)).toBeUndefined();
		expect(normalizeCpuLoad(Number.NaN)).toBeUndefined();
	});
});

describe("deriveNodeAnimation", () => {
	it("ready node breathes on a calm baseline when load is unknown", () => {
		const a = deriveNodeAnimation(visual({}), SYNTHESIS_SKIN, undefined, false);
		expect(a.breathe).toBe(true);
		expect(a.breathDur).toBe(5);
		expect(a.breathAmp).toBeCloseTo(0.05, 6);
		expect(a.glow).toBeGreaterThan(0);
	});

	it("higher load breathes faster, bigger, and glows more", () => {
		const calm = deriveNodeAnimation(visual({}), SYNTHESIS_SKIN, 0.1, false);
		const busy = deriveNodeAnimation(visual({}), SYNTHESIS_SKIN, 0.9, false);
		expect(busy.breathDur).toBeLessThan(calm.breathDur);
		expect(busy.breathAmp).toBeGreaterThan(calm.breathAmp);
		expect(busy.glow).toBeGreaterThan(calm.glow);
	});

	it("respects prefers-reduced-motion (no breathing, glow still encodes load)", () => {
		const a = deriveNodeAnimation(visual({}), SYNTHESIS_SKIN, 0.8, true);
		expect(a.breathe).toBe(false);
		expect(a.glow).toBeGreaterThan(0);
	});

	it("booting nodes breathe; sleeping and error nodes hold still", () => {
		const booting = deriveNodeAnimation(
			visual({ tone: "warn", ring: "provision", booting: true }),
			SYNTHESIS_SKIN,
			undefined,
			false,
		);
		expect(booting.breathe).toBe(true);

		const sleeping = deriveNodeAnimation(
			visual({ tone: "warn", ring: "transition" }),
			SYNTHESIS_SKIN,
			undefined,
			false,
		);
		expect(sleeping.breathe).toBe(false);

		const errored = deriveNodeAnimation(
			visual({ tone: "err", ring: "fault", shape: "fault" }),
			SYNTHESIS_SKIN,
			0.5,
			false,
		);
		expect(errored.breathe).toBe(false);
	});

	it("organism skin amplifies glow over synthesis", () => {
		const syn = deriveNodeAnimation(visual({}), SYNTHESIS_SKIN, 0.5, false);
		const org = deriveNodeAnimation(visual({}), ORGANISM_SKIN, 0.5, false);
		expect(org.glow).toBeGreaterThan(syn.glow);
	});
});
