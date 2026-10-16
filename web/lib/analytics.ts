/** GA4 property for agent-machines.dev. Measurement IDs are public; this one ships in page HTML. */
export const GA_MEASUREMENT_ID = "G-8FXWW4E2G5";

/** The signed-in dashboard, onboarding, and sign-in never send analytics. */
const UNTRACKED_PATH_PREFIXES = ["/dashboard", "/onboarding", "/sign-in"] as const;

export function isAnalyticsPath(pathname: string): boolean {
	return !UNTRACKED_PATH_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}

/**
 * Sets GA's documented per-property opt-out (`window["ga-disable-<id>"]`) for
 * the route being shown, so client navigations into signed-in routes send no hits.
 */
export function syncAnalyticsOptOut(pathname: string): void {
	Reflect.set(window, `ga-disable-${GA_MEASUREMENT_ID}`, !isAnalyticsPath(pathname));
}
