/**
 * Client-side UI extension binding for daemon-backed interactive sessions.
 *
 * Editor components and autocomplete providers are live TUI objects and cannot
 * cross the daemon boundary. Daemon interactive clients therefore load the same
 * extensions in the terminal process, bind a real TUI ExtensionUIContext with
 * mode "tui", and execute UI-owning extension commands locally.
 */

import type { AgentSessionServices } from "../../core/agent-session-services.js";
import { ExtensionRunner } from "../../core/extensions/index.js";
import type { ExtensionUIContext } from "../../core/extensions/types.js";
import type { ModelRegistry } from "../../core/model-registry.js";
import type { SessionManager } from "../../core/session-manager.js";

export interface ClientUiExtensionRunnerOptions {
	services: AgentSessionServices;
	sessionManager: SessionManager;
}

export interface ClientUiExtensionRunner {
	readonly runner: ExtensionRunner;
	readonly modelRegistry: ModelRegistry;
	bind(uiContext: ExtensionUIContext): Promise<void>;
}

/**
 * Build an ExtensionRunner from the client-loaded extension modules so
 * terminal-owned UI APIs can run where the TUI lives.
 *
 * InteractiveMode binds core/command context and the real UI before calling
 * `bind()`, which emits `session_start` with mode "tui".
 */
export function createClientUiExtensionRunner(options: ClientUiExtensionRunnerOptions): ClientUiExtensionRunner {
	const extensionsResult = options.services.resourceLoader.getExtensions();
	const runner = new ExtensionRunner(
		extensionsResult.extensions,
		extensionsResult.runtime,
		options.sessionManager.getCwd(),
		options.sessionManager,
		options.services.modelRegistry,
	);

	return {
		runner,
		modelRegistry: options.services.modelRegistry,
		bind: async (uiContext) => {
			runner.setUIContext(uiContext, "tui");
			await runner.emit({ type: "session_start", reason: "startup" });
		},
	};
}
