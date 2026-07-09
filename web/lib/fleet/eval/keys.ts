import { EVAL_MODES, type FleetMode } from "./types";

export function cycleMode(mode: FleetMode, dir: 1 | -1): FleetMode {
	const n = EVAL_MODES.length;
	const i = EVAL_MODES.indexOf(mode);
	const j = (((i + dir) % n) + n) % n;
	return EVAL_MODES[j];
}

export type EvalAction =
	| { type: "cycle"; dir: 1 | -1 }
	| { type: "jump"; mode: FleetMode }
	| { type: "peekStart" }
	| { type: "peekEnd" }
	| { type: "focusNote" };

/** Maps a keydown to a harness action, or null if the key is not a shortcut. */
export function keyToAction(key: string, opts: { shift: boolean }): EvalAction | null {
	if (key === "`") return { type: "cycle", dir: opts.shift ? -1 : 1 };
	if (key === "1") return { type: "jump", mode: "existing" };
	if (key === "2") return { type: "jump", mode: "synthesis" };
	if (key === "3") return { type: "jump", mode: "organism" };
	if (key === " ") return { type: "peekStart" };
	if (key === "n" || key === "N") return { type: "focusNote" };
	return null;
}

/** Maps a keyup to an action (only Space-release ends a peek). */
export function keyUpToAction(key: string): EvalAction | null {
	if (key === " ") return { type: "peekEnd" };
	return null;
}
