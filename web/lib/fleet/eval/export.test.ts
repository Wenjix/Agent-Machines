import { describe, expect, it } from "vitest";

import { notesToMarkdown } from "./export";
import type { EvalNote } from "./types";

const notes: EvalNote[] = [
	{ id: "1", mode: "synthesis", text: "clean scan", createdAt: 1, sentiment: "+" },
	{ id: "2", mode: "organism", text: "too loud", createdAt: 2, sentiment: "-" },
	{ id: "3", mode: "synthesis", text: "hard to read counts", createdAt: 3 },
];

describe("notesToMarkdown", () => {
	it("groups notes under a heading per mode, in canonical order", () => {
		const md = notesToMarkdown(notes);
		expect(md).toContain("## existing");
		expect(md).toContain("## synthesis");
		expect(md).toContain("## organism");
		expect(md.indexOf("## synthesis")).toBeLessThan(md.indexOf("## organism"));
	});

	it("renders sentiment markers and plain notes", () => {
		const md = notesToMarkdown(notes);
		expect(md).toContain("- 👍 clean scan");
		expect(md).toContain("- 👎 too loud");
		expect(md).toContain("- hard to read counts");
	});

	it("shows an empty-state line for a mode with no notes", () => {
		const md = notesToMarkdown([]);
		expect(md).toContain("_(no notes)_");
	});
});
