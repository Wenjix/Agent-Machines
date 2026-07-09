import { polarToXY } from "@/lib/fleet/dial/polar";
import type { DialSkin, RadialLayout, RingBand } from "@/lib/fleet/dial/types";

/**
 * The measured Reticle frame: concentric lifecycle rings, four substrate spoke
 * rails, a center crosshair, and spoke labels. Pure SVG, theme-token-colored,
 * re-rendered only when the layout/skin changes — never per animation frame.
 */
export function DialFrame({
	layout,
	skin,
}: {
	layout: RadialLayout;
	skin: DialSkin;
}) {
	const { cx, cy, R, rings, hubRadius, spokes } = layout;
	const ringOrder: RingBand[] = ["provision", "transition", "live", "fault"];

	return (
		<g opacity={skin.frameOpacity} aria-hidden="true">
			{/* lifecycle rings */}
			{ringOrder.map((band) => (
				<circle
					key={band}
					cx={cx}
					cy={cy}
					r={rings[band]}
					fill="none"
					stroke={band === "live" ? "var(--ret-rail)" : "var(--ret-grid)"}
					strokeWidth={1}
				/>
			))}
			{/* outer boundary */}
			<circle
				cx={cx}
				cy={cy}
				r={R}
				fill="none"
				stroke="var(--ret-rail)"
				strokeWidth={1}
			/>
			{/* hub ring */}
			<circle
				cx={cx}
				cy={cy}
				r={hubRadius}
				fill="none"
				stroke="var(--ret-grid)"
				strokeWidth={1}
			/>

			{/* spokes + tick crosses + labels */}
			{spokes.map((spoke) => {
				const inner = polarToXY(cx, cy, hubRadius, spoke.angle);
				const outer = polarToXY(cx, cy, R, spoke.angle);
				const labelPos = polarToXY(cx, cy, R + 16, spoke.angle);
				const empty = spoke.count === 0;
				return (
					<g key={spoke.provider}>
						<line
							x1={inner.x}
							y1={inner.y}
							x2={outer.x}
							y2={outer.y}
							stroke={empty ? "var(--ret-grid)" : "var(--ret-rail)"}
							strokeWidth={1}
						/>
						<TickCross x={outer.x} y={outer.y} />
						<text
							x={labelPos.x}
							y={labelPos.y}
							textAnchor="middle"
							dominantBaseline="middle"
							fill="var(--ret-text-muted)"
							opacity={skin.labelOpacity}
							style={{
								fontFamily: "var(--font-mono)",
								fontSize: 10,
								letterSpacing: "0.18em",
							}}
						>
							{spoke.label}
							{empty ? " 0" : ` ${spoke.count}`}
						</text>
					</g>
				);
			})}

			{/* center crosshair */}
			<TickCross x={cx} y={cy} arm={6} />
		</g>
	);
}

function TickCross({ x, y, arm = 4 }: { x: number; y: number; arm?: number }) {
	return (
		<g stroke="var(--ret-cross)" strokeWidth={1}>
			<line x1={x - arm} y1={y} x2={x + arm} y2={y} />
			<line x1={x} y1={y - arm} x2={x} y2={y + arm} />
		</g>
	);
}
