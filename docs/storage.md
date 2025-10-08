# Storage Architecture Proposal

## Current State Analysis

### Fragmented Storage Backends

The current storage implementation is fragmented across multiple backends and APIs:

1. **chrome.storage.local** (via `WebExtensionStorageBackend`)
   - Used for: skills, settings, provider keys
   - Limit: 10MB quota
   - Location: `src/storage/app-storage.ts`
   - Issue: Skills can be large (library code), approaching quota limits

2. **IndexedDB for Sessions** (`SessionIndexedDBBackend`)
   - Database: `pi-extension-sessions`
   - Object stores: `metadata`, `data`
   - Used for: session data and metadata
   - Location: `packages/web-ui/src/storage/backends/session-indexeddb-backend.ts`

3. **Proposed Memories IndexedDB** (from `docs/memories.md`)
   - Database: `sitegeist-memories`
   - Would store: session-scoped key-value pairs for browser_javascript tool
   - Status: Not yet implemented

### Problems with Current Approach

1. **Quota Management Complexity**
   - chrome.storage.local has strict 10MB limit
   - Skills with large library code can hit this limit
   - Multiple databases make quota tracking difficult

2. **Multiple Storage APIs**
   - Different patterns for chrome.storage vs IndexedDB
   - More complex error handling and retry logic
   - Inconsistent performance characteristics

3. **Scalability Issues**
   - Adding new features (memories, user prompts) requires new databases
   - No unified approach to storage architecture
   - Increases complexity over time

## Proposed Unified Architecture

### Single IndexedDB Database

Use a single IndexedDB database: `sitegeist-storage`

**Object Stores:**

```typescript
// Core stores (managed by web-ui)
- sessions-metadata: Session listing and metadata
- sessions-data: Full session content
- settings: Application settings
- provider-keys: API keys for LLM providers

// Domain-specific stores (managed by sitegeist)
- memories: Session-scoped key-value pairs (key: `${sessionId}_${key}`)
- skills: Skill definitions with library code (key: skill name)
- user-prompts: Prebaked user prompts (future feature)
```

### Benefits

1. **Unified Quota Management**
   - Single quota pool with massive capacity (typically 10GB+ on modern systems)
   - Chrome/Edge: Up to 60% of available disk space
   - Firefox: Up to 50% of available disk space
   - Safari: Starts at 1GB, can request more
   - Far superior to chrome.storage.local's hard 10MB limit
   - Easier to track and report total usage

2. **Consistent API**
   - All storage operations use IndexedDB
   - Single transaction model
   - Unified error handling

3. **Performance**
   - IndexedDB is optimized for structured data
   - Efficient querying with indices
   - Better for large objects (skills with library code)

4. **Atomic Operations**
   - Transactions can span multiple object stores
   - Example: Update skill and related settings atomically

5. **Extensibility**
   - Easy to add new object stores for future features
   - No need to create new databases

## Simplified Architecture

### Single Storage Interface

One interface that works everywhere (web, extension, future remote):

```typescript
// packages/web-ui/src/storage/types.ts

export interface StorageBackend {
  // Basic operations
  get<T>(storeName: string, key: string): Promise<T | null>;
  set<T>(storeName: string, key: string, value: T): Promise<void>;
  delete(storeName: string, key: string): Promise<void>;
  keys(storeName: string, prefix?: string): Promise<string[]>;
  clear(storeName: string): Promise<void>;
  has(storeName: string, key: string): Promise<boolean>;

  // Atomic transactions across stores
  transaction<T>(
    storeNames: string[],
    mode: 'readonly' | 'readwrite',
    operation: (tx: StorageTransaction) => Promise<T>
  ): Promise<T>;

  // Quota management
  getQuotaInfo(): Promise<{ usage: number; quota: number; percent: number }>;
  requestPersistence(): Promise<boolean>;
}

export interface StorageTransaction {
  get<T>(storeName: string, key: string): Promise<T | null>;
  set<T>(storeName: string, key: string, value: T): Promise<void>;
  delete(storeName: string, key: string): Promise<void>;
}
```

### IndexedDB Implementation (Web-UI)

