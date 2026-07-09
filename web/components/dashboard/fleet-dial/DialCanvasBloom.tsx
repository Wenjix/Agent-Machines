"use client";

import { useEffect, useRef } from "react";

import type { NodeTone, RadialNode } from "@/lib/fleet/dial/types";

/**
 * Organism-only ambient bloom. A single requestAnimationFrame loop paints
 * additive glow under each live node plus a slow drift of particles around the
 * live ring — the cinematic layer. Pauses on hidden tab and renders one static
 * frame under prefers-reduced-motion. Uses a fixed warm palette (Organism forces
 * a dark field, so it ignores the light --ret-* values by design).
 */

const TONE_RGB: Record<NodeTone, [number, number, number]> = {
	ok: [59, 209, 122],
	warn: [255, 176, 32],
	err: [255, 74, 60],
	muted: [120, 120, 130],
};

export function DialCanvasBloom({
	nodes,
	dialSize,
	liveRadius,
	cx,
	cy,
	reducedMotion,
}: {
	nodes: RadialNode[];
	dialSize: number;
	liveRadius: number;
	cx: number;
	cy: number;
	reducedMotion: boolean;
}) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const driftRef = useRef<Array<{ angle: number; r: number; speed: number; size: number }>>([]);

	// Seed ambient drift particles once.
	if (driftRef.current.length === 0) {
		driftRef.current = Array.from({ length: 26 }, () => ({
			angle: Math.random() * Math.PI * 2,
			r: liveRadius + (Math.random() - 0.5) * liveRadius * 0.16,
			speed: 0.04 + Math.random() * 0.08,
			size: 0.8 + Math.random() * 1.6,
		}));
	}

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = dialSize * dpr;
		canvas.height = dialSize * dpr;
		ctx.scale(dpr, dpr);

		let raf = 0;
		let last = performance.now();
		let running = true;

		const drawBlobs = (clock: number) => {
			ctx.clearRect(0, 0, dialSize, dialSize);
			ctx.globalCompositeOperation = "lighter";
			for (const node of nodes) {
				if (node.visual.tone === "muted") continue;
				const [r, g, b] = TONE_RGB[node.visual.tone];
				const pulse = 0.7 + 0.3 * Math.sin(clock * 1.4 + node.x * 0.05);
				const radius = node.size * 5 * pulse;
				const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, radius);
				grad.addColorStop(0, `rgba(${r},${g},${b},${0.42 * node.opacity})`);
				grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
				ctx.fillStyle = grad;
				ctx.beginPath();
				ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
				ctx.fill();
			}
		};

		const drawDrift = () => {
			for (const p of driftRef.current) {
				const x = cx + p.r * Math.cos(p.angle);
				const y = cy + p.r * Math.sin(p.angle);
				ctx.fillStyle = `rgba(255,180,120,0.5)`;
				ctx.beginPath();
				ctx.arc(x, y, p.size, 0, Math.PI * 2);
				ctx.fill();
			}
		};

		if (reducedMotion) {
			drawBlobs(0);
			drawDrift();
			return;
		}

		const loop = (now: number) => {
			if (!running) return;
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			const clock = now / 1000;
			drawBlobs(clock);
			for (const p of driftRef.current) p.angle += p.speed * dt;
			drawDrift();
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);

		const onVisibility = () => {
			if (document.visibilityState === "visible") {
				if (!running) {
					running = true;
					last = performance.now();
					raf = requestAnimationFrame(loop);
				}
			} else {
				running = false;
				cancelAnimationFrame(raf);
			}
		};
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			running = false;
			cancelAnimationFrame(raf);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [nodes, dialSize, liveRadius, cx, cy, reducedMotion]);

	return (
		<canvas
			ref={canvasRef}
			className="pointer-events-none absolute inset-0"
			style={{ width: dialSize, height: dialSize }}
			aria-hidden="true"
		/>
	);
}
