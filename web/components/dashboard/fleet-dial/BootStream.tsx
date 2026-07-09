"use client";

import { lerp, polarToXY } from "@/lib/fleet/dial/polar";
import type { DialSkin, RadialNode } from "@/lib/fleet/dial/types";
import { cn } from "@/lib/cn";

/**
 * A booting machine's particle stream, flowing along its spoke from the hub
 * outward to the node — visualizing "this worker is being assembled and is on
 * its way to live." Frozen and red when the boot has failed. Rendered in a
 * full-dial coordinate layer (not node-local) so the path math is simple.
 */
export function BootStream({
	node,
	cx,
	cy,
	hubRadius,
	skin,
	reducedMotion,
}: {
	node: RadialNode;
	cx: number;
	cy: number;
	hubRadius: number;
	skin: DialSkin;
	reducedMotion: boolean;
}) {
	const failed = node.visual.bootFailed;
	const count = skin.particlesPerStream;
	const color = failed ? "var(--ret-red)" : "var(--ret-amber)";
	const rStart = hubRadius + 4;
	const animate = !reducedMotion && !failed;

	const dots = Array.from({ length: count }, (_, i) => {
		const t = count === 1 ? 0.5 : i / (count - 1);
		const r = lerp(rStart, node.radius, t);
		const { x, y } = polarToXY(cx, cy, r, node.angle);
		return { x, y, delay: t * 1.6, key: i };
	});

	return (
		<div className="pointer-events-none absolute inset-0" aria-hidden="true">
			{dots.map((d) => (
				<span
					key={d.key}
					className={cn(
						"absolute rounded-full",
						animate && "dial-stream-dot",
					)}
					style={{
						left: d.x,
						top: d.y,
						width: 3,
						height: 3,
						transform: "translate(-50%, -50%)",
						background: color,
						opacity: animate ? undefined : 0.7,
						boxShadow: `0 0 ${4 * skin.glowMultiplier}px ${color}`,
						["--stream-delay" as string]: `${d.delay}s`,
					} as React.CSSProperties}
				/>
			))}
		</div>
	);
}
