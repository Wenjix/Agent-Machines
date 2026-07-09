import { BOOTSTRAP_PHASES } from "@/lib/user-config/schema";

import type { DialMachine, NodeVisualState } from "./types";

const GATEWAY_PHASE_INDEX = BOOTSTRAP_PHASES.indexOf("start-gateway");
const TOTAL_PHASES = BOOTSTRAP_PHASES.length;

const STATE_LABEL: Record<string, string> = {
	ready: "Running",
	starting: "Starting",
	sleeping: "Sleeping",
	destroying: "Destroying",
	destroyed: "Destroyed",
	error: "Failed",
	unknown: "Unknown",
};

/**
 * Resolve a machine's live status + bootstrap progress into the pure visual
 * facts the renderer needs. No geometry, no time, no DOM — fully testable.
 *
 * Lifecycle rings encode distance from "live": a booting machine sits on the
 * inner provisioning ring and travels outward to the live ring as its phases
 * complete; failures pin to the outer fault rim.
 */
export function resolveVisualState(machine: DialMachine): NodeVisualState {
	const probeOk = machine.live.ok;
	const state = probeOk ? machine.live.state : "unknown";
	const boot = machine.bootstrapState;
	const bootRunning = boot.phase === "running";
	const bootFailed = boot.phase === "failed";
	const booting = state === "starting" || bootRunning;

	const bootProgress = clampUnit(boot.completed.length / TOTAL_PHASES);
	const gatewayLive =
		boot.completed.length > GATEWAY_PHASE_INDEX || state === "ready";

	const error = probeOk
		? machine.live.lastError ?? boot.lastError
		: machine.live.reason;

	// Failure dominates: an errored machine or failed boot reads as a fault.
	if (state === "error" || bootFailed) {
		return {
			tone: "err",
			toneVar: "--ret-red",
			ring: "fault",
			shape: "fault",
			label: bootFailed ? "Boot failed" : "Failed",
			booting: false,
			bootProgress,
			bootPhase: boot.current ?? lastCompleted(boot.completed),
			bootFailed,
			gatewayLive,
			intensity: 0.85,
			error,
		};
	}

	if (booting) {
		return {
			tone: "warn",
			toneVar: "--ret-amber",
			ring: "provision",
			shape: "filled",
			label: "Booting",
			booting: true,
			bootProgress,
			bootPhase: boot.current,
			bootFailed: false,
			gatewayLive,
			intensity: 0.9,
			error,
		};
	}

	if (state === "ready") {
		return {
			tone: "ok",
			toneVar: "--ret-green",
			ring: "live",
			shape: "filled",
			label: "Running",
			booting: false,
			bootProgress: 1,
			bootPhase: null,
			bootFailed: false,
			gatewayLive: true,
			intensity: 1,
			error,
		};
	}

	if (state === "sleeping") {
		return {
			tone: "warn",
			toneVar: "--ret-amber",
			ring: "transition",
			shape: "filled",
			label: "Sleeping",
			booting: false,
			bootProgress,
			bootPhase: null,
			bootFailed: false,
			gatewayLive,
			intensity: 0.5,
			error,
		};
	}

	// destroying / destroyed / unknown / probe-failed → present but dim.
	const hollow = state === "destroyed" || state === "destroying" || !probeOk;
	return {
		tone: "muted",
		toneVar: "--ret-text-muted",
		ring: "transition",
		shape: hollow ? "hollow" : "filled",
		label: probeOk ? STATE_LABEL[state] ?? "Unknown" : "Probe unreachable",
		booting: false,
		bootProgress,
		bootPhase: null,
		bootFailed: false,
		gatewayLive,
		intensity: 0.4,
		error,
	};
}

function lastCompleted(completed: readonly string[]): string | null {
	return completed.length > 0 ? completed[completed.length - 1] : null;
}

function clampUnit(value: number): number {
	if (!Number.isFinite(value) || value < 0) return 0;
	if (value > 1) return 1;
	return value;
}
