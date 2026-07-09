export const EVAL_FLAG_KEY = "am-fleet-eval";

/** Pure gate resolution: the ?eval param wins and persists; otherwise the stored flag decides. */
export function resolveEvalMode(
	param: string | null,
	stored: string | null,
): { on: boolean; persist: "1" | "0" | null } {
	if (param === "1") return { on: true, persist: "1" };
	if (param === "0") return { on: false, persist: "0" };
	return { on: stored === "1", persist: null };
}