```typescript
// packages/web-ui/src/storage/backends/indexeddb-storage-backend.ts

export interface IndexedDBConfig {
  dbName: string;
  version: number;
  stores: StoreConfig[];
}

export interface StoreConfig {
  name: string;
  keyPath?: string;
  indices?: { name: string; keyPath: string }[];
}

export class IndexedDBStorageBackend implements StorageBackend {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private config: IndexedDBConfig) {}

  private async getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.config.dbName, this.config.version);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
          const db = request.result;

          // Create object stores from config
          for (const storeConfig of this.config.stores) {
            if (!db.objectStoreNames.contains(storeConfig.name)) {
              const store = db.createObjectStore(storeConfig.name, {
                keyPath: storeConfig.keyPath
              });

              // Create indices
              if (storeConfig.indices) {
                for (const index of storeConfig.indices) {
                  store.createIndex(index.name, index.keyPath);
                }
              }
            }
          }
        };
      });
    }

    return this.dbPromise;
  }

  async get<T>(storeName: string, key: string): Promise<T | null> {
    const db = await this.getDB();
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const result = await this.promisifyRequest(store.get(key));
    return result ?? null;
  }

  async set<T>(storeName: string, key: string, value: T): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    await this.promisifyRequest(store.put(value, key));
  }

  async transaction<T>(
    storeNames: string[],
    mode: 'readonly' | 'readwrite',
    operation: (tx: StorageTransaction) => Promise<T>
  ): Promise<T> {
    const db = await this.getDB();
    const idbTx = db.transaction(storeNames, mode);

    const storageTx: StorageTransaction = {
      get: async (storeName, key) => {
        const store = idbTx.objectStore(storeName);
        return await this.promisifyRequest(store.get(key)) ?? null;
      },
      set: async (storeName, key, value) => {
        const store = idbTx.objectStore(storeName);
        await this.promisifyRequest(store.put(value, key));
      },
      delete: async (storeName, key) => {
        const store = idbTx.objectStore(storeName);
        await this.promisifyRequest(store.delete(key));
      }
    };

    return operation(storageTx);
  }

  // ... other methods (delete, keys, clear, has, getQuotaInfo, requestPersistence)
}
```

### Repository Pattern

Repositories handle domain logic, backend handles storage:

```typescript
// packages/web-ui/src/storage/sessions-repository.ts

export class SessionsRepository {
  constructor(private backend: StorageBackend) {}

  async saveSession(data: SessionData, metadata: SessionMetadata): Promise<void> {
    await this.backend.transaction(
      ['sessions-metadata', 'sessions-data'],
      'readwrite',
      async (tx) => {
        await tx.set('sessions-metadata', metadata.id, metadata);
        await tx.set('sessions-data', data.id, data);
      }
    );
  }

  async getSession(id: string): Promise<SessionData | null> {
    return this.backend.get('sessions-data', id);
  }

  async getMetadata(id: string): Promise<SessionMetadata | null> {
    return this.backend.get('sessions-metadata', id);
  }

  async getAllMetadata(): Promise<SessionMetadata[]> {
    const keys = await this.backend.keys('sessions-metadata');
    const metadata = await Promise.all(
      keys.map(key => this.backend.get<SessionMetadata>('sessions-metadata', key))
    );
    return metadata.filter((m): m is SessionMetadata => m !== null);
  }

  async deleteSession(id: string): Promise<void> {
    await this.backend.transaction(
      ['sessions-metadata', 'sessions-data'],
      'readwrite',
      async (tx) => {
        await tx.delete('sessions-metadata', id);
        await tx.delete('sessions-data', id);
      }
    );
  }

  async updateTitle(id: string, title: string): Promise<void> {
    const metadata = await this.getMetadata(id);
    if (metadata) {
      metadata.title = title;
      await this.backend.set('sessions-metadata', id, metadata);
    }
  }
}
```

