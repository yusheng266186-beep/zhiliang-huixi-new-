import type { GradeDataset } from "./types";

const DB_NAME = "grade-quality-analysis";
const STORE = "datasets";
const HISTORY_PREFIX = "history::";
const MAX_HISTORY = 5;

export type StoredDatasetSummary = {
  key: string;
  id: string;
  school: string;
  sourceName: string;
  importedAt: string;
  storedAt: string;
  scoreCount: number;
  examCount: number;
};

const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function saveLatestDataset(dataset: GradeDataset) {
  const db = await openDb();
  const storedAt = new Date().toISOString();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    store.put(dataset, "latest");
    const snapshotId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    store.put(dataset, `${HISTORY_PREFIX}${storedAt}::${dataset.id}::${snapshotId}`);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
  const history = await listStoredDatasets();
  await Promise.all(history.slice(MAX_HISTORY).map((item) => deleteStoredDataset(item.key)));
}

export async function loadLatestDataset(): Promise<GradeDataset | null> {
  const db = await openDb();
  const result = await new Promise<GradeDataset | null>((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get("latest");
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

export async function listStoredDatasets(): Promise<StoredDatasetSummary[]> {
  const db = await openDb();
  const entries = await new Promise<Array<{ key: string; value: GradeDataset }>>((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).openCursor();
    const result: Array<{ key: string; value: GradeDataset }> = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve(result);
      if (String(cursor.key).startsWith(HISTORY_PREFIX)) result.push({ key: String(cursor.key), value: cursor.value as GradeDataset });
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
  db.close();
  return entries.map(({ key, value }) => ({ key, id: value.id, school: value.school, sourceName: value.sourceName, importedAt: value.importedAt, storedAt: key.slice(HISTORY_PREFIX.length).split("::")[0] || value.importedAt, scoreCount: value.scores.length, examCount: value.exams.length })).sort((a, b) => b.storedAt.localeCompare(a.storedAt));
}

export async function loadStoredDataset(key: string): Promise<GradeDataset | null> {
  if (!key.startsWith(HISTORY_PREFIX)) return null;
  const db = await openDb();
  const result = await new Promise<GradeDataset | null>((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

export async function deleteStoredDataset(key: string): Promise<void> {
  if (!key.startsWith(HISTORY_PREFIX)) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export async function clearStoredDatasets(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}
