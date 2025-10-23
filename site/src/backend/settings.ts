import { FileStore } from "./storage.js";

export interface Settings {
	passwordHash?: string;
	ironSecret?: string;
}

export class SettingsManager {
	private store: FileStore<Settings | string>;

	constructor(storePath: string) {
		this.store = new FileStore<Settings | string>(storePath);

		// Initialize settings if not exists
		if (!this.store.getItem("settings")) {
			this.store.setItem("settings", {});
		}
	}

	getSettings(): Settings {
		return (this.store.getItem("settings") as Settings) || {};
	}

	setSettings(settings: Settings): void {
		this.store.setItem("settings", settings);
	}

	isSetupRequired(): boolean {
		const settings = this.getSettings();
		return !settings.passwordHash || !settings.ironSecret;
	}

	getPasswordHash(): string | undefined {
		return this.getSettings().passwordHash;
	}

	getIronSecret(): string | null {
		return this.getSettings().ironSecret || null;
	}

	setAuth(passwordHash: string, ironSecret: string): void {
		this.setSettings({ passwordHash, ironSecret });
	}
}
