/**
 * Arm enumeration — the credential-gated feasible set of routing choices.
 *
 * The bandit only ever explores within this set: infeasible runtimes (missing
 * native key / no upstream) and unconfigured substrates are pruned by reusing
 * the existing credential gate (validateAgentCredentials + agentUpstreamReadiness).
 * The router axis applies only to gateway agents (hermes/openclaw).
 */

import {
	validateAgentCredentials,
	type CredentialCheckConfig,
} from "@/lib/agents/credentials";
import {
	ROUTER_PRESETS,
	agentUpstreamReadiness,
	agentUsesRouter,
} from "@/lib/agents/upstreams";
import {
	AGENT_KINDS,
	PROVIDER_KINDS,
	type AgentKind,
	type UserConfig,
} from "@/lib/user-config/schema";
import type { Arm } from "@/lib/learning/types";

/**
 * Candidate models per runtime — the v1 curated set (decision: small per-runtime
 * list, not the full catalog, which would keep cells sparse forever). These are
 * a tunable seed; the bandit learns to avoid weak ones. Router agents use
 * namespaced ids; native agents use the provider's own ids.
 */
export const CURATED_MODELS: Record<AgentKind, string[]> = {
	hermes: ["anthropic/claude-sonnet-4-6", "anthropic/claude-opus-4-8", "openai/gpt-5.1"],
	openclaw: ["anthropic/claude-sonnet-4-6", "anthropic/claude-opus-4-8"],
	"claude-code": ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5"],
	codex: ["gpt-5.1", "gpt-5.1-codex"],
};

/** Project a UserConfig into the slice the credential checks read. */
export function credentialCheckConfig(config: UserConfig): CredentialCheckConfig {
	return {
		providers: config.providers,
		aiProviderKeys: config.aiProviderKeys,
	};
}

/** Which upstream credential slugs are on file (drives router readiness). */
export function aiConfiguredMap(config: UserConfig): Record<string, boolean> {
	const keys = config.aiProviderKeys ?? {};
	return {
		dedalus: Boolean(config.providers?.dedalus),
		anthropic: Boolean(keys.anthropic),
		openai: Boolean(keys.openai),
		openrouter: Boolean(keys.openrouter),
		vercelAiGateway: Boolean(keys.vercelAiGateway),
		google: Boolean(keys.google),
		custom: Boolean(keys.custom?.key),
	};
}

/**
 * Routers a gateway agent can use right now (key on file). When none are ready,
 * fall back to null (let bootstrap pick a configured upstream) rather than
 * fabricating a specific router id the user may not have credentials for.
 */
function readyRouters(runtime: AgentKind, aiConfigured: Record<string, boolean>): (string | null)[] {
	const ready = ROUTER_PRESETS.filter(
		(p) => agentUpstreamReadiness(runtime, p.id, aiConfigured).status === "ready",
	).map((p) => p.id);
	return ready.length > 0 ? ready : [null];
}

/** The credential-gated feasible arm set: {runtime × substrate × model × router}. */
export function enumerateFeasibleArms(config: UserConfig): Arm[] {
	const ccc = credentialCheckConfig(config);
	const aiConfigured = aiConfiguredMap(config);
	const substrates = PROVIDER_KINDS.filter((p) => Boolean(config.providers?.[p]));
	const arms: Arm[] = [];

	for (const runtime of AGENT_KINDS) {
		if (!validateAgentCredentials(runtime, ccc).ok) continue;
		const models = CURATED_MODELS[runtime] ?? [];
		const routers = agentUsesRouter(runtime)
			? readyRouters(runtime, aiConfigured)
			: [null];
		for (const substrate of substrates) {
			for (const model of models) {
				for (const routerId of routers) {
					arms.push({ runtime, substrate, model, routerId });
				}
			}
		}
	}
	return arms;
}
