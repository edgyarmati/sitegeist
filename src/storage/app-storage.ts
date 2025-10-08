import { AppStorage as BaseAppStorage, getAppStorage, IndexedDBStorageBackend } from "@mariozechner/pi-web-ui";
import { MemoriesRepository } from "./memories-repository.js";
import { SkillsRepository } from "./skills-repository.js";

/**
 * Extended AppStorage for Sitegeist with skills and memories repositories.
 */
export class SitegeistAppStorage extends BaseAppStorage {
	readonly skills: SkillsRepository;
	readonly memories: MemoriesRepository;

	constructor() {
		// Create unified IndexedDB backend with all stores
		const backend = new IndexedDBStorageBackend({
			dbName: "sitegeist-storage",
			version: 1,
			stores: [
				// Core stores (web-ui)
				{
					name: "sessions-metadata",
					keyPath: "id",
					indices: [{ name: "lastModified", keyPath: "lastModified" }],
				},
				{ name: "sessions-data", keyPath: "id" },
				{ name: "settings" },
				{ name: "provider-keys" },

				// Sitegeist stores
				{ name: "memories" },
				{ name: "skills" },
				{ name: "user-prompts" }, // Future use
			],
		});

		super(backend);

		// Add Sitegeist-specific repositories
		this.skills = new SkillsRepository(backend);
		this.memories = new MemoriesRepository(backend);
	}
}

/**
 * Helper to get typed Sitegeist storage.
 */
export function getSitegeistStorage(): SitegeistAppStorage {
	return getAppStorage() as SitegeistAppStorage;
}
