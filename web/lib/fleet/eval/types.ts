import { FLEET_MODES, type FleetMode } from "@/components/dashboard/fleet-dial/FleetModeToggle";

export type { FleetMode };

export type NoteSentiment = "+" | "-";

export type EvalNote = {
	id: string;
	mode: FleetMode;
	text: string;
	createdAt: number;
	sentiment?: NoteSentiment;
};

/** Canonical flip order, derived from the single source of truth. */
export const EVAL_MODES: ReadonlyArray<FleetMode> = FLEET_MODES;
