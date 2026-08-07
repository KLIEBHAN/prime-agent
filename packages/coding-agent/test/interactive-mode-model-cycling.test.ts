import { describe, expect, test, vi } from "vitest";
import { KEYBINDINGS } from "../src/core/keybindings.js";
import type { AgentConnectionState } from "../src/modes/agent-connection/types.js";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.js";

type CycleHarness = {
	agentConnection: {
		cycleModel: ReturnType<typeof vi.fn>;
		getState: ReturnType<typeof vi.fn>;
	};
	connectionState: Partial<AgentConnectionState>;
	uiServices: { settingsManager: { setDefaultModelAndProvider: ReturnType<typeof vi.fn> } };
	footer: { invalidate: ReturnType<typeof vi.fn> };
	subagentSummaryLine: { invalidate: ReturnType<typeof vi.fn> };
	updateEditorBorderColor: ReturnType<typeof vi.fn>;
	setupAutocompleteProvider: ReturnType<typeof vi.fn>;
	updateWorkingPulse: ReturnType<typeof vi.fn>;
	maybeWarnAboutAnthropicSubscriptionAuth: ReturnType<typeof vi.fn>;
	checkDaxnutsEasterEgg: ReturnType<typeof vi.fn>;
	showStatus: ReturnType<typeof vi.fn>;
	showError: ReturnType<typeof vi.fn>;
};

const NEXT_MODEL = {
	id: "claude-haiku",
	name: "Claude Haiku",
	provider: "anthropic",
	reasoning: true,
} as unknown as AgentConnectionState["model"];

function createCycleHarness(overrides: Partial<CycleHarness> = {}): CycleHarness {
	const fakeThis = Object.create(InteractiveMode.prototype) as CycleHarness;
	Object.assign(fakeThis, {
		agentConnection: {
			cycleModel: vi.fn(async () => ({
				model: NEXT_MODEL,
				thinkingLevel: "medium",
				serviceTier: "default",
				isScoped: true,
			})),
			getState: vi.fn(async () => ({
				sessionId: "session-1",
				model: NEXT_MODEL,
				availableThinkingLevels: ["off", "medium"],
			})),
		},
		connectionState: { sessionId: "session-1", scopedModels: [] },
		uiServices: { settingsManager: { setDefaultModelAndProvider: vi.fn() } },
		footer: { invalidate: vi.fn() },
		subagentSummaryLine: { invalidate: vi.fn() },
		updateEditorBorderColor: vi.fn(),
		setupAutocompleteProvider: vi.fn(),
		updateWorkingPulse: vi.fn(),
		maybeWarnAboutAnthropicSubscriptionAuth: vi.fn(async () => {}),
		checkDaxnutsEasterEgg: vi.fn(),
		showStatus: vi.fn(),
		showError: vi.fn(),
	} satisfies CycleHarness);
	Object.assign(fakeThis, overrides);
	return fakeThis;
}

function cycleModel(fakeThis: CycleHarness, direction: "forward" | "backward"): Promise<void> {
	return (
		InteractiveMode.prototype as unknown as {
			cycleModel(this: CycleHarness, direction: "forward" | "backward"): Promise<void>;
		}
	).cycleModel.call(fakeThis, direction);
}

describe("model cycling keybindings", () => {
	test("binds cycling to Ctrl+P and Shift+Ctrl+P by default", () => {
		expect(KEYBINDINGS["app.model.cycleForward"].defaultKeys).toBe("ctrl+p");
		expect(KEYBINDINGS["app.model.cycleBackward"].defaultKeys).toBe("shift+ctrl+p");
	});

	test("registers both cycle actions on the default editor", () => {
		const handlers = new Map<string, () => void>();
		const fakeThis = Object.create(InteractiveMode.prototype) as {
			defaultEditor: { onAction(action: string, handler: () => void): void };
			ui: { requestRender: ReturnType<typeof vi.fn> };
			handleEscape(): void;
			setupKeyHandlers(): void;
			cycleModel(direction: "forward" | "backward"): Promise<void>;
		};
		fakeThis.defaultEditor = {
			onAction: (action, handler) => {
				handlers.set(action, handler);
			},
		};
		fakeThis.ui = { requestRender: vi.fn() };
		fakeThis.handleEscape = vi.fn();
		const cycle = vi.fn(async () => {});
		fakeThis.cycleModel = cycle;

		fakeThis.setupKeyHandlers();
		handlers.get("app.model.cycleForward")?.();
		handlers.get("app.model.cycleBackward")?.();

		expect(cycle).toHaveBeenNthCalledWith(1, "forward");
		expect(cycle).toHaveBeenNthCalledWith(2, "backward");
	});
});

describe("InteractiveMode.cycleModel", () => {
	test("applies the cycled model to the connection state", async () => {
		const fakeThis = createCycleHarness();

		await cycleModel(fakeThis, "backward");

		expect(fakeThis.agentConnection.cycleModel).toHaveBeenCalledWith("backward");
		expect(fakeThis.uiServices.settingsManager.setDefaultModelAndProvider).toHaveBeenCalledWith(
			"anthropic",
			"claude-haiku",
		);
		expect(fakeThis.connectionState.model).toBe(NEXT_MODEL);
		expect(fakeThis.connectionState.thinkingLevel).toBe("medium");
		expect(fakeThis.connectionState.availableThinkingLevels).toEqual(["off", "medium"]);
		expect(fakeThis.setupAutocompleteProvider).toHaveBeenCalledTimes(1);
		expect(fakeThis.showStatus).toHaveBeenCalledWith("Model: Claude Haiku (thinking: medium)");
	});

	test("reports when there is nothing to cycle to", async () => {
		const scopedOnly = createCycleHarness({
			connectionState: {
				sessionId: "session-1",
				scopedModels: [{ model: NEXT_MODEL as never }],
			},
		});
		scopedOnly.agentConnection.cycleModel = vi.fn(async () => undefined);

		await cycleModel(scopedOnly, "forward");

		expect(scopedOnly.showStatus).toHaveBeenCalledWith("Only one model in scope");

		const unscoped = createCycleHarness();
		unscoped.agentConnection.cycleModel = vi.fn(async () => undefined);

		await cycleModel(unscoped, "forward");

		expect(unscoped.showStatus).toHaveBeenCalledWith("Only one model available");
	});

	test("ignores a result that lands after the session changed", async () => {
		const fakeThis = createCycleHarness();
		fakeThis.agentConnection.getState = vi.fn(async () => ({
			sessionId: "session-2",
			model: NEXT_MODEL,
			availableThinkingLevels: ["off"],
		}));

		await cycleModel(fakeThis, "forward");

		expect(fakeThis.connectionState.model).toBeUndefined();
		expect(fakeThis.showStatus).not.toHaveBeenCalled();
	});

	test("surfaces cycle failures as errors", async () => {
		const fakeThis = createCycleHarness();
		fakeThis.agentConnection.cycleModel = vi.fn(async () => {
			throw new Error("no api key");
		});

		await cycleModel(fakeThis, "forward");

		expect(fakeThis.showError).toHaveBeenCalledWith("no api key");
	});
});
