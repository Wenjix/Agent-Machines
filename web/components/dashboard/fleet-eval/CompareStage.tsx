"use client";

import type { ReactNode } from "react";

import { EVAL_MODES, type FleetMode } from "@/lib/fleet/eval/types";

/**
 * Keep-alive compare stage. All three interfaces are mounted at once and stacked;
 * exactly one is shown via CSS visibility so flipping is a 0 ms swap that preserves
 * each pane's internal state (scroll, dial layout, canvas). The box is a fixed
 * height so the frame never jumps between variants.
 */
export function CompareStage({
	shown,
	render,
}: {
	shown: FleetMode;
	render: (mode: FleetMode, active: boolean) => ReactNode;
}) {
	return (
		<div
			className="relative w-full overflow-hidden border border-[var(--ret-border)]"
			style={{ height: "clamp(440px, 62vh, 760px)" }}
		>
			{EVAL_MODES.map((mode) => {
				const active = mode === shown;
				return (
					<div
						key={mode}
						aria-hidden={!active}
						className="absolute inset-0"
						style={{
							visibility: active ? "visible" : "hidden",
							opacity: active ? 1 : 0,
							pointerEvents: active ? "auto" : "none",
						}}
					>
						{render(mode, active)}
					</div>
				);
			})}
		</div>
	);
}
