/**
 * Single source of truth for fleet status counts. Lifted out of FleetMonitor
 * so the radial dial's center readout and the Overview badges agree exactly.
 *
 * The input is structural — any machine row with a `live` union (and optionally
 * a `bootstrapState`) satisfies it, so both `FleetMonitor.LiveMachine` and the
 * dial's `DialMachine` pass straight in.
 */
export type FleetSummaryMachine = {
	live: { ok: true; state: string } | { ok: false; reason: string };
	bootstrapState?: { phase: string };
};

export type FleetSummary = {
	total: number;
	/** state === "ready". */
	running: number;
	/** state === "starting" or bootstrap actively running. */
	booting: number;
	/** state === "sleeping". */
	sleeping: number;
	/** probe failed, errored, or destroying. */
	failed: number;
};

export function summarizeFleet(
	machines: ReadonlyArray<FleetSummaryMachine>,
): FleetSummary {
	let running = 0;
	let booting = 0;
	let sleeping = 0;
	let failed = 0;
	for (const m of machines) {
		if (!m.live.ok) {
			failed += 1;
			continue;
		}
		const state = m.live.state;
		const bootRunning = m.bootstrapState?.phase === "running";
		if (state === "ready") {
			running += 1;
		} else if (state === "starting" || bootRunning) {
			booting += 1;
		} else if (state === "sleeping") {
			sleeping += 1;
		} else if (state === "error" || state === "destroying") {
			failed += 1;
		}
	}
	return { total: machines.length, running, booting, sleeping, failed };
}
