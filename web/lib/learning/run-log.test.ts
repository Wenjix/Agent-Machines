import { describe, expect, it } from "vitest";

import { parseRunLog } from "./run-log";

describe("parseRunLog", () => {
	it("parses the embedded run-time arm when present", () => {
		const line = JSON.stringify({
			id: "cron-1",
			startedAt: "2026-06-15T00:00:00Z",
			finishedAt: "2026-06-15T00:00:05Z",
			exitCode: 0,
			runtime: "hermes",
			substrate: "e2b",
			model: "anthropic/claude-sonnet-4-6",
			router: "dedalus-default",
		});
		const [e] = parseRunLog(line);
		expect(e.exitCode).toBe(0);
		expect(e.runtime).toBe("hermes");
		expect(e.substrate).toBe("e2b");
		expect(e.model).toBe("anthropic/claude-sonnet-4-6");
		expect(e.router).toBe("dedalus-default");
	});

	it("leaves arm fields undefined on legacy lines", () => {
		const line =
			'{"id":"c2","startedAt":"2026-06-15T00:00:00Z","finishedAt":"2026-06-15T00:00:01Z","exitCode":1}';
		const [e] = parseRunLog(line);
		expect(e.exitCode).toBe(1);
		expect(e.runtime).toBeUndefined();
		expect(e.router).toBeUndefined();
	});

	it("preserves an empty-string router (null sentinel) distinct from absent", () => {
		const line = JSON.stringify({ id: "c3", startedAt: "t", finishedAt: "t", exitCode: 0, router: "" });
		const [e] = parseRunLog(line);
		expect(e.router).toBe("");
	});

	it("skips malformed and non-object lines", () => {
		const out = parseRunLog(
			'not json\n{"id":"c4","startedAt":"t","finishedAt":"t","exitCode":0}\n{bad',
		);
		expect(out).toHaveLength(1);
		expect(out[0].id).toBe("c4");
	});

	it("drops entries missing a required field", () => {
		const out = parseRunLog('{"id":"x","startedAt":"t","exitCode":0}'); // no finishedAt
		expect(out).toHaveLength(0);
	});
});
