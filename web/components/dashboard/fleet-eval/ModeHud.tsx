"use client";

import type { FleetMode } from "@/lib/fleet/eval/types";

/** Always-on orientation chip: current mode (or PEEK target) + a shortcut hint. */
export function ModeHud({ mode, peeking }: { mode: FleetMode; peeking: boolean }) {
	return (
		<div className="pointer-events-none absolute right-3 top-3 z-20 flex flex-col items-end gap-1">
			<span className="border border-[var(--ret-border)] bg-[var(--ret-bg)]/85 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text)]">
				{peeking ? `peek · ${mode}` : mode}
			</span>
			<span className="font-mono text-[9px] tracking-[0.14em] text-[var(--ret-text-muted)]">
				` cycle · 1/2/3 jump · hold space peek · n note
			</span>
		</div>
	);
}
