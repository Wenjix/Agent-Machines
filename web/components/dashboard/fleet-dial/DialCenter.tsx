"use client";

import type { FleetSummary } from "@/lib/fleet/summarize";
import type { DialSkin } from "@/lib/fleet/dial/types";

/**
 * The center hub readout — the dial's answer to alis_OS's "Services" core.
 * Each row is glyph + color + label (three redundant channels for a11y). Counts
 * are announced via aria-live so screen readers hear transitions.
 */
export function DialCenter({
	summary,
	activeName,
	diameter,
	skin,
}: {
	summary: FleetSummary;
	activeName: string | null;
	diameter: number;
	skin: DialSkin;
}) {
	const rows: Array<{ glyph: string; label: string; n: number; color: string }> = [
		{ glyph: "●", label: "running", n: summary.running, color: "var(--ret-green)" },
		{ glyph: "◐", label: "booting", n: summary.booting, color: "var(--ret-amber)" },
		{ glyph: "◔", label: "sleeping", n: summary.sleeping, color: "var(--ret-text-dim)" },
		{ glyph: "✕", label: "failed", n: summary.failed, color: "var(--ret-red)" },
	];
	const labelColor = skin.forceDark ? "rgba(255,255,255,0.55)" : "var(--ret-text-muted)";
	const textColor = skin.forceDark ? "rgba(255,255,255,0.92)" : "var(--ret-text)";

	return (
		<div
			className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center text-center"
			style={{ width: diameter * 1.7, maxWidth: diameter * 1.7 }}
			aria-live="polite"
		>
			<span
				className="font-mono uppercase tracking-[0.22em]"
				style={{ fontSize: 9, color: labelColor }}
			>
				Fleet
			</span>
			<span
				className="ret-display leading-none"
				style={{
					fontSize: `clamp(22px, ${diameter * 0.5}px, 44px)`,
					color: textColor,
				}}
			>
				{summary.total}
			</span>
			<div
				className="my-1.5 h-px w-8"
				style={{ background: skin.forceDark ? "rgba(255,255,255,0.18)" : "var(--ret-grid)" }}
			/>
			<dl className="flex flex-col gap-0.5">
				{rows.map((r) => (
					<div key={r.label} className="flex items-center justify-center gap-1.5">
						<span style={{ color: r.color, fontSize: 9 }} aria-hidden="true">
							{r.glyph}
						</span>
						<dd
							className="font-mono tabular-nums"
							style={{ fontSize: 10, color: textColor }}
						>
							{r.n}
						</dd>
						<dt
							className="font-mono uppercase tracking-[0.16em]"
							style={{ fontSize: 8, color: labelColor }}
						>
							{r.label}
						</dt>
					</div>
				))}
			</dl>
			{activeName ? (
				<span
					className="mt-1.5 max-w-full truncate font-mono uppercase tracking-[0.16em]"
					style={{ fontSize: 8, color: "var(--ret-purple)" }}
					title={activeName}
				>
					▸ {activeName}
				</span>
			) : null}
		</div>
	);
}
