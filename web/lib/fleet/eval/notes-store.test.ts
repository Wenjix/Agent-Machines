import { describe, expect, it } from "vitest";

import { createNotesStore, NOTES_STORAGE_KEY, type StorageLike } from "./notes-store";

function fakeStorage(initial?: string): StorageLike & { data: Record<string, string> } {
	const data: Record<string, string> = {};
	if (initial !== undefined) data[NOTES_STORAGE_KEY] = initial;
	return {
		data,
		getItem: (k: string) => (k in data ? data[k] : null),
		setItem: (k: string, v: string) => {
			data[k] = v;
		},
	};
}

let counter = 0;
const seq = () => `id-${++counter}`;
const fixedNow = () => 1000;

describe("createNotesStore", () => {
	it("adds notes newest-first and persists to storage", () => {
		const storage = fakeStorage();
		const store = createNotesStore({ storage, makeId: seq, now: fixedNow });
		store.add("synthesis", "clean scan");
		const after = store.add("organism", "too loud");
		expect(after.map((n) => n.text)).toEqual(["too loud", "clean scan"]);
		expect(after[0]).toMatchObject({ mode: "organism", text: "too loud", createdAt: 1000 });
		expect(JSON.parse(storage.data[NOTES_STORAGE_KEY])).toHaveLength(2);
	});

	it("hydrates existing notes from storage", () => {
		const seed = JSON.stringify([
			{ id: "a", mode: "existing", text: "hi", createdAt: 1 },
		]);
		const store = createNotesStore({ storage: fakeStorage(seed) });
		expect(store.list().map((n) => n.id)).toEqual(["a"]);
	});

	it("recovers from malformed JSON as an empty list", () => {
		const store = createNotesStore({ storage: fakeStorage("{not json") });
		expect(store.list()).toEqual([]);
	});

	it("sets sentiment and removes by id", () => {
		const store = createNotesStore({ storage: fakeStorage(), makeId: seq, now: fixedNow });
		const [note] = store.add("synthesis", "x");
		const flagged = store.setSentiment(note.id, "-");
		expect(flagged[0].sentiment).toBe("-");
		expect(store.remove(note.id)).toEqual([]);
	});

	it("clears all notes", () => {
		const store = createNotesStore({ storage: fakeStorage(), makeId: seq, now: fixedNow });
		store.add("synthesis", "x");
		expect(store.clear()).toEqual([]);
	});

	it("keeps notes in memory even if persistence throws (quota)", () => {
		const throwingStorage: StorageLike = {
			getItem: () => null,
			setItem: () => {
				throw new Error("QuotaExceeded");
			},
		};
		const store = createNotesStore({ storage: throwingStorage, makeId: seq, now: fixedNow });
		expect(store.add("synthesis", "x")).toHaveLength(1);
		expect(store.list()).toHaveLength(1);
	});

	it("reload re-reads storage into memory (cross-tab sync)", () => {
		const storage = fakeStorage();
		const store = createNotesStore({ storage, makeId: seq, now: fixedNow });
		storage.data[NOTES_STORAGE_KEY] = JSON.stringify([
			{ id: "z", mode: "organism", text: "external", createdAt: 5 },
		]);
		expect(store.reload().map((n) => n.id)).toEqual(["z"]);
	});
});
