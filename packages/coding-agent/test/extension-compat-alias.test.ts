import { describe, expect, it } from "vitest";
import { VIRTUAL_MODULES } from "../src/core/extensions/bundled-modules.js";

describe("extension pi-ai/compat aliases", () => {
	it("maps earendil and mariozechner compat specifiers to the pi-ai module", () => {
		expect(VIRTUAL_MODULES["@earendil-works/pi-ai/compat"]).toBe(VIRTUAL_MODULES["@earendil-works/pi-ai"]);
		expect(VIRTUAL_MODULES["@mariozechner/pi-ai/compat"]).toBe(VIRTUAL_MODULES["@mariozechner/pi-ai"]);
		expect(VIRTUAL_MODULES["@earendil-works/pi-ai/compat"]).toBeDefined();
	});
});
