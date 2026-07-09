"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { computeDialLayout } from "@/lib/fleet/dial/layout";
import { skinForMode } from "@/lib/fleet/dial/skins";
import type { DialMachine, DialMode } from "@/lib/fleet/dial/types";
import { summarizeFleet } from "@/lib/fleet/summarize";
import { AGENT_LABEL, PROVIDER_LABEL } from "@/lib/user-config/schema";

import { BootStream } from "./BootStream";
import { DialCanvasBloom } from "./DialCanvasBloom";
import { DialCenter } from "./DialCenter";
import { DialFisheye } from "./DialFisheye";
import { DialFrame } from "./DialFrame";
import { MachineNode } from "./MachineNode";

/**
 * The Living Radial Fleet. Composes the shared SVG frame, the HTML node layer,
 * boot streams, the center readout, an optional Organism bloom canvas, and the
 * fisheye callout — all from one pure geometry pass. Data + selection flow in as
 * props (MachinesPanel owns the single poll loop and the `?focus` URL state).
 */
export function FleetDial({
	machines,
	activeMachineId,
	mode,
	focusedId,
	onSelect,
	loadById,
	active = true,
}: {
	machines: DialMachine[];
	activeMachineId: string | null;
	mode: DialMode;
	focusedId: string | null;
	onSelect: (id: string | null) => void;
	/** Optional live CPU load per machine id (0..1). Absent in v1. */
	loadById?: Record<string, number>;
	/** When false, the ambient canvas pauses its animation loop (kept-alive but hidden). */
	active?: boolean;
}) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [dialSize, setDialSize] = useState(0);
	const [reducedMotion, setReducedMotion] = useState(false);
	const [hoveredId, setHoveredId] = useState<string | null>(null);

	const skin = skinForMode(mode);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const measure = () => {
			const rect = el.getBoundingClientRect();
			setDialSize(Math.max(0, Math.floor(Math.min(rect.width, rect.height))));
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	useEffect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		const update = () => setReducedMotion(mq.matches);
		update();
		mq.addEventListener("change", update);
		return () => mq.removeEventListener("change", update);
	}, []);

	const layout = useMemo(
		() =>
			dialSize > 0
				? computeDialLayout(machines, activeMachineId, { width: dialSize, height: dialSize }, Date.now())
				: null,
		[machines, activeMachineId, dialSize],
	);

	const summary = useMemo(() => summarizeFleet(machines), [machines]);
	const activeName = useMemo(
		() => machines.find((m) => m.id === activeMachineId)?.name ?? null,
		[machines, activeMachineId],
	);

	const focusTarget = hoveredId ?? focusedId;
	const fisheyeNode = layout?.nodes.find((n) => n.id === focusTarget) ?? null;
	const bootingNodes = layout?.nodes.filter((n) => n.visual.booting || n.visual.bootFailed) ?? [];
	// A hidden keep-alive pane (active === false) freezes like reduced-motion: no
	// node breathing, no boot-stream particles, no canvas RAF — only the shown pane
	// animates. Without this, two off-screen dials keep their CSS loops running.
	const frozen = reducedMotion || !active;

	return (
		<div
			className="relative flex min-h-[clamp(440px,62vh,760px)] w-full items-center justify-center overflow-hidden border border-[var(--ret-border)]"
			ref={containerRef}
			style={skin.background ? { background: skin.background } : undefined}
		>
			{layout && dialSize > 0 ? (
				<div
					className="relative"
					style={{ width: dialSize, height: dialSize }}
					onMouseLeave={() => setHoveredId(null)}
				>
					{skin.canvasBloom ? (
						<DialCanvasBloom
							nodes={layout.nodes}
							dialSize={dialSize}
							liveRadius={layout.rings.live}
							cx={layout.cx}
							cy={layout.cy}
							reducedMotion={reducedMotion}
							active={active}
						/>
					) : null}

					<svg
						width={dialSize}
						height={dialSize}
						viewBox={`0 0 ${dialSize} ${dialSize}`}
						className="absolute inset-0"
					>
						<DialFrame layout={layout} skin={skin} />
					</svg>

					{bootingNodes.map((node) => (
						<BootStream
							key={`stream-${node.id}`}
							node={node}
							cx={layout.cx}
							cy={layout.cy}
							hubRadius={layout.hubRadius}
							skin={skin}
							reducedMotion={frozen}
						/>
					))}

					{layout.nodes.map((node) => (
						<MachineNode
							key={node.id}
							node={node}
							skin={skin}
							load={loadById?.[node.id]}
							reducedMotion={frozen}
							focused={node.id === focusTarget}
							onSelect={onSelect}
							onHover={setHoveredId}
						/>
					))}

					<DialCenter
						summary={summary}
						activeName={activeName}
						diameter={layout.hubRadius * 2}
						skin={skin}
					/>

					{fisheyeNode ? (
						<DialFisheye node={fisheyeNode} dialSize={dialSize} load={loadById?.[fisheyeNode.id]} />
					) : null}

					{machines.length === 0 ? (
						<div className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-1 text-center">
							<p className="text-[12px] text-[var(--ret-text-dim)]">No machines yet</p>
							<p className="max-w-[40ch] text-[11px] text-[var(--ret-text-muted)]">
								The instrument is armed and empty — spin one up to see it populate.
							</p>
						</div>
					) : null}
				</div>
			) : null}

			{/* Screen-reader parallel: the exact fleet without parsing geometry. */}
			<table className="sr-only">
				<caption>Fleet machines</caption>
				<thead>
					<tr>
						<th>Name</th>
						<th>Runtime</th>
						<th>Substrate</th>
						<th>State</th>
					</tr>
				</thead>
				<tbody>
					{machines.map((m) => (
						<tr key={m.id}>
							<td>{m.name}</td>
							<td>{AGENT_LABEL[m.agentKind]}</td>
							<td>{PROVIDER_LABEL[m.providerKind]}</td>
							<td>{m.live.ok ? m.live.state : "probe unreachable"}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
