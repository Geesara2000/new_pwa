import { openDB, IDBPDatabase } from 'idb';

export interface QueuedOrder {
  id?: number;
  orders: { product_id: number; quantity: number }[];
  customer_name: string;
  customer_email: string;
  timestamp: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB('offline-orders-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('queued_orders')) {
          db.createObjectStore('queued_orders', { keyPath: 'id', autoIncrement: true });
        }
      },
    });
  }
  return dbPromise;
}

export async function queueOfflineOrder(order: Omit<QueuedOrder, 'timestamp'>) {
  const db = await getDB();
  const queuedItem = { ...order, timestamp: Date.now() };
  await db.add('queued_orders', queuedItem);
  console.log('[Offline Queue] Order stored in IndexedDB:', queuedItem);
  window.dispatchEvent(new CustomEvent('offline-queue-changed'));
}

export async function getQueuedOrders(): Promise<QueuedOrder[]> {
  const db = await getDB();
  return db.getAll('queued_orders');
}

export async function removeQueuedOrder(id: number) {
  const db = await getDB();
  await db.delete('queued_orders', id);
  console.log('[Offline Queue] Order removed from IndexedDB, ID:', id);
  window.dispatchEvent(new CustomEvent('offline-queue-changed'));
}

export async function clearQueuedOrders() {
  const db = await getDB();
  const tx = db.transaction('queued_orders', 'readwrite');
  await tx.objectStore('queued_orders').clear();
  await tx.done;
  window.dispatchEvent(new CustomEvent('offline-queue-changed'));
}
