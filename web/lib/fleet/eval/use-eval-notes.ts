"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createNotesStore, NOTES_STORAGE_KEY } from "./notes-store";
import type { EvalNote, FleetMode, NoteSentiment } from "./types";

/** React state over the notes store, with cross-tab sync via the `storage` event. */
export function useEvalNotes() {
	const store = useMemo(() => createNotesStore(), []);
	const [notes, setNotes] = useState<EvalNote[]>(() => store.list());

	useEffect(() => {
		const onStorage = (e: StorageEvent) => {
			if (e.key === NOTES_STORAGE_KEY) setNotes(store.reload());
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, [store]);

	const add = useCallback(
		(mode: FleetMode, text: string) => setNotes(store.add(mode, text)),
		[store],
	);
	const remove = useCallback((id: string) => setNotes(store.remove(id)), [store]);
	const setSentiment = useCallback(
		(id: string, s: NoteSentiment | undefined) => setNotes(store.setSentiment(id, s)),
		[store],
	);
	const clear = useCallback(() => setNotes(store.clear()), [store]);

	return { notes, add, remove, setSentiment, clear };
}
