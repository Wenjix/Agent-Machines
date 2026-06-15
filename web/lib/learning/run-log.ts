/**
 * Parser for the on-box cron run log (~/.agent-machines/cron/runs.jsonl).
 *
 * Kept dependency-light (no catalog/Supabase imports) so it is unit-testable
 * without the generated data files. Newer lines carry a routing-arm snapshot
 * embedded at dispatch (see buildCronCommand); legacy/backfill lines have only
 * the exit metadata, in which case the arm fields are absent.
 */

export type RunLogEntry = {
	id: string;
	startedAt: string;
	finishedAt: string;
	exitCode: number;
	/** Routing-arm snapshot embedded at dispatch; absent on legacy/backfill lines. */
	runtime?: string;
	substrate?: string;
	model?: string;
	router?: string;
};

export function parseRunLog(stdout: string): RunLogEntry[] {
	const out: RunLogEntry[] = [];
	for (const line of stdout.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("{")) continue;
		try {
			const o = JSON.parse(trimmed) as Partial<RunLogEntry>;
			if (
				typeof o.id === "string" &&
				typeof o.startedAt === "string" &&
				typeof o.finishedAt === "string" &&
				typeof o.exitCode === "number"
			) {
				out.push({
					id: o.id,
					startedAt: o.startedAt,
					finishedAt: o.finishedAt,
					exitCode: o.exitCode,
					runtime: typeof o.runtime === "string" ? o.runtime : undefined,
					substrate: typeof o.substrate === "string" ? o.substrate : undefined,
					model: typeof o.model === "string" ? o.model : undefined,
					router: typeof o.router === "string" ? o.router : undefined,
				});
			}
		} catch {
			// skip malformed line
		}
	}
	return out;
}
