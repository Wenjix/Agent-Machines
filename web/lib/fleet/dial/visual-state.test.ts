import { describe, expect, it } from "vitest";

import {
	INITIAL_BOOTSTRAP_STATE,
	type BootstrapState,
} from "@/lib/user-config/schema";

import type { DialMachine } from "./types";
import { resolveVisualState } from "./visual-state";

function machine(overrides: {
	state?: string;
	probeOk?: boolean;
	boot?: Partial<BootstrapState>;
}): DialMachine {
	const probeOk = overrides.probeOk ?? true;
	return {
		id: "m1",
		providerKind: "dedalus",
		agentKind: "hermes",
		name: "m1",
		spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 },
		model: "x",
		createdAt: new Date(0).toISOString(),
		bootstrapState: { ...INITIAL_BOOTSTRAP_STATE, ...overrides.boot },
		live: probeOk
			? { ok: true, state: overrides.state ?? "ready", rawPhase: "", lastError: null }
			: { ok: false, reason: "unreachable" },
	};
}

describe("resolveVisualState", () => {
	it("ready → live ring, ok tone, filled", () => {
		const v = resolveVisualState(machine({ state: "ready" }));
		expect(v.ring).toBe("live");
		expect(v.tone).toBe("ok");
		expect(v.shape).toBe("filled");
		expect(v.booting).toBe(false);
	});

	it("starting → provision ring, warn tone, booting", () => {
		const v = resolveVisualState(machine({ state: "starting" }));
		expect(v.ring).toBe("provision");
		expect(v.tone).toBe("warn");
		expect(v.booting).toBe(true);
	});

	it("bootstrap running → booting even if state is otherwise idle", () => {
		const v = resolveVisualState(
			machine({ state: "unknown", boot: { phase: "running", current: "install-uv" } }),
		);
		expect(v.booting).toBe(true);
		expect(v.ring).toBe("provision");
		expect(v.bootPhase).toBe("install-uv");
	});

	it("error → fault rim, err tone, fault shape", () => {
		const v = resolveVisualState(machine({ state: "error" }));
		expect(v.ring).toBe("fault");
		expect(v.tone).toBe("err");
		expect(v.shape).toBe("fault");
	});

	it("failed boot dominates even when probe says ready", () => {
		const v = resolveVisualState(
			machine({ state: "ready", boot: { phase: "failed", lastError: "boom" } }),
		);
		expect(v.ring).toBe("fault");
		expect(v.bootFailed).toBe(true);
		expect(v.error).toBe("boom");
	});

	it("sleeping → transition ring, dim intensity", () => {
		const v = resolveVisualState(machine({ state: "sleeping" }));
		expect(v.ring).toBe("transition");
		expect(v.intensity).toBeLessThan(1);
	});

	it("probe failed → hollow, muted, present-but-unknown label", () => {
		const v = resolveVisualState(machine({ probeOk: false }));
		expect(v.shape).toBe("hollow");
		expect(v.tone).toBe("muted");
		expect(v.label).toMatch(/probe/i);
		expect(v.error).toBe("unreachable");
	});

	it("bootProgress reflects completed phases / 13", () => {
		const v = resolveVisualState(
			machine({ state: "starting", boot: { phase: "running", completed: ["system-deps", "install-uv"] } }),
		);
		expect(v.bootProgress).toBeCloseTo(2 / 13, 6);
	});
});
