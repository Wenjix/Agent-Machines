import { describe, expect, it } from "vitest";

import { summarizeFleet, type FleetSummaryMachine } from "./summarize";

function ok(state: string, boot?: string): FleetSummaryMachine {
	return {
		live: { ok: true, state },
		...(boot ? { bootstrapState: { phase: boot } } : {}),
	};
}

const probeFail: FleetSummaryMachine = { live: { ok: false, reason: "x" } };

describe("summarizeFleet", () => {
	it("counts ready as running and starting as booting", () => {
		const s = summarizeFleet([ok("ready"), ok("ready"), ok("starting")]);
		expect(s.running).toBe(2);
		expect(s.booting).toBe(1);
		expect(s.total).toBe(3);
	});

	it("treats an actively-bootstrapping machine as booting", () => {
		const s = summarizeFleet([ok("unknown", "running")]);
		expect(s.booting).toBe(1);
	});

	it("counts sleeping, error/destroying, and probe failures", () => {
		const s = summarizeFleet([
			ok("sleeping"),
			ok("error"),
			ok("destroying"),
			probeFail,
		]);
		expect(s.sleeping).toBe(1);
		expect(s.failed).toBe(3);
	});

	it("treats a failed boot as failed even when the probe still reports ready/starting", () => {
		const s = summarizeFleet([ok("ready", "failed"), ok("starting", "failed")]);
		expect(s.failed).toBe(2);
		expect(s.running).toBe(0);
		expect(s.booting).toBe(0);
	});

	it("empty fleet is all zeros", () => {
		const s = summarizeFleet([]);
		expect(s).toEqual({ total: 0, running: 0, booting: 0, sleeping: 0, failed: 0 });
	});
});
