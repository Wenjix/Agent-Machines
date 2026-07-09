import type { DialMode, DialSkin } from "./types";

/**
 * The two living-data aesthetics. Geometry and the measured SVG frame are
 * shared; only these declarative values diverge.
 *
 * - Synthesis: the recommended north star. Keeps the Reticle measured frame at
 *   full strength and lets the data breathe inside it — theme-aware, restrained.
 * - Organism: Bremer's alis_OS spectacle. Forces a near-black field in any
 *   theme, dims the frame, and adds a dense Canvas bloom layer.
 */
export const SYNTHESIS_SKIN: DialSkin = {
	mode: "synthesis",
	forceDark: false,
	background: null,
	frameOpacity: 1,
	glowMultiplier: 0.5,
	particlesPerStream: 3,
	canvasBloom: false,
	labelOpacity: 1,
};

export const ORGANISM_SKIN: DialSkin = {
	mode: "organism",
	forceDark: true,
	background: "#070708",
	frameOpacity: 0.32,
	glowMultiplier: 1.8,
	particlesPerStream: 9,
	canvasBloom: true,
	labelOpacity: 0.5,
};

export function skinForMode(mode: DialMode): DialSkin {
	return mode === "organism" ? ORGANISM_SKIN : SYNTHESIS_SKIN;
}
