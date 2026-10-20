/**
 * Promise-based IndexedDB repository for MotionLab projects (T12).
 *
 * - One object store `projects` keyed by `Project.id` (ARCHITECTURE.md,
 *   "Storage"). Records read via `get`/`list` are validated at runtime
 *   (T13) before being returned; invalid records reject with a descriptive
 *   error and are never skipped, repaired, or defaulted.
 * - Every operation opens its own connection, runs one transaction, and
 *   closes the connection in `finally`. Database and transaction failures
 *   reject — errors are never swallowed.
 * - Contract decisions (documented, kept minimal):
 *   - `get` resolves `null` when the id does not exist.
 *   - `delete` is idempotent: deleting an unknown id resolves.
 *   - `list` returns all stored projects; order is unspecified.
 * - Independent of React, Next.js, Zustand, and editor UI. `indexedDB` is
 *   the browser-provided global (tests substitute fake-indexeddb).
 */

import type { Project } from "@/project/model";
import { validateProject } from "@/project/validate";

export const PROJECT_DB_VERSION = 1;
export const PROJECT_STORE_NAME = "projects";
export const DEFAULT_PROJECT_DB_NAME = "motionlab-projects";

export interface ProjectRepository {
  /** Persists (inserts or overwrites) a project. */
  put(project: Project): Promise<void>;
  /** Resolves the stored project, or `null` when the id is unknown. */
  get(id: string): Promise<Project | null>;
  /** Resolves all stored projects; order is unspecified. */
  list(): Promise<Project[]>;
  /** Deletes a project; resolves even when the id does not exist. */
  delete(id: string): Promise<void>;
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, PROJECT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE_NAME)) {
        db.createObjectStore(PROJECT_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(
        new Error(`Failed to open project database "${name}"`, {
          cause: request.error,
        }),
      );
    };
    request.onblocked = () => {
      reject(new Error(`Opening project database "${name}" is blocked`));
    };
  });
}

function runTransaction<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  execute: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let result: T | undefined;
    let failed = false;
    const tx = db.transaction(PROJECT_STORE_NAME, mode);
    const request = execute(tx.objectStore(PROJECT_STORE_NAME));
    request.onsuccess = () => {
      result = request.result as T;
    };
    tx.oncomplete = () => {
      if (!failed) {
        resolve(result as T);
      }
    };
    tx.onerror = () => {
      failed = true;
      reject(
        new Error("Project database transaction failed", { cause: tx.error }),
      );
    };
    tx.onabort = () => {
      failed = true;
      reject(
        new Error("Project database transaction aborted", { cause: tx.error }),
      );
    };
  });
}

export function createProjectRepository(
  dbName: string = DEFAULT_PROJECT_DB_NAME,
): ProjectRepository {
  async function withStore<T>(
    mode: IDBTransactionMode,
    execute: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T> {
    const db = await openDatabase(dbName);
    try {
      return await runTransaction<T>(db, mode, execute);
    } finally {
      db.close();
    }
  }

  /**
   * Validates a record read from storage before it reaches callers (T13).
   * Invalid records reject with the record's label and the full validation
   * error as `cause` — they are never skipped, repaired, or defaulted.
   */
  function parseStoredProject(record: unknown, label: string): Project {
    try {
      return validateProject(record);
    } catch (cause) {
      throw new Error(`Invalid stored project record (${label})`, {
        cause,
      });
    }
  }

  return {
    put: (project) =>
      withStore<void>("readwrite", (store) => store.put(project)),
    get: async (id) => {
      const record = await withStore<unknown>("readonly", (store) =>
        store.get(id),
      );
      if (record === undefined) {
        return null;
      }
      return parseStoredProject(record, `id "${id}"`);
    },
    list: async () => {
      const records = await withStore<unknown[]>("readonly", (store) =>
        store.getAll(),
      );
      return records.map((record, index) =>
        parseStoredProject(record, `index ${index}`),
      );
    },
    delete: (id) =>
      withStore<void>("readwrite", (store) => store.delete(id)),
  };
}
