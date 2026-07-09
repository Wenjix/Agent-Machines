"use client";

import { useEffect, useState } from "react";

import { normalizeCpuLoad } from "@/lib/fleet/dial/animation";

const POLL_MS = 15000;

type LivePayload = {
	ok: boolean;
	loads: Record<string, { cpuPercent: number | null; loadAvg1m: number | null; vcpu: number }>;
};

/**
 * Polls the latest per-machine CPU sample and exposes it as a normalized load
 * map (machine id → 0..1) for the radial dial's breathing. Only active when
 * `enabled` (the dial is on screen). Visibility-guarded; degrades to an empty
 * map when metrics are unavailable, which the dial reads as a calm baseline.
 *
 * Cadence is intentionally slow (15s): the underlying samples refresh on the
 * metrics collector's cron tick, so faster polling would just re-fetch the
 * same numbers.
 */
export function useLiveLoads(enabled: boolean): Record<string, number> {
	const [loads, setLoads] = useState<Record<string, number>>({});

	useEffect(() => {
		if (!enabled) return;
		let alive = true;

		const tick = async () => {
			try {
				const res = await fetch("/api/dashboard/metrics/live", { cache: "no-store" });
				if (!res.ok) return;
				const body = (await res.json()) as LivePayload;
				if (!alive || !body.ok) return;
				const next: Record<string, number> = {};
				for (const [id, sample] of Object.entries(body.loads ?? {})) {
					const load = normalizeCpuLoad(sample.cpuPercent);
					if (load !== undefined) next[id] = load;
				}
				setLoads(next);
			} catch {
				// keep last-known loads on a transient failure
			}
		};

		void tick();
		const interval = window.setInterval(() => {
			if (document.visibilityState === "visible") void tick();
		}, POLL_MS);
		return () => {
			alive = false;
			window.clearInterval(interval);
		};
	}, [enabled]);

	return loads;
}
