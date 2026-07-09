import type { EvalNote, FleetMode, NoteSentiment } from "./types";

export const NOTES_STORAGE_KEY = "am-fleet-eval-notes";

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type NotesStore = {
	list(): EvalNote[];
	add(mode: FleetMode, text: string): EvalNote[];
	setSentiment(id: string, sentiment: NoteSentiment | undefined): EvalNote[];
	remove(id: string): EvalNote[];
	clear(): EvalNote[];
	reload(): EvalNote[];
};

function isNote(v: unknown): v is EvalNote {
	if (typeof v !== "object" || v === null) return false;
	const n = v as Record<string, unknown>;
	return (
		typeof n.id === "string" &&
		typeof n.text === "string" &&
		typeof n.createdAt === "number" &&
		(n.mode === "existing" || n.mode === "synthesis" || n.mode === "organism")
	);
}

function safeLocalStorage(): StorageLike | null {
	try {
		return typeof window !== "undefined" ? window.localStorage : null;
	} catch {
		return null;
	}
}

function readAll(storage: StorageLike | null): EvalNote[] {
	if (!storage) return [];
	try {
		const raw = storage.getItem(NOTES_STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter(isNote) : [];
	} catch {
		return [];
	}
}

export function createNotesStore(opts?: {
	storage?: StorageLike | null;
	makeId?: () => string;
	now?: () => number;
}): NotesStore {
	const storage = opts?.storage === undefined ? safeLocalStorage() : opts.storage;
	const makeId = opts?.makeId ?? (() => crypto.randomUUID());
	const now = opts?.now ?? (() => Date.now());

	let notes: EvalNote[] = readAll(storage);

	const persist = () => {
		if (!storage) return;
		try {
			storage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
		} catch {
			// storage full/unavailable — keep the in-memory copy as source of truth
		}
	};

	return {
		list: () => notes.slice(),
		add(mode, text) {
			notes = [{ id: makeId(), mode, text, createdAt: now() }, ...notes];
			persist();
			return notes.slice();
		},
		setSentiment(id, sentiment) {
			notes = notes.map((n) => (n.id === id ? { ...n, sentiment } : n));
			persist();
			return notes.slice();
		},
		remove(id) {
			notes = notes.filter((n) => n.id !== id);
			persist();
			return notes.slice();
		},
		clear() {
			notes = [];
			persist();
			return notes.slice();
		},
		reload() {
			notes = readAll(storage);
			return notes.slice();
		},
	};
}
