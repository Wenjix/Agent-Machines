import { clamp, lerp } from "./polar";
import type { DialSkin, NodeVisualState } from "./types";

export type NodeAnimation = {
	breathe: boolean;
	/** Breathing period in seconds. */
	breathDur: number;
	/** Scale delta at the peak of a breath (0 = no visible breath). */
	breathAmp: number;
	/** Glow blur radius in px (0 = crisp, no halo). */
	glow: number;
};

/**
 * Normalize a raw CPU percent (0..100) into a load unit (0..1). Used to turn the
 * latest stored `machine_metrics` sample into the dial's breathing signal.
 */
export function normalizeCpuLoad(cpuPercent: number | null | undefined): number | undefined {
	if (cpuPercent === null || cpuPercent === undefined || !Number.isFinite(cpuPercent)) {
		return undefined;
	}
	return clamp(cpuPercent / 100, 0, 1);
}

/**
 * Derive a node's motion from its visual state, the skin, and live load.
 *
 * Load drives the "I can feel the fleet working" channel: a `ready` node breathes
 * slow and calm when idle and fast when maxed. When load is undefined (no metrics
 * yet) a `ready` node still breathes on a calm baseline so the fleet reads as
 * alive — once load arrives it modulates period, amplitude, and glow. Failures
 * and sleepers hold still.
 */
export function deriveNodeAnimation(
	visual: NodeVisualState,
	skin: DialSkin,
	load: number | undefined,
	reducedMotion: boolean,
): NodeAnimation {
	const { tone, ring } = visual;
	const baseGlowPx =
		tone === "ok"
			? 7
			: tone === "warn" && ring === "provision"
				? 6
				: tone === "warn"
					? 3
					: tone === "err"
						? 4
						: 0;
	const loadFactor = load === undefined ? 1 : 0.5 + load;
	const glow = baseGlowPx * skin.glowMultiplier * loadFactor;

	const canBreathe = tone === "ok" || (tone === "warn" && ring === "provision");
	if (reducedMotion || !canBreathe) {
		return { breathe: false, breathDur: 0, breathAmp: 0, glow };
	}
	const breathDur = load === undefined ? 5 : lerp(6, 0.9, clamp(load, 0, 1));
	const breathAmp = load === undefined ? 0.05 : 0.05 + 0.1 * clamp(load, 0, 1);
	return { breathe: true, breathDur, breathAmp, glow };
}
