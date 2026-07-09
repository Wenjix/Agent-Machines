"use client";

import { AGENT_LABEL, PROVIDER_LABEL } from "@/lib/user-config/schema";
import { formatFleetUptime } from "@/lib/fleet/agent-styling";
import type { RadialNode } from "@/lib/fleet/dial/types";

/**
 * Focus+context callout. On hover/focus the node expands and this card surfaces
 * the exact facts — name, runtime·substrate, state, spec, age, live CPU, boot
 * phase — while the rest of the dial stays visible behind it. The whole never
 * disappears; you just see one part in detail.
 */
export function DialFisheye({
	node,
	dialSize,
	load,
}: {
	node: RadialNode;
	dialSize: number;
	load: number | undefined;
}) {
	const m = node.machine;
	const v = node.visual;
	const memGib = (m.spec.memoryMib / 1024).toFixed(1);
	const placeRight = node.x < dialSize / 2;
	const placeBelow = node.y < dialSize / 2;

	return (
		<div
			className="pointer-events-none absolute z-10 w-[200px] border border-[var(--ret-border)] bg-[var(--ret-bg)] p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
			style={{
				left: node.x + (placeRight ? node.size + 12 : -(node.size + 12)),
				top: node.y + (placeBelow ? node.size + 8 : -(node.size + 8)),
				transform: `translate(${placeRight ? "0" : "-100%"}, ${placeBelow ? "0" : "-100%"})`,
			}}
		>
			<div className="flex items-center justify-between gap-2">
				<span className="truncate text-[12px] text-[var(--ret-text)]">{m.name}</span>
				{node.isActive ? (
					<span className="shrink-0 border border-[var(--ret-purple)]/45 px-1 text-[8px] uppercase tracking-[0.2em] text-[var(--ret-purple)]">
						active
					</span>
				) : null}
			</div>
			<p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ret-text-muted)]">
				{AGENT_LABEL[m.agentKind]} · {PROVIDER_LABEL[m.providerKind]}
			</p>
			<div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[10px]">
				<Row label="state" value={v.label} valueColor={`var(${v.toneVar})`} />
				<Row label="cpu" value={load === undefined ? "—" : `${Math.round(load * 100)}%`} />
				<Row label="spec" value={`${m.spec.vcpu}v/${memGib}G`} />
				<Row label="age" value={formatFleetUptime(m.createdAt)} />
			</div>
			{v.booting && v.bootPhase ? (
				<p className="mt-1.5 truncate font-mono text-[9px] text-[var(--ret-amber)]">
					⟳ {v.bootPhase} · {Math.round(v.bootProgress * 100)}%
				</p>
			) : null}
			{v.shape === "fault" && v.error ? (
				<p className="mt-1.5 line-clamp-2 font-mono text-[9px] text-[var(--ret-red)]">
					{v.error.slice(0, 90)}
				</p>
			) : null}
		</div>
	);
}

function Row({
	label,
	value,
	valueColor,
}: {
	label: string;
	value: string;
	valueColor?: string;
}) {
	return (
		<div className="flex items-center justify-between gap-2">
			<span className="text-[var(--ret-text-muted)]">{label}</span>
			<span className="truncate" style={{ color: valueColor ?? "var(--ret-text)" }}>
				{value}
			</span>
		</div>
	);
}
