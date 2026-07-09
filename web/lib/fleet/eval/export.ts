import { EVAL_MODES, type EvalNote } from "./types";

function marker(note: EvalNote): string {
	if (note.sentiment === "+") return "👍 ";
	if (note.sentiment === "-") return "👎 ";
	return "";
}

/** Renders notes as a Markdown board grouped by interface, in flip order. */
export function notesToMarkdown(notes: EvalNote[]): string {
	const lines: string[] = ["# Fleet interface eval notes", ""];
	for (const mode of EVAL_MODES) {
		lines.push(`## ${mode}`);
		const group = notes.filter((n) => n.mode === mode);
		if (group.length === 0) {
			lines.push("_(no notes)_");
		} else {
			for (const note of group) lines.push(`- ${marker(note)}${note.text}`);
		}
		lines.push("");
	}
	return lines.join("\n");
}
