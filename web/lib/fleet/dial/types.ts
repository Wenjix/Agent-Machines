import type {
	AgentKind,
	BootstrapState,
	MachineSpec,
	ProviderKind,
} from "@/lib/user-config/schema";

/**
 * The subset of a fleet machine the radial dial needs to render. The
 * `MachinesPanel` `LiveMachine` is a structural superset, so its arrays pass
 * straight in — the dial stays decoupled from the panel's full row shape.
 */
export type DialMachine = {
	id: string;
	providerKind: ProviderKind;
	agentKind: AgentKind;
	name: string;
	spec: MachineSpec;
	model: string;
	createdAt: string;
	bootstrapState: BootstrapState;
	live:
		| { ok: true; state: string; rawPhase: string; lastError: string | null }
		| { ok: false; reason: string };
};

/** The render mode chosen by the operator. "existing" is handled by MachinesPanel. */
export type DialMode = "synthesis" | "organism";

/** Lifecycle ring band — distance from "live", inner → outer. */
export type RingBand = "provision" | "transition" | "live" | "fault";

/** Coarse semantic tone, shared with the rest of the fleet UI. */
export type NodeTone = "ok" | "warn" | "err" | "muted";

/** Node glyph — carries state even with color stripped (a11y). */
export type NodeShape = "filled" | "fault" | "hollow";

/**
 * Everything the renderer needs about one machine's *state*, derived purely
 * from its live status + bootstrap progress. No geometry here.
 */
export type NodeVisualState = {
	tone: NodeTone;
	/** CSS variable name for the tone color, e.g. "--ret-green". */
	toneVar: string;
	ring: RingBand;
	shape: NodeShape;
	/** Human label for the live state ("Running", "Booting", …). */
	label: string;
	/** True while provisioning — drives the inbound particle stream. */
	booting: boolean;
	/** Boot progress 0..1 from completed phases / total. */
	bootProgress: number;
	/** Current bootstrap phase id, or null. */
	bootPhase: string | null;
	/** Boot has failed mid-way (frozen red stream). */
	bootFailed: boolean;
	/** Reached the gateway-live phase — triggers the arrival "pop". */
	gatewayLive: boolean;
	/** Resting brightness 0..1 (dim for sleeping/destroyed). */
	intensity: number;
	/** Persistent error message to surface, if any. */
	error: string | null;
};

/** One placed machine: state + polar geometry resolved to screen xy. */
export type RadialNode = {
	id: string;
	machine: DialMachine;
	visual: NodeVisualState;
	/** Screen-space center. */
	x: number;
	y: number;
	/** Angle from 12 o'clock, clockwise, in radians (for stream/tether math). */
	angle: number;
	/** Distance from center. */
	radius: number;
	/** Node disc radius in px (spec-weighted). */
	size: number;
	/** Age-derived opacity 0..1. */
	opacity: number;
	/** Fill color (agent hue). */
	hue: string;
	isActive: boolean;
};

/** A substrate spoke — one of the four fixed sectors. */
export type SpokeGroup = {
	provider: ProviderKind;
	label: string;
	/** Sector center angle from 12 o'clock, clockwise, radians. */
	angle: number;
	/** Spoke axis endpoint on the outer ring. */
	tipX: number;
	tipY: number;
	count: number;
};

/** The complete, render-ready geometry for one frame of data. */
export type RadialLayout = {
	cx: number;
	cy: number;
	/** Usable radius (outer ring). */
	R: number;
	/** Ring band radii, keyed by band. */
	rings: Record<RingBand, number>;
	/** Hub (center readout) radius. */
	hubRadius: number;
	spokes: SpokeGroup[];
	nodes: RadialNode[];
};

/**
 * A declarative skin. The two aesthetics (Synthesis / Organism) diverge only
 * through these values; geometry and the SVG frame are shared.
 */
export type DialSkin = {
	mode: DialMode;
	/** Force a dark field regardless of theme (Organism). */
	forceDark: boolean;
	/** Background fill (CSS color) behind the dial. */
	background: string | null;
	/** Opacity of the measured SVG frame (rings/spokes/crosshair). */
	frameOpacity: number;
	/** Multiplier on node glow radius. */
	glowMultiplier: number;
	/** Per-booting-machine particle count. */
	particlesPerStream: number;
	/** Whether to mount the Canvas ambient bloom layer. */
	canvasBloom: boolean;
	/** Label opacity for spoke ticks. */
	labelOpacity: number;
};
