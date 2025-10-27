import { Button, DialogBase, DialogContent, DialogHeader } from "@mariozechner/mini-lit";
import { html, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("update-notification-dialog")
export class UpdateNotificationDialog extends DialogBase {
	@property() latestVersion = "";
	private resolvePromise?: (value: boolean) => void;

	protected modalWidth = "min(500px, 90vw)";
	protected modalHeight = "auto";

	/**
	 * Show update notification dialog.
	 * User must update - dialog cannot be dismissed.
	 */
	static async show(latestVersion: string): Promise<void> {
		const dialog = new UpdateNotificationDialog();
		dialog.latestVersion = latestVersion;
		document.body.appendChild(dialog);

		return new Promise((resolve) => {
			dialog.resolvePromise = resolve as any;
		});
	}

	// Override close to prevent dismissal
	override close() {
		// Do nothing - user must click Update button
	}

	private handleUpdate() {
		window.open("https://sitegeist.ai/install#updating", "_blank");
		// Don't close the dialog - keep blocking until extension is actually updated and restarted
	}

	protected renderContent(): TemplateResult {
		return html`
			${DialogContent({
				children: html`
					${DialogHeader({
						title: "Update Required",
						description: `A new version (${this.latestVersion}) is available. Please update to continue.`,
					})}

					<div class="mt-6 flex justify-end">
						${Button({
							children: "Update Now",
							onClick: () => this.handleUpdate(),
							variant: "default",
						})}
					</div>
				`,
			})}
		`;
	}
}