```typescript
// src/storage/skills-repository.ts (sitegeist)

export class SkillsRepository {
  constructor(private backend: StorageBackend) {}

  async getSkill(name: string): Promise<Skill | null> {
    return this.backend.get('skills', name);
  }

  async saveSkill(skill: Skill): Promise<void> {
    await this.backend.set('skills', skill.name, skill);
  }

  async deleteSkill(name: string): Promise<void> {
    await this.backend.delete('skills', name);
  }

  async listSkills(): Promise<Skill[]> {
    const keys = await this.backend.keys('skills');
    const skills = await Promise.all(
      keys.map(key => this.backend.get<Skill>('skills', key))
    );
    return skills.filter((s): s is Skill => s !== null);
  }
}
```

```typescript
// src/storage/memories-repository.ts (sitegeist)

export class MemoriesRepository {
  constructor(private backend: StorageBackend) {}

  private makeKey(sessionId: string, key: string): string {
    return `${sessionId}_${key}`;
  }

  async get(sessionId: string, key: string): Promise<unknown | null> {
    return this.backend.get('memories', this.makeKey(sessionId, key));
  }

  async set(sessionId: string, key: string, value: unknown): Promise<void> {
    await this.backend.set('memories', this.makeKey(sessionId, key), value);
  }

  async delete(sessionId: string, key: string): Promise<void> {
    await this.backend.delete('memories', this.makeKey(sessionId, key));
  }

  async keys(sessionId: string): Promise<string[]> {
    const prefix = `${sessionId}_`;
    const allKeys = await this.backend.keys('memories', prefix);
    return allKeys.map(k => k.substring(prefix.length));
  }

  async clear(sessionId: string): Promise<void> {
    const keys = await this.keys(sessionId);
    await this.backend.transaction(['memories'], 'readwrite', async (tx) => {
      for (const key of keys) {
        await tx.delete('memories', this.makeKey(sessionId, key));
      }
    });
  }
}
```

### AppStorage Wiring

```typescript
// packages/web-ui/src/storage/app-storage.ts

export class BaseAppStorage {
  readonly backend: StorageBackend;
  readonly sessions: SessionsRepository;

  constructor(backend: StorageBackend) {
    this.backend = backend;
    this.sessions = new SessionsRepository(backend);
  }

  // Settings/keys access backend directly
  async getSetting<T>(key: string): Promise<T | null> {
    return this.backend.get('settings', key);
  }

  async setSetting<T>(key: string, value: T): Promise<void> {
    await this.backend.set('settings', key, value);
  }

  async getProviderKey(provider: string): Promise<string | null> {
    return this.backend.get('provider-keys', provider);
  }

  async setProviderKey(provider: string, key: string): Promise<void> {
    await this.backend.set('provider-keys', provider, key);
  }

  async getQuotaInfo() {
    return this.backend.getQuotaInfo();
  }
}
```

```typescript
// src/storage/app-storage.ts (sitegeist)

export class SitegeistAppStorage extends BaseAppStorage {
  readonly skills: SkillsRepository;
  readonly memories: MemoriesRepository;

  constructor() {
    const backend = new IndexedDBStorageBackend({
      dbName: 'sitegeist-storage',
      version: 1,
      stores: [
        // Core stores (web-ui)
        { name: 'sessions-metadata', keyPath: 'id', indices: [
          { name: 'lastModified', keyPath: 'lastModified' }
        ]},
        { name: 'sessions-data', keyPath: 'id' },
        { name: 'settings' },
        { name: 'provider-keys' },

        // Sitegeist stores
        { name: 'memories' },
        { name: 'skills' },
        { name: 'user-prompts' }
      ]
    });

    super(backend);

    this.skills = new SkillsRepository(backend);
    this.memories = new MemoriesRepository(backend);
  }
}
```

### Future: Remote Backend

Easy to add remote storage by implementing `StorageBackend`:

```typescript
export class RemoteStorageBackend implements StorageBackend {
  constructor(private apiUrl: string) {}

  async get<T>(storeName: string, key: string): Promise<T | null> {
    const response = await fetch(`${this.apiUrl}/${storeName}/${key}`);
    return response.ok ? response.json() : null;
  }

  async set<T>(storeName: string, key: string, value: T): Promise<void> {
    await fetch(`${this.apiUrl}/${storeName}/${key}`, {
      method: 'PUT',
      body: JSON.stringify(value)
    });
  }

  // ... other methods
}
```

## Migration Strategy

