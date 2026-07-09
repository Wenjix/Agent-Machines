import { type NextRequest } from "next/server";

import { getEffectiveUserId } from "@/lib/user-config/identity";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getLatestMetricPerMachine } from "@/lib/supabase/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Latest known CPU/load sample per machine, for the radial fleet dial's
 * breathing signal. Degrades gracefully: without Supabase (or on any read
 * error) it returns an empty map, and the dial falls back to a calm baseline.
 */
export async function GET(_request: NextRequest) {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	if (!isSupabaseConfigured()) {
		return Response.json({ ok: true, loads: {} });
	}

	try {
		const latest = await getLatestMetricPerMachine(userId);
		const loads: Record<
			string,
			{ cpuPercent: number | null; loadAvg1m: number | null; vcpu: number }
		> = {};
		for (const [machineId, sample] of latest) {
			loads[machineId] = {
				cpuPercent: sample.cpuPercent,
				loadAvg1m: sample.loadAvg1m,
				vcpu: sample.vcpu,
			};
		}
		return Response.json({ ok: true, loads });
	} catch {
		// Never let a metrics hiccup break the dial — baseline breathing is fine.
		return Response.json({ ok: true, loads: {} });
	}
}
