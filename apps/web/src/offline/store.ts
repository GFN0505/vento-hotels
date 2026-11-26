// A small key-value store in IndexedDB, for what the app keeps on the device between visits (the
// data people last saw). IndexedDB, not localStorage: it holds more and doesn't block the page.
// Every call settles even when storage is blocked (private mode), so the app still works online.
const DB = 'vento'
const STORE = 'kv'

// Opens the database, creating the store if it's missing (for instance if something opened the
// database before the app did), by moving to the next version.
function open(version?: number): Promise<IDBDatabase | undefined> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB, version)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE)
        }
      }
      request.onsuccess = () => {
        const db = request.result
        if (db.objectStoreNames.contains(STORE)) return resolve(db)
        db.close()
        resolve(open(db.version + 1))
      }
      request.onerror = () => resolve(undefined)
      request.onblocked = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<T | undefined> {
  const db = await open()
  if (!db) return undefined
  return new Promise((resolve) => {
    try {
      const request = action(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result as T)
      request.onerror = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  }).finally(() => db.close()) as Promise<T | undefined>
}

export const getItem = <T>(key: string) => run<T>('readonly', (store) => store.get(key))
export const setItem = (key: string, value: unknown) =>
  run('readwrite', (store) => store.put(value, key))
export const clearAll = () => run('readwrite', (store) => store.clear())
