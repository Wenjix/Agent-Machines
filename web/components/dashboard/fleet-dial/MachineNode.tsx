"use client";

import { AGENT_LABEL, PROVIDER_LABEL } from "@/lib/user-config/schema";
import type { DialSkin, RadialNode } from "@/lib/fleet/dial/types";
import { deriveNodeAnimation } from "@/lib/fleet/dial/animation";
import { cn } from "@/lib/cn";

/**
 * One machine, rendered as an HTML disc overlaid on the SVG frame. HTML (not
 * SVG) so glow (box-shadow), breathing (transform), the boot progress ring, and
 * keyboard/hit-testing are all robust. The frame stays sharp; only these data
 * dots are round — the organic layer living inside the measured instrument.
 */
export function MachineNode({
	node,
	skin,
	load,
	reducedMotion,
	focused,
	onSelect,
	onHover,
}: {
	node: RadialNode;
	skin: DialSkin;
	/** Live CPU load 0..1, or undefined until the metrics wire lands. */
	load: number | undefined;
	reducedMotion: boolean;
	focused: boolean;
	onSelect: (id: string) => void;
	onHover: (id: string | null) => void;
}) {
	const { visual } = node;
	const anim = deriveNodeAnimation(visual, skin, load, reducedMotion);
	const diameter = node.size * 2;
	const toneColor = `var(${visual.toneVar})`;
	const glowColor = `color-mix(in srgb, ${toneColor} 50%, transparent)`;

	return (
		<div
			className="pointer-events-none absolute"
			style={{
				left: node.x,
				top: node.y,
				transform: "translate(-50%, -50%)",
				opacity: node.opacity,
			}}
		>
			{/* boot progress ring (13 phases) */}
			{visual.booting || visual.bootFailed ? (
				<div
					className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
					style={{
						width: diameter + 10,
						height: diameter + 10,
						background: `conic-gradient(from 0deg, ${
							visual.bootFailed ? "var(--ret-red)" : "var(--ret-amber)"
						} ${visual.bootProgress * 360}deg, transparent 0)`,
						maskImage:
							"radial-gradient(circle, transparent 64%, #000 66%, #000 78%, transparent 80%)",
						WebkitMaskImage:
							"radial-gradient(circle, transparent 64%, #000 66%, #000 78%, transparent 80%)",
						opacity: 0.85,
					}}
				/>
			) : null}

			{/* active accent ring + tether mark */}
			{node.isActive ? (
				<div
					className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
					style={{
						width: diameter + 14,
						height: diameter + 14,
						border: "1px solid color-mix(in srgb, var(--ret-purple) 60%, transparent)",
					}}
				/>
			) : null}

			<button
				type="button"
				aria-label={ariaLabel(node)}
				aria-pressed={focused}
				onClick={() => onSelect(node.id)}
				onMouseEnter={() => onHover(node.id)}
				onMouseLeave={() => onHover(null)}
				onFocus={() => onHover(node.id)}
				onBlur={() => onHover(null)}
				className={cn(
					"pointer-events-auto relative grid place-items-center rounded-full outline-none transition-transform",
					"focus-visible:ring-2 focus-visible:ring-[var(--ret-purple)]",
					anim.breathe && !focused && "dial-node-breathe",
				)}
				style={{
					width: diameter,
					height: diameter,
					// shape: filled = hue core; hollow = ring only; fault = desaturated
					background:
						visual.shape === "hollow"
							? "transparent"
							: visual.shape === "fault"
								? `color-mix(in srgb, ${node.hue} 22%, var(--ret-bg))`
								: node.hue,
					border:
						visual.shape === "hollow"
							? "1px solid var(--ret-text-muted)"
							: `1.5px solid ${toneColor}`,
					boxShadow: anim.glow > 0 ? `0 0 ${anim.glow}px ${glowColor}` : "none",
					["--breath-dur" as string]: `${anim.breathDur}s`,
					["--breath-amp" as string]: anim.breathAmp,
					transform: focused ? "scale(2.4)" : undefined,
					zIndex: focused ? 5 : undefined,
				} as React.CSSProperties}
			>
				{visual.shape === "fault" ? (
					<span
						className="leading-none text-[var(--ret-red)]"
						style={{ fontSize: Math.max(8, node.size) }}
						aria-hidden="true"
					>
						✕
					</span>
				) : null}
			</button>

			{/* persistent fault label */}
			{visual.shape === "fault" && visual.error ? (
				<span
					className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ret-red)]"
					style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}
				>
					{visual.error.slice(0, 28)}
				</span>
			) : null}
		</div>
	);
}

function ariaLabel(node: RadialNode): string {
	const m = node.machine;
	return `${m.name}, ${AGENT_LABEL[m.agentKind]} on ${PROVIDER_LABEL[m.providerKind]}, ${node.visual.label}`;
}

