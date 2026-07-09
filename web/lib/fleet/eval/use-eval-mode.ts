"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { EVAL_FLAG_KEY, resolveEvalMode } from "./eval-mode";

/**
 * Whether the personal eval harness is active. Defaults off on first paint
 * (SSR-safe), then resolves ?eval + the sticky localStorage flag in an effect.
 */
export function useEvalMode(): boolean {
	const params = useSearchParams();
	const evalParam = params.get("eval");
	const [on, setOn] = useState(false);

	useEffect(() => {
		let stored: string | null = null;
		try {
			stored = window.localStorage.getItem(EVAL_FLAG_KEY);
		} catch {
			// storage unavailable
		}
		const resolved = resolveEvalMode(evalParam, stored);
		if (resolved.persist !== null) {
			try {
				window.localStorage.setItem(EVAL_FLAG_KEY, resolved.persist);
			} catch {
				// storage unavailable; param still applies for this session
			}
		}
		setOn(resolved.on);
	}, [evalParam]);

	return on;
}
