/**
 * Loop 0 — out-of-band trace reader.
 *
 * The scheduler tick fires crons with wait:false, so the control plane never
 * sees a cron's real exit code/timing at dispatch — only the box's
 * ~/.agent-machines/cron/runs.jsonl has them. This reads that authoritative log
 * per cron machine (no box-side code change; the cron command already writes
 * it), normalizes completed runs into keyed traces, and emits them deduped.
 * Best-effort per machine; never throws into the tick.
 */

import { createHash } from "node:crypto";

import { buildPool, type Pool } from "@/lib/dashboard/pool";
import { estimateCost } from "@/lib/metrics/cost";
import { getProvider } from "@/lib/providers";
import { bundleForMachine, computeLoadoutHash } from "@/lib/learning/loadout-hash";
import { deriveTaskClass } from "@/lib/learning/task-class";
import { emitRunTraces } from "@/lib/learning/trace";
import type { RunTrace } from "@/lib/learning/types";
import type { CronEntry, MachineRef, UserConfig } from "@/lib/user-config/schema";

const RUN_LOG = "$HOME/.agent-machines/cron/runs.jsonl";
const TAIL_LINES = 100;
const EXEC_TIMEOUT_MS = 15_000;

type RunLogEntry = { id: string; startedAt: string; finishedAt: string; exitCode: number };

function parseRunLog(stdout: string): RunLogEntry[] {
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
				out.push({ id: o.id, startedAt: o.startedAt, finishedAt: o.finishedAt, exitCode: o.exitCode });
			}
		} catch {
			// skip malformed line
		}
	}
	return out;
}

function tenantHash(userId: string): string {
	return createHash("sha256").update(userId).digest("hex").slice(0, 16);
}

async function ingestMachine(
	userId: string,
	config: UserConfig,
	machine: MachineRef,
	cronsById: Map<string, CronEntry>,
	pool: Pool,
): Promise<number> {
	const provider = getProvider(machine.providerKind, config.providers);
	const res = await provider.exec(
		machine.id,
		`tail -n ${TAIL_LINES} ${RUN_LOG} 2>/dev/null || true`,
		{ timeoutMs: EXEC_TIMEOUT_MS },
	);
	const entries = parseRunLog(res.stdout);
	if (entries.length === 0) return 0;

	const loadoutHash = computeLoadoutHash(bundleForMachine(config, machine.id), pool);
	const th = tenantHash(userId);
	const traces: RunTrace[] = entries.map((e) => {
		const cron = cronsById.get(e.id);
		const started = Date.parse(e.startedAt);
		const finished = Date.parse(e.finishedAt);
		const latencyMs =
			Number.isFinite(started) && Number.isFinite(finished) && finished >= started
				? finished - started
				: null;
		const costMillicents =
			latencyMs !== null
				? Math.round(estimateCost(machine.spec, latencyMs / 1000).totalMillicents)
				: null;
		return {
			userId,
			machineId: machine.id,
			runId: `${machine.id}:${e.id}:${e.finishedAt}`,
			source: "cron",
			taskClass: cron ? deriveTaskClass(cron) : "unknown",
			runtime: machine.agentKind,
			substrate: machine.providerKind,
			model: machine.model,
			routerId: machine.gatewayProfileId,
			loadoutHash,
			memoryBundleId: null,
			tenantHash: th,
			success: e.exitCode === 0,
			exitCode: e.exitCode,
			costMillicents,
			latencyMs,
			startedAt: e.startedAt,
			finishedAt: e.finishedAt,
			extra: cron ? { cronId: e.id, skills: cron.skills } : { cronId: e.id },
		};
	});
	await emitRunTraces(traces);
	return traces.length;
}

/** Read + emit run traces for every machine bound to one of the user's crons. */
export async function ingestRunTracesForUser(userId: string, config: UserConfig): Promise<number> {
	const crons = config.crons ?? [];
	if (crons.length === 0) return 0;
	const cronsById = new Map(crons.map((c) => [c.id, c]));
	const machineIds = new Set(crons.map((c) => c.machineId));
	const pool = buildPool(config);
	let total = 0;
	for (const machineId of machineIds) {
		const machine = config.machines.find((m) => m.id === machineId && !m.archived);
		if (!machine) continue;
		try {
			total += await ingestMachine(userId, config, machine, cronsById, pool);
		} catch {
			// machine offline / exec failed / parse error — skip, retry next tick
		}
	}
	return total;
}
