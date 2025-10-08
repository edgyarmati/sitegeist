import type { StorageBackend } from "@mariozechner/pi-web-ui";

/**
 * Repository for managing session-scoped persistent memory.
 * Used by browser_javascript tool to store/retrieve data across tool calls.
 *
 * Keys are scoped to sessions using the format: ${sessionId}_${key}
 */
export class MemoriesRepository {
	constructor(private backend: StorageBackend) {}

	private makeKey(sessionId: string, key: string): string {
		return `${sessionId}_${key}`;
	}

	/**
	 * Get a memory value for the current session.
	 */
	async get(sessionId: string, key: string): Promise<unknown | null> {
		return this.backend.get("memories", this.makeKey(sessionId, key));
	}

	/**
	 * Set a memory value for the current session.
	 */
	async set(sessionId: string, key: string, value: unknown): Promise<void> {
		await this.backend.set("memories", this.makeKey(sessionId, key), value);
	}

	/**
	 * Delete a memory value for the current session.
	 */
	async delete(sessionId: string, key: string): Promise<void> {
		await this.backend.delete("memories", this.makeKey(sessionId, key));
	}

	/**
	 * List all memory keys for the current session.
	 */
	async keys(sessionId: string): Promise<string[]> {
		const prefix = `${sessionId}_`;
		const allKeys = await this.backend.keys("memories", prefix);
		// Strip prefix to return just the key part
		return allKeys.map((k) => k.substring(prefix.length));
	}

	/**
	 * Clear all memories for the current session.
	 */
	async clear(sessionId: string): Promise<void> {
		const keys = await this.keys(sessionId);
		await this.backend.transaction(["memories"], "readwrite", async (tx) => {
			for (const key of keys) {
				await tx.delete("memories", this.makeKey(sessionId, key));
			}
		});
	}

	/**
	 * Check if a memory key exists for the current session.
	 */
	async has(sessionId: string, key: string): Promise<boolean> {
		return this.backend.has("memories", this.makeKey(sessionId, key));
	}
}
