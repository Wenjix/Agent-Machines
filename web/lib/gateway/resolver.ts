/**
 * Gateway resolver.
 *
 * Machines own lifecycle. Gateway profiles own model routing. Keeping
 * these separate lets one account reuse the same Vercel AI Gateway /
 * OpenRouter / BYO OpenAI-compatible config across many machines and
 * agents without hand-editing `apiUrl` on every MachineRef.
 */

import { resolveMachine } from "@/lib/dashboard/exec";
import {
	DEFAULT_ROUTER_ID,
	ROUTER_PRESETS,
	routerPresetById,
	UPSTREAM_BASE_URL,
	type RouterPreset,
	type RouterSource,
} from "@/lib/agents/upstreams";
import { getUserConfig } from "@/lib/user-config/clerk";
import { type GatewayProfile } from "@/lib/user-config/schema";

/**
 * A gateway profile's baseUrl is user-editable, so it must never be treated
 * as the trusted host by itself. Any process.env platform credential must
 * only be released when baseUrl's host really is the provider's own host.
 */
function isTrustedHost(baseUrl: string | null, trustedUrl: string): boolean {
	if (!baseUrl) return false;
	try {
		return new URL(baseUrl).hostname === new URL(trustedUrl).hostname;
	} catch {
		return false;
	}
}

export type GatewayEnv = {
	apiUrl: string;
	model: string;
	headers: Record<string, string>;
	kind: GatewayProfile["kind"] | "machine";
	apiHost: string;
};

export async function resolveGatewayForUser(machineId?: string | null): Promise<GatewayEnv> {
	const config = await getUserConfig();
	const machine = resolveMachine(config, machineId);
	if (!machine) {
		throw new Error(
			machineId
				? `Machine ${machineId} not found in your account.`
				: "No machine selected. Pick one in /dashboard/machines or provision via /dashboard/setup.",
		);
	}

	if (!machine.apiUrl) {
		throw new Error(
			`Machine ${machine.id} has no agent gateway URL on file yet -- bootstrap the agent first.`,
		);
	}
	if (!machine.apiKey) {
		throw new Error(
			`Machine ${machine.id} has no agent gateway bearer on file -- bootstrap the agent first.`,
		);
	}
	return {
		apiUrl: normalizeOpenAiBase(machine.apiUrl),
		model: machine.agentKind === "openclaw" ? "openclaw" : machine.model,
		headers: { Authorization: `Bearer ${machine.apiKey}` },
		kind: "machine",
		apiHost: hostOf(machine.apiUrl),
	};
}

export async function resolveModelGatewayForUser(machineId?: string | null): Promise<GatewayEnv> {
	const config = await getUserConfig();
	const machine = resolveMachine(config, machineId);
	if (!machine) {
		throw new Error(
			machineId
				? `Machine ${machineId} not found in your account.`
				: "No machine selected. Pick one in /dashboard/machines or provision via /dashboard/setup.",
		);
	}
	const candidates = gatewayCandidates(config.gatewayProfiles, machine.gatewayProfileId);
	const failures: string[] = [];
	for (const candidate of candidates) {
		try {
			return candidate.kind === "profile"
				? fromProfile(candidate.profile, machine.model, config)
				: fromRouterPreset(candidate.preset, machine.model, config);
		} catch (err) {
			failures.push(err instanceof Error ? err.message : String(err));
		}
	}
	throw new Error(
		failures[0] ??
			"No model gateway profile configured. Add a Vercel AI Gateway or OpenRouter key.",
	);
}

type GatewayCandidate =
	| { kind: "profile"; profile: GatewayProfile }
	| { kind: "preset"; preset: RouterPreset };

function gatewayCandidates(
	profiles: GatewayProfile[],
	selectedId: string | null,
): GatewayCandidate[] {
	const candidates: GatewayCandidate[] = [];
	const seen = new Set<string>();
	const addProfile = (profile: GatewayProfile | null | undefined) => {
		if (!profile || seen.has(`profile:${profile.id}`)) return;
		seen.add(`profile:${profile.id}`);
		candidates.push({ kind: "profile", profile });
	};
	const addPreset = (preset: RouterPreset | null | undefined) => {
		if (!preset || seen.has(`preset:${preset.id}`)) return;
		seen.add(`preset:${preset.id}`);
		candidates.push({ kind: "preset", preset });
	};

	if (selectedId) {
		addProfile(profiles.find((entry) => entry.id === selectedId));
		addPreset(routerPresetById(selectedId));
	}
	addProfile(
		profiles.find(
			(entry) => entry.id === DEFAULT_ROUTER_ID || entry.kind === "vercel-ai-gateway",
		),
	);
	addProfile(
		profiles.find(
			(entry) =>
				entry.id === "openrouter-router" ||
				Boolean(entry.baseUrl?.toLowerCase().includes("openrouter")),
		),
	);
	for (const profile of profiles) addProfile(profile);
	for (const preset of ROUTER_PRESETS) addPreset(preset);

	return candidates;
}

