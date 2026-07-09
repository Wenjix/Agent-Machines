"use client";

import { useEffect, useRef, useState } from "react";

import { notesToMarkdown } from "@/lib/fleet/eval/export";
import { useEvalNotes } from "@/lib/fleet/eval/use-eval-notes";
import { EVAL_MODES, type FleetMode } from "@/lib/fleet/eval/types";
import { cn } from "@/lib/cn";

/**
 * The mode-tagged observation board. New notes are tagged with `currentMode`
 * (the shown pane at time of writing). Grouped by interface so it reads as a
 * "what's working / what's not" list per variant. Local-only for now.
 */
export function EvalNotesPanel({
	currentMode,
	inputRef,
}: {
	currentMode: FleetMode;
	inputRef: React.RefObject<HTMLInputElement | null>;
}) {
	const { notes, add, remove, setSentiment, clear } = useEvalNotes();
	const [draft, setDraft] = useState("");
	const [collapsed, setCollapsed] = useState(false);
	const [copied, setCopied] = useState(false);
	const copyTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (copyTimeoutRef.current !== null) window.clearTimeout(copyTimeoutRef.current);
		};
	}, []);

	const submit = () => {
		const text = draft.trim();
		if (!text) return;
		add(currentMode, text);
		setDraft("");
	};

	const copyMarkdown = async () => {
		try {
			await navigator.clipboard.writeText(notesToMarkdown(notes));
			setCopied(true);
			if (copyTimeoutRef.current !== null) window.clearTimeout(copyTimeoutRef.current);
			copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 1200);
		} catch {
			// clipboard blocked; no-op
		}
	};

	if (collapsed) {
		return (
			<button
				type="button"
				onClick={() => setCollapsed(false)}
				className="h-full shrink-0 border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]"
			>
				notes ({notes.length})
			</button>
		);
	}

	return (
		<aside className="flex w-72 shrink-0 flex-col gap-2 border border-[var(--ret-border)] bg-[var(--ret-bg)] p-2">
			<div className="flex items-center justify-between">
				<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ret-text-muted)]">
					eval notes
				</span>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={copyMarkdown}
						className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]"
					>
						<span aria-live="polite">{copied ? "copied" : "copy md"}</span>
					</button>
					<button
						type="button"
						onClick={() => setCollapsed(true)}
						className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)] hover:text-[var(--ret-text)]"
					>
						hide
					</button>
				</div>
			</div>

			<div className="flex items-center gap-1">
				<span className="border border-[var(--ret-border)] px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)]">
					{currentMode}
				</span>
				<input
					ref={inputRef}
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") submit();
						if (e.key === "Escape") e.currentTarget.blur();
					}}
					placeholder="what's working / not…"
					className="min-w-0 flex-1 border border-[var(--ret-border)] bg-[var(--ret-bg)] px-2 py-1 font-mono text-[11px] text-[var(--ret-text)] placeholder:text-[var(--ret-text-muted)] focus:border-[var(--ret-purple)] focus:outline-none"
				/>
			</div>

			<div className="flex max-h-[46vh] flex-col gap-2 overflow-y-auto">
				{EVAL_MODES.map((mode) => {
					const group = notes.filter((n) => n.mode === mode);
					return (
						<div key={mode} className="flex flex-col gap-1">
							<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ret-text-dim)]">
								{mode} ({group.length})
							</span>
							{group.map((note) => (
								<div
									key={note.id}
									className="flex items-start gap-1 border-l border-[var(--ret-border)] pl-1.5 text-[11px] text-[var(--ret-text)]"
								>
									<button
										type="button"
										aria-label="toggle working"
										onClick={() =>
											setSentiment(note.id, note.sentiment === "+" ? undefined : "+")
										}
										className={cn(
											"font-mono text-[10px]",
											note.sentiment === "+" ? "opacity-100" : "opacity-30",
										)}
									>
										👍
									</button>
									<button
										type="button"
										aria-label="toggle not working"
										onClick={() =>
											setSentiment(note.id, note.sentiment === "-" ? undefined : "-")
										}
										className={cn(
											"font-mono text-[10px]",
											note.sentiment === "-" ? "opacity-100" : "opacity-30",
										)}
									>
										👎
									</button>
									<span className="min-w-0 flex-1 break-words">{note.text}</span>
									<button
										type="button"
										aria-label="delete note"
										onClick={() => remove(note.id)}
										className="font-mono text-[10px] text-[var(--ret-text-muted)] hover:text-[var(--ret-red)]"
									>
										×
									</button>
								</div>
							))}
						</div>
					);
				})}
			</div>

			{notes.length > 0 ? (
				<button
					type="button"
					onClick={clear}
					className="self-end font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--ret-text-muted)] hover:text-[var(--ret-red)]"
				>
					clear all
				</button>
			) : null}
		</aside>
	);
}
