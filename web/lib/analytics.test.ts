import { describe, expect, it } from "vitest";
import { GA_MEASUREMENT_ID, isAnalyticsPath } from "./analytics";

describe("Google Analytics scope", () => {
	it("uses a GA4 web stream ID", () => {
		expect(GA_MEASUREMENT_ID).toMatch(/^G-[A-Z0-9]{10}$/);
	});

	it("measures public pages", () => {
		for (const pathname of ["/", "/docs", "/pricing", "/privacy", "/product/workers", "/agents/hermes"]) {
			expect(isAnalyticsPath(pathname), pathname).toBe(true);
		}
	});

	it("never measures the signed-in dashboard, onboarding, or sign-in", () => {
		for (const pathname of [
			"/dashboard",
			"/dashboard/machines/abc/terminal",
			"/onboarding",
			"/sign-in",
			"/sign-in/factor-one",
		]) {
			expect(isAnalyticsPath(pathname), pathname).toBe(false);
		}
	});

	it("matches whole path segments only", () => {
		expect(isAnalyticsPath("/dashboards-guide")).toBe(true);
	});
});
