"use client";

import { cn } from "@/lib/cn";

export type FleetMode = "existing" | "synthesis" | "organism";

export const FLEET_MODES: ReadonlyArray<FleetMode> = ["existing", "synthesis", "organism"];

const CAPTION: Record<FleetMode, string> = {
	existing: "The fleet as cards or a compact table.",
	synthesis:
		"Your fleet as a living radial instrument — substrates on spokes, state on rings, load as breath.",
	organism: "The fleet as a glowing organism. Same data, more spectacle.",
};

/**
 * The flagship 3-way view switch. Mirrors the existing ViewToggle styling so it
 * reads as native Reticle. Persistence lives in the parent (MachinesPanel).
 */
export function FleetModeToggle({
	mode,
	onChange,
}: {
	mode: FleetMode;
	onChange: (mode: FleetMode) => void;
}) {
	return (
		<div className="flex flex-col gap-1">
			<div
				role="group"
				aria-label="Fleet view mode"
				className="flex items-center border border-[var(--ret-border)] bg-[var(--ret-bg)]"
			>
				{FLEET_MODES.map((option) => (
					<button
						key={option}
						type="button"
						onClick={() => onChange(option)}
						aria-pressed={mode === option}
						className={cn(
							"px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors",
							mode === option
								? "bg-[var(--ret-surface)] text-[var(--ret-text)]"
								: "text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]",
						)}
					>
						{option}
					</button>
				))}
			</div>
			<p className="max-w-[52ch] text-[10px] italic text-[var(--ret-text-muted)]">
				{CAPTION[mode]}
			</p>
		</div>
	);
}
