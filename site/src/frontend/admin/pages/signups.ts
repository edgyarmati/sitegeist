import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import "@mariozechner/mini-lit/dist/ThemeToggle.js";
import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { EmailSignup } from "../../../shared/types.js";
import { createApiClient } from "../../api-client.js";

const api = createApiClient("/api");

@customElement("page-signups")
export class PageSignups extends LitElement {
	@state() signups: EmailSignup[] = [];
	@state() loading = true;

	createRenderRoot() {
		return this; // Render in light DOM to use Tailwind classes
	}

	connectedCallback() {
		super.connectedCallback();
		this.loadSignups();
	}

	async loadSignups() {
		try {
			this.signups = await api.listSignups();
			this.loading = false;
		} catch (error) {
			console.error("Failed to load signups:", error);
			this.loading = false;
		}
	}

	async handleLogout() {
		try {
			await api.logout();
			// Reload page to show login dialog
			window.location.reload();
		} catch (error) {
			console.error("Logout error:", error);
		}
	}

	formatDate(timestamp: string): string {
		return new Date(timestamp).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	}

	render() {
		return html`
			<div class="min-h-screen bg-background text-foreground p-8">
				<theme-toggle class="fixed top-4 right-4"></theme-toggle>

				<div class="max-w-4xl mx-auto space-y-6">
					<div class="flex items-center justify-between">
						<h1 class="text-3xl font-bold">Sitegeist Admin</h1>
						${Button({
							variant: "outline",
							children: "Logout",
							onClick: () => this.handleLogout(),
						})}
					</div>

					<div class="bg-card border border-border rounded-lg overflow-hidden">
						<div class="p-6 border-b border-border">
							<h2 class="text-xl font-semibold">Email Signups (${this.signups.length})</h2>
						</div>

						${
							this.loading
								? html`<div class="p-6 text-center text-muted-foreground">Loading...</div>`
								: this.signups.length === 0
									? html`<div class="p-6 text-center text-muted-foreground">No signups yet.</div>`
									: html`
										<div class="overflow-x-auto">
											<table class="w-full">
												<thead class="bg-muted/50">
													<tr>
														<th class="text-left py-3 px-6 font-medium">Email</th>
														<th class="text-left py-3 px-6 font-medium">Date</th>
														<th class="text-left py-3 px-6 font-medium">Notified</th>
													</tr>
												</thead>
												<tbody>
													${this.signups.map(
														(signup) => html`
															<tr class="border-t border-border hover:bg-muted/30 transition-colors">
																<td class="py-3 px-6">${signup.email}</td>
																<td class="py-3 px-6 text-muted-foreground text-sm">${this.formatDate(signup.timestamp)}</td>
																<td class="py-3 px-6">
																	<span
																		class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
																			signup.notified
																				? "bg-green-500/10 text-green-500"
																				: "bg-muted text-muted-foreground"
																		}"
																	>
																		${signup.notified ? "Yes" : "No"}
																	</span>
																</td>
															</tr>
														`,
													)}
												</tbody>
											</table>
										</div>
									`
						}
					</div>
				</div>
			</div>
		`;
	}
}
