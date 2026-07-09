"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { CompareStage } from "./CompareStage";
import { EvalNotesPanel } from "./EvalNotesPanel";
import { ModeHud } from "./ModeHud";
import { cycleMode, keyToAction, keyUpToAction } from "@/lib/fleet/eval/keys";
import type { FleetMode } from "@/lib/fleet/eval/types";

function isInteractive(el: EventTarget | null): boolean {
	if (!(el instanceof HTMLElement)) return false;
	const tag = el.tagName;
	return (
		tag === "INPUT" ||
		tag === "TEXTAREA" ||
		tag === "BUTTON" ||
		el.isContentEditable ||
		el.getAttribute("role") === "button"
	);
}

/**
 * Personal blink-compare controller. Owns the shown mode (committed `mode` is
 * controlled by the parent; `peek` is transient), wires the keyboard shortcuts,
 * and lays out the keep-alive stage beside the notes board.
 */
export function EvalHarness({
	mode,
	onModeChange,
	renderPane,
}: {
	mode: FleetMode;
	onModeChange: (mode: FleetMode) => void;
	renderPane: (mode: FleetMode, active: boolean) => ReactNode;
}) {
	const [peek, setPeek] = useState<FleetMode | null>(null);
	const noteInputRef = useRef<HTMLInputElement | null>(null);

	// Track the previously-committed mode so "hold Space" peeks where you just were.
	const prevModeRef = useRef<FleetMode | null>(null);
	const lastModeRef = useRef<FleetMode>(mode);
	useEffect(() => {
		if (lastModeRef.current !== mode) {
			prevModeRef.current = lastModeRef.current;
			lastModeRef.current = mode;
		}
	}, [mode]);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.repeat) return;
			if (isInteractive(e.target)) return;
			const action = keyToAction(e.key, { shift: e.shiftKey });
			if (!action) return;
			e.preventDefault();
			switch (action.type) {
				case "cycle":
					onModeChange(cycleMode(mode, action.dir));
					break;
				case "jump":
					onModeChange(action.mode);
					break;
				case "peekStart":
					setPeek((p) => p ?? prevModeRef.current ?? cycleMode(mode, 1));
					break;
				case "focusNote":
					noteInputRef.current?.focus();
					break;
				case "peekEnd":
					break;
			}
		};
		const onKeyUp = (e: KeyboardEvent) => {
			const action = keyUpToAction(e.key);
			if (action?.type === "peekEnd") setPeek(null);
		};
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
		};
	}, [mode, onModeChange]);

	const shown = peek ?? mode;

	return (
		<div className="flex w-full gap-3">
			<div className="relative min-w-0 flex-1">
				<ModeHud mode={shown} peeking={peek !== null} />
				<CompareStage shown={shown} render={renderPane} />
			</div>
			<EvalNotesPanel currentMode={shown} inputRef={noteInputRef} />
		</div>
	);
}
