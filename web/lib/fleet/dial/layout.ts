import { AGENT_HUE } from "@/lib/fleet/agent-styling";
import { PROVIDER_KINDS, type ProviderKind } from "@/lib/user-config/schema";

import { clamp, hashUnit, lerp, polarToXY } from "./polar";
import type {
	DialMachine,
	RadialLayout,
	RadialNode,
	RingBand,
	SpokeGroup,
} from "./types";
import { resolveVisualState } from "./visual-state";

/** Half-angle of a substrate sector's usable fan (radians). 90° sector, ~72° used. */
const SECTOR_HALF = (36 * Math.PI) / 180;
/** Outer margin reserved for spoke labels. */
const LABEL_MARGIN = 30;

/** Ring band radii as fractions of the usable radius R. */
const RING_FRACTION: Record<RingBand, number> = {
	provision: 0.36,
	transition: 0.54,
	live: 0.76,
	fault: 0.9,
};
const HUB_FRACTION = 0.19;

const MS_PER_HOUR = 3_600_000;
const AGE_FADE_HOURS = 720; // 30 days to settle to the dim floor.

/**
 * Pure data → geometry. Deterministic given (machines, activeId, viewport, now):
 * no Math.random, no implicit clock. `now` (ms) is injected so age-based opacity
 * stays testable. Substrates map to four fixed sectors so nodes never jump
 * between polls; within a sector they fan by lifecycle ring.
 */
export function computeDialLayout(
	machines: DialMachine[],
	activeId: string | null,
	viewport: { width: number; height: number },
	now: number,
): RadialLayout {
	const cx = viewport.width / 2;
	const cy = viewport.height / 2;
	const size = Math.min(viewport.width, viewport.height);
	const R = Math.max(0, size / 2 - LABEL_MARGIN);

	const rings: Record<RingBand, number> = {
		provision: RING_FRACTION.provision * R,
		transition: RING_FRACTION.transition * R,
		live: RING_FRACTION.live * R,
		fault: RING_FRACTION.fault * R,
	};
	const hubRadius = HUB_FRACTION * R;

	const spokes: SpokeGroup[] = PROVIDER_KINDS.map((provider, i) => {
		const angle = (i * Math.PI) / 2; // dedalus top, e2b right, sprites bottom, vercel left
		const tip = polarToXY(cx, cy, R, angle);
		return {
			provider,
			label: provider.toUpperCase(),
			angle,
			tipX: tip.x,
			tipY: tip.y,
			count: machines.filter((m) => m.providerKind === provider).length,
		};
	});

	const sectorAngle = (provider: ProviderKind): number => {
		const i = PROVIDER_KINDS.indexOf(provider);
		return (i * Math.PI) / 2;
	};

	const nodes: RadialNode[] = [];

	for (const provider of PROVIDER_KINDS) {
		const inSector = machines
			.filter((m) => m.providerKind === provider)
			// stable angular order across polls
			.sort((a, b) => a.id.localeCompare(b.id));

		// Bucket by lifecycle ring so each band fans independently.
		const buckets = new Map<RingBand, DialMachine[]>();
		const resolved = new Map<string, ReturnType<typeof resolveVisualState>>();
		for (const m of inSector) {
			const v = resolveVisualState(m);
			resolved.set(m.id, v);
			const list = buckets.get(v.ring) ?? [];
			list.push(m);
			buckets.set(v.ring, list);
		}

		const base = sectorAngle(provider);
		for (const [ring, members] of buckets) {
			const n = members.length;
			const spreadH = SECTOR_HALF * clamp(n / 6, 0.34, 1);
			members.forEach((m, k) => {
				const visual = resolved.get(m.id)!;
				// centered fan: (k+0.5)/n maps to [-1, 1], so n=1 sits on the axis
				const t = n === 1 ? 0 : ((k + 0.5) / n) * 2 - 1;
				const angle = base + t * spreadH;
				const jitter = (hashUnit(m.id) - 0.5) * 0.08 * R;
				let radius = rings[ring] + jitter;
				if (m.id === activeId) radius += 0.02 * R;
				radius = clamp(radius, hubRadius + 8, R);

				const { x, y } = polarToXY(cx, cy, radius, angle);
				nodes.push({
					id: m.id,
					machine: m,
					visual,
					x,
					y,
					angle,
					radius,
					size: nodeSize(m),
					opacity: ageOpacity(m.createdAt, now) * visual.intensity,
					hue: AGENT_HUE[m.agentKind] ?? "var(--ret-purple)",
					isActive: m.id === activeId,
				});
			});
		}
	}

	return { cx, cy, R, rings, hubRadius, spokes, nodes };
}

/** Disc radius in px, weighted by machine spec. */
function nodeSize(m: DialMachine): number {
	const weight =
		m.spec.vcpu + m.spec.memoryMib / 2048 + m.spec.storageGib / 40;
	return clamp(4 + 1.5 * weight, 4, 14);
}

/** Newer machines render brighter, settling to a 0.55 floor over ~30 days. */
function ageOpacity(createdAt: string, now: number): number {
	const ms = now - new Date(createdAt).getTime();
	if (!Number.isFinite(ms) || ms < 0) return 1;
	const ageHours = ms / MS_PER_HOUR;
	return lerp(0.55, 1, clamp(1 - ageHours / AGE_FADE_HOURS, 0, 1));
}
