import type { SandboxRuntimeProvider } from "@mariozechner/pi-web-ui";

/**
 * Provides native input event functions to browser_javascript using Chrome Debugger API.
 * Dispatches REAL browser events (isTrusted: true) for automation of anti-bot sites.
 */
export class NativeInputEventsRuntimeProvider implements SandboxRuntimeProvider {
	constructor(private tabId: number) {}

	getData(): Record<string, any> {
		return {};
	}

	getRuntime(): (sandboxId: string) => void {
		// This function will be stringified and injected into the user script
		return (_sandboxId: string) => {
			(window as any).nativeClick = async (selector: string): Promise<void> => {
				const response = await (window as any).sendRuntimeMessage({
					type: "native-input",
					action: "click",
					selector,
				});
				// sendRuntimeMessage throws on error, so if we get here, it succeeded
			};

			(window as any).nativeType = async (selector: string, text: string): Promise<void> => {
				const response = await (window as any).sendRuntimeMessage({
					type: "native-input",
					action: "type",
					selector,
					text,
				});
			};

			(window as any).nativePress = async (key: string): Promise<void> => {
				const response = await (window as any).sendRuntimeMessage({
					type: "native-input",
					action: "press",
					key,
				});
			};
		};
	}

	async handleMessage(message: any, respond: (response: any) => void): Promise<void> {
		if (message.type !== "native-input") {
			return;
		}

		const browser = (globalThis as any).chrome;

		try {
			// Attach debugger to tab
			await new Promise<void>((resolve, reject) => {
				browser.debugger.attach({ tabId: this.tabId }, "1.3", () => {
					if (browser.runtime.lastError) {
						// Check if already attached
						if (browser.runtime.lastError.message?.includes("already attached")) {
							resolve(); // Already attached is fine
						} else {
							reject(new Error(browser.runtime.lastError.message));
						}
					} else {
						resolve();
					}
				});
			});

			if (message.action === "click") {
				// Find element and get its center coordinates
				const result = await browser.debugger.sendCommand(
					{ tabId: this.tabId },
					"Runtime.evaluate",
					{
						expression: `
							const el = document.querySelector(${JSON.stringify(message.selector)});
							if (!el) throw new Error('Selector not found: ${message.selector}');
							const rect = el.getBoundingClientRect();
							({x: rect.left + rect.width/2, y: rect.top + rect.height/2});
						`,
						returnByValue: true,
					},
				);

				if (result.exceptionDetails) {
					throw new Error(result.exceptionDetails.exception.description || "Element not found");
				}

				const { x, y } = result.result.value;

				// Dispatch trusted mouse events
				await browser.debugger.sendCommand({ tabId: this.tabId }, "Input.dispatchMouseEvent", {
					type: "mousePressed",
					x,
					y,
					button: "left",
					clickCount: 1,
				});

				await browser.debugger.sendCommand({ tabId: this.tabId }, "Input.dispatchMouseEvent", {
					type: "mouseReleased",
					x,
					y,
					button: "left",
					clickCount: 1,
				});

				respond({ success: true });
			} else if (message.action === "type") {
				// Focus element first
				const focusResult = await browser.debugger.sendCommand(
					{ tabId: this.tabId },
					"Runtime.evaluate",
					{
						expression: `
							const el = document.querySelector(${JSON.stringify(message.selector)});
							if (!el) throw new Error('Selector not found: ${message.selector}');
							el.focus();
							true;
						`,
						returnByValue: true,
					},
				);

				if (focusResult.exceptionDetails) {
					throw new Error(focusResult.exceptionDetails.exception.description || "Element not found");
				}

				// Type each character
				for (const char of message.text) {
					await browser.debugger.sendCommand({ tabId: this.tabId }, "Input.dispatchKeyEvent", {
						type: "keyDown",
						text: char,
					});

					await browser.debugger.sendCommand({ tabId: this.tabId }, "Input.dispatchKeyEvent", {
						type: "keyUp",
						text: char,
					});
				}

				respond({ success: true });
			} else if (message.action === "press") {
				// Press single key
				await browser.debugger.sendCommand({ tabId: this.tabId }, "Input.dispatchKeyEvent", {
					type: "keyDown",
					key: message.key,
				});

				await browser.debugger.sendCommand({ tabId: this.tabId }, "Input.dispatchKeyEvent", {
					type: "keyUp",
					key: message.key,
				});

				respond({ success: true });
			} else {
				respond({ success: false, error: `Unknown action: ${message.action}` });
			}
		} catch (error: any) {
			respond({ success: false, error: error.message || String(error) });
		}
	}

	getDescription(): string {
		return "Native input events provider (for trusted browser events)";
	}
}