function fromProfile(
	profile: GatewayProfile,
	machineModel: string,
	config: Awaited<ReturnType<typeof getUserConfig>>,
): GatewayEnv {
	const model = profile.model || machineModel;
	if (profile.kind === "vercel-ai-gateway") {
		const base = normalizeOpenAiBase(profile.baseUrl ?? UPSTREAM_BASE_URL.vercelAiGateway);
		const key =
			profile.apiKey ??
			keyForRouterSource(
				"vercelAiGateway",
				config,
				isTrustedHost(base, UPSTREAM_BASE_URL.vercelAiGateway),
			) ??
			null;
		if (!key) {
			throw new Error(
				"Vercel AI Gateway profile has no API key and no VERCEL_OIDC_TOKEN.",
			);
		}
		return {
			apiUrl: base,
			model,
			headers: {
				Authorization: `Bearer ${key}`,
				"x-ai-gateway-api-key": key,
			},
			kind: profile.kind,
			apiHost: hostOf(base),
		};
	}

	if (profile.kind === "openai-compatible") {
		if (!profile.baseUrl) {
			throw new Error(`Gateway profile '${profile.name}' is missing a base URL.`);
		}
		if (profile.baseUrl.toLowerCase().includes("dedalus")) {
			throw new Error(`Gateway profile '${profile.name}' uses an unsupported Dedalus model endpoint.`);
		}
		const apiKey =
			profile.apiKey ??
			inferKey(profile.baseUrl, config) ??
			null;
		if (!apiKey) {
			throw new Error(`Gateway profile '${profile.name}' is missing an API key.`);
		}
		const base = normalizeOpenAiBase(profile.baseUrl);
		return {
			apiUrl: base,
			model,
			headers: { Authorization: `Bearer ${apiKey}` },
			kind: profile.kind,
			apiHost: hostOf(base),
		};
	}

	const exhaustive: never = profile.kind;
	throw new Error(`Unknown gateway kind: ${String(exhaustive)}`);
}

function fromRouterPreset(
	preset: RouterPreset,
	machineModel: string,
	config: Awaited<ReturnType<typeof getUserConfig>>,
): GatewayEnv {
	if (!preset.baseUrl) {
		throw new Error(`Router preset '${preset.label}' needs a saved custom profile.`);
	}
	// preset.baseUrl is a fixed, hardcoded ROUTER_PRESETS entry, never user
	// input, so the platform env-var fallback is safe to allow here.
	const apiKey = keyForRouterSource(preset.source, config, true);
	if (!apiKey) {
		throw new Error(`Router preset '${preset.label}' is missing an API key.`);
	}
	const base = normalizeOpenAiBase(preset.baseUrl);
	return {
		apiUrl: base,
		model: machineModel,
		headers:
			preset.source === "vercelAiGateway"
				? {
						Authorization: `Bearer ${apiKey}`,
						"x-ai-gateway-api-key": apiKey,
					}
				: { Authorization: `Bearer ${apiKey}` },
		kind:
			preset.source === "vercelAiGateway"
				? "vercel-ai-gateway"
				: "openai-compatible",
		apiHost: hostOf(base),
	};
}

function keyForRouterSource(
	source: RouterSource,
	config: Awaited<ReturnType<typeof getUserConfig>>,
	// Both the user's own saved config.aiProviderKeys.* AND any platform
	// process.env.* fallback must only be released when the caller has
	// already verified the associated baseUrl really is the provider's own
	// trusted host — see isTrustedHost. Callers with a fixed/hardcoded
	// baseUrl (router presets) may pass true; callers with a user-editable
	// baseUrl must gate this per-request. "custom" is exempt: it exists
	// precisely for the user's own arbitrary OpenAI-compatible endpoint, so
	// it's always allowed regardless of this flag.
	trustedHost: boolean,
): string {
	const ai = config.aiProviderKeys;
	switch (source) {
		case "vercelAiGateway":
			return trustedHost
				? (ai.vercelAiGateway ??
					process.env.AI_GATEWAY_API_KEY?.trim() ??
					process.env.VERCEL_OIDC_TOKEN?.trim() ??
					process.env.AI_GATEWAY_KEY?.trim() ??
					"")
				: "";
		case "openrouter":
			return trustedHost ? (ai.openrouter ?? process.env.OPENROUTER_API_KEY?.trim() ?? "") : "";
		case "openai":
			return trustedHost ? (ai.openai ?? process.env.OPENAI_API_KEY?.trim() ?? "") : "";
		case "google":
			return trustedHost ? (ai.google ?? "") : "";
		case "custom":
			return ai.custom?.key ?? "";
	}
}

function inferKey(
	baseUrl: string | null,
	config: Awaited<ReturnType<typeof getUserConfig>>,
): string {
	const lower = baseUrl?.toLowerCase() ?? "";
	if (lower.includes("openrouter")) {
		return keyForRouterSource("openrouter", config, isTrustedHost(baseUrl, UPSTREAM_BASE_URL.openrouter));
	}
	if (lower.includes("openai.com")) {
		return keyForRouterSource("openai", config, isTrustedHost(baseUrl, UPSTREAM_BASE_URL.openai));
	}
	if (lower.includes("dedalus")) return "";
	if (lower.includes("ai-gateway.vercel")) {
		return keyForRouterSource(
			"vercelAiGateway",
			config,
			isTrustedHost(baseUrl, UPSTREAM_BASE_URL.vercelAiGateway),
		);
	}
	if (lower.includes("googleapis")) {
		return keyForRouterSource("google", config, isTrustedHost(baseUrl, UPSTREAM_BASE_URL.google));
	}
	return keyForRouterSource("custom", config, false);
}

function normalizeOpenAiBase(value: string): string {
	const trimmed = value.trim().replace(/\/$/, "");
	if (trimmed.endsWith("/v1")) return trimmed;
	return `${trimmed}/v1`;
}

function hostOf(value: string): string {
	try {
		return new URL(value).host;
	} catch {
		return value;
	}
}
