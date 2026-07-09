import { describe, expect, it } from "vitest";

import {
	INITIAL_BOOTSTRAP_STATE,
	PROVIDER_KINDS,
	type ProviderKind,
} from "@/lib/user-config/schema";

import { computeDialLayout } from "./layout";
import type { DialMachine } from "./types";

const NOW = 1_700_000_000_000;
const VIEWPORT = { width: 600, height: 600 };

function machine(id: string, provider: ProviderKind, state = "ready"): DialMachine {
	return {
		id,
		providerKind: provider,
		agentKind: "hermes",
		name: id,
		spec: { vcpu: 1, memoryMib: 2048, storageGib: 10 },
		model: "x",
		createdAt: new Date(NOW).toISOString(),
		bootstrapState: INITIAL_BOOTSTRAP_STATE,
		live: { ok: true, state, rawPhase: "", lastError: null },
	};
}

describe("computeDialLayout", () => {
	it("0 machines → no nodes, all four spokes present with count 0", () => {
		const layout = computeDialLayout([], null, VIEWPORT, NOW);
		expect(layout.nodes).toHaveLength(0);
		expect(layout.spokes).toHaveLength(4);
		expect(layout.spokes.every((s) => s.count === 0)).toBe(true);
	});

	it("single dedalus machine sits on the top spoke axis", () => {
		const layout = computeDialLayout([machine("a", "dedalus")], null, VIEWPORT, NOW);
		expect(layout.nodes).toHaveLength(1);
		const node = layout.nodes[0];
		// dedalus spoke points up (angle 0) → x on center axis, y above center
		expect(node.x).toBeCloseTo(layout.cx, 6);
		expect(node.y).toBeLessThan(layout.cy);
		expect(node.visual.ring).toBe("live");
	});

	it("groups each machine under its substrate sector", () => {
		const machines = PROVIDER_KINDS.map((p, i) => machine(`m${i}`, p));
		const layout = computeDialLayout(machines, null, VIEWPORT, NOW);
		for (const spoke of layout.spokes) {
			expect(spoke.count).toBe(1);
		}
		expect(layout.nodes).toHaveLength(4);
	});

	it("is deterministic for the same inputs", () => {
		const machines = PROVIDER_KINDS.map((p, i) => machine(`m${i}`, p));
		const a = computeDialLayout(machines, null, VIEWPORT, NOW);
		const b = computeDialLayout(machines, null, VIEWPORT, NOW);
		expect(a.nodes.map((n) => [n.id, n.x, n.y])).toEqual(
			b.nodes.map((n) => [n.id, n.x, n.y]),
		);
	});

	it("keeps 50 nodes inside the dial with bounded sizes", () => {
		const machines = Array.from({ length: 50 }, (_, i) =>
			machine(`m${i}`, PROVIDER_KINDS[i % PROVIDER_KINDS.length]),
		);
		const layout = computeDialLayout(machines, null, VIEWPORT, NOW);
		expect(layout.nodes).toHaveLength(50);
		for (const n of layout.nodes) {
			expect(n.radius).toBeGreaterThan(layout.hubRadius);
			expect(n.radius).toBeLessThanOrEqual(layout.R + 0.001);
			expect(n.size).toBeGreaterThanOrEqual(4);
			expect(n.size).toBeLessThanOrEqual(14);
		}
	});

	it("nudges the active machine's marker", () => {
		const machines = [machine("a", "dedalus"), machine("b", "dedalus")];
		const plain = computeDialLayout(machines, null, VIEWPORT, NOW);
		const active = computeDialLayout(machines, "a", VIEWPORT, NOW);
		const plainA = plain.nodes.find((n) => n.id === "a")!;
		const activeA = active.nodes.find((n) => n.id === "a")!;
		expect(activeA.isActive).toBe(true);
		expect(activeA.radius).toBeGreaterThan(plainA.radius);
	});
});
