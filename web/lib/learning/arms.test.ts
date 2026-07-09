import { describe, expect, it } from "vitest";

import type { UserConfig } from "@/lib/user-config/schema";

import { enumerateFeasibleArms } from "./arms";

function cfg(partial: {
	providers?: Record<string, unknown>;
	aiProviderKeys?: Record<string, unknown>;
}): UserConfig {
	return {
		providers: partial.providers ?? {},
		aiProviderKeys: partial.aiProviderKeys ?? {},
	} as unknown as UserConfig;
}

describe("enumerateFeasibleArms", () => {
	it("prunes codex when no OpenAI key is on file", () => {
		const arms = enumerateFeasibleArms(
			cfg({ providers: { e2b: { configured: true } }, aiProviderKeys: {} }),
		);
		expect(arms.some((a) => a.runtime === "codex")).toBe(false);
	});

	it("includes codex (native, no router) when an OpenAI key is present", () => {
		const arms = enumerateFeasibleArms(
			cfg({ providers: { e2b: { configured: true } }, aiProviderKeys: { openai: "sk-x" } }),
		);
		const codex = arms.filter((a) => a.runtime === "codex");
		expect(codex.length).toBeGreaterThan(0);
		expect(codex.every((a) => a.routerId === null)).toBe(true);
		expect(codex.every((a) => a.substrate === "e2b")).toBe(true);
	});

	it("only emits arms for configured substrates", () => {
		const arms = enumerateFeasibleArms(
			cfg({
				providers: { e2b: { configured: true } },
				aiProviderKeys: { openai: "sk-x", anthropic: "sk-y" },
			}),
		);
		expect(new Set(arms.map((a) => a.substrate))).toEqual(new Set(["e2b"]));
	});

	it("makes hermes feasible on a Dedalus key with a ready router", () => {
		const arms = enumerateFeasibleArms(
			cfg({
				providers: { dedalus: { apiKey: "dk", configured: true }, e2b: { configured: true } },
				aiProviderKeys: {},
			}),
		);
		const hermes = arms.filter((a) => a.runtime === "hermes");
		expect(hermes.length).toBeGreaterThan(0);
		expect(hermes.every((a) => a.routerId !== null)).toBe(true);
	});

	it("returns no arms when nothing is configured", () => {
		expect(enumerateFeasibleArms(cfg({}))).toEqual([]);
	});
});