### Phase 1: Implement Unified Backend in Web-UI

1. Create `UnifiedIndexedDBBackend` base class
2. Create `SessionUnifiedBackend` implementing `SessionStorageBackend`
3. Add configuration-based object store creation
4. Maintain backward compatibility with existing `SessionIndexedDBBackend`

### Phase 2: Extend in Sitegeist

1. Create `SitegeistUnifiedBackend` extending `SessionUnifiedBackend`
2. Add object stores: `memories`, `skills`, `user-prompts`
3. Implement domain-specific operations

### Phase 3: Migrate Data

1. Create migration utility that:
   - Reads all data from chrome.storage.local (skills, settings, keys)
   - Reads session data from `pi-extension-sessions` IndexedDB
   - Writes everything to new `sitegeist-storage` IndexedDB
   - Verifies data integrity
2. Run migration on extension update
3. Keep old storage for one version as backup

### Phase 4: Clean Up

1. Remove `WebExtensionStorageBackend` usage
2. Remove old `SessionIndexedDBBackend` in favor of unified backend
3. Delete old `pi-extension-sessions` database
4. Clear chrome.storage.local

## Implementation Details

### Object Store Keys

```typescript
// sessions-metadata
key: sessionId
value: { id, title, createdAt, lastModified, model }

// sessions-data
key: sessionId
value: { id, messages, artifacts }

// memories
key: `${sessionId}_${memoryKey}`
value: any JSON-serializable value

// skills
key: skillName
value: { name, domainPatterns, description, library, ... }

// settings
key: settingKey (e.g., "theme", "defaultModel")
value: setting value

// provider-keys
key: providerName (e.g., "anthropic", "openai")
value: API key string

// user-prompts (future)
key: promptId
value: { id, name, prompt, tags, ... }
```

### Efficient Prefix Queries

For memories, use `IDBKeyRange` for efficient session-scoped queries:

```typescript
async listMemoryKeys(sessionId: string): Promise<string[]> {
  const prefix = `${sessionId}_`;
  const range = IDBKeyRange.bound(
    prefix,
    prefix + '\uffff', // High unicode character
    false,
    false
  );

  const db = await this.getDB();
  const tx = db.transaction("memories", "readonly");
  const store = tx.objectStore("memories");
  const keys = await store.getAllKeys(range);

  return keys.map(k => (k as string).substring(prefix.length));
}
```

### Quota Management

```typescript
async getQuotaInfo(): Promise<{ usage: number; quota: number; percent: number }> {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
      percent: estimate.quota ? (estimate.usage! / estimate.quota) * 100 : 0
    };
  }
  return { usage: 0, quota: 0, percent: 0 };
}

async requestPersistence(): Promise<boolean> {
  if (navigator.storage && navigator.storage.persist) {
    return await navigator.storage.persist();
  }
  return false;
}
```

## Future Extensions

The unified architecture makes it easy to add new features:

### User Prompts Store

```typescript
export interface UserPrompt {
  id: string;
  name: string;
  prompt: string;
  tags: string[];
  createdAt: string;
  lastUsed?: string;
}

// Just add to object stores config:
{
  name: "user-prompts",
  keyPath: "id",
  indices: [
    { name: "lastUsed", keyPath: "lastUsed" }
  ]
}
```

### Workspace Store (Multi-Project Support)

```typescript
{
  name: "workspaces",
  keyPath: "id"
}

// Each workspace has its own set of sessions, skills, memories
```

### Export/Import

With unified backend, export/import becomes trivial:

```typescript
async exportAll(): Promise<ExportData> {
  const db = await this.getDB();
  const data: ExportData = {};

  for (const storeName of this.config.objectStores.map(s => s.name)) {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    data[storeName] = await store.getAll();
  }

  return data;
}
```

## Summary

The unified IndexedDB architecture provides:

1. **Simplicity**: Single database, consistent API
2. **Scalability**: Easy to add new features as object stores
3. **Performance**: Better quota limits, efficient queries
4. **Maintainability**: Less code, fewer edge cases
5. **Extensibility**: Clean separation between web-ui core and sitegeist extensions

The migration path is straightforward and can be done incrementally without breaking existing functionality.
