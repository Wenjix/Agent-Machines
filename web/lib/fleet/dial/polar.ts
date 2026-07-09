/**
 * Polar geometry primitives for the radial fleet dial. Hand-rolled (no d3) —
 * angles are measured from 12 o'clock, increasing clockwise, which reads
 * naturally on a clock-like instrument. SVG's y-axis points down, so a "down"
 * step is +y.
 */

export function degToRad(deg: number): number {
	return (deg * Math.PI) / 180;
}

/**
 * Convert a polar coordinate (angle from top, clockwise) to screen xy.
 * angle = 0 → straight up; angle = π/2 → right; angle = π → down.
 */
export function polarToXY(
	cx: number,
	cy: number,
	r: number,
	angle: number,
): { x: number; y: number } {
	return {
		x: cx + r * Math.sin(angle),
		y: cy - r * Math.cos(angle),
	};
}

/** Clamp a number into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
	if (value < min) return min;
	if (value > max) return max;
	return value;
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/**
 * Deterministic 0..1 jitter from a string id. Stable across renders so nodes
 * never jump between polls. Small FNV-1a-style hash, normalized.
 */
export function hashUnit(id: string): number {
	let h = 2166136261;
	for (let i = 0; i < id.length; i += 1) {
		h ^= id.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	// >>> 0 to unsigned, divide to [0,1)
	return (h >>> 0) / 4294967296;
}

/**
 * SVG path for a circular arc from `startAngle` to `endAngle` (both from top,
 * clockwise) at radius `r`. Used for partial ring arcs in Organism mode.
 */
export function arcPath(
	cx: number,
	cy: number,
	r: number,
	startAngle: number,
	endAngle: number,
): string {
	const start = polarToXY(cx, cy, r, startAngle);
	const end = polarToXY(cx, cy, r, endAngle);
	const largeArc = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
	// sweep=1 for clockwise in screen coords
	return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/**
 * Evenly spaced points along an arc — used to lay particles down a spoke.
 */
export function pointsOnArc(
	cx: number,
	cy: number,
	r: number,
	angle: number,
	count: number,
	rStart: number,
): Array<{ x: number; y: number }> {
	if (count <= 0) return [];
	const points: Array<{ x: number; y: number }> = [];
	for (let i = 0; i < count; i += 1) {
		const t = count === 1 ? 0.5 : i / (count - 1);
		points.push(polarToXY(cx, cy, lerp(rStart, r, t), angle));
	}
	return points;
}
