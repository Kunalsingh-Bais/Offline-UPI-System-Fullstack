import { Injectable } from '@angular/core';

export interface PendingTransaction {
  id?: number;
  transactionId: string;
  senderUpiId: string;
  receiverUpiId: string;
  amount: number;
  description?: string;
  encryptedData: string;
  status: 'PENDING' | 'SYNCING' | 'FAILED';
  createdAt: string;
  retryCount: number;
}

@Injectable({
  providedIn: 'root',
})
export class IndexedDbService {

  private dbName = 'Offline-upi-db';   // Database name
  private dbVersion = 1;
  private storeName = 'pending_transactions';  // Table
 
  constructor() {}

// ------ Method 1: Open Database ------
  // Creates database if it does not exist  
  openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {

      // Open database
      const request = indexedDB.open(this.dbName, this.dbVersion);

      // Runs only first time or whenever version changes
      request.onupgradeneeded = () => {
        const db = request.result;

        // Create store
        if(!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, {
            keyPath: 'id',
            autoIncrement: true
          });
        }
      };

      request.onsuccess = () => {
        console.log('IndexedDB opened successfully');
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('IndexedDB error: ', request.error);
        reject(request.error);
      };
    });
  }

// ------ Method 2: Save Transaction ------  
  async savePendingTransaction(transaction: PendingTransaction): Promise<number> {

    // Open IndexedDB database
    const db = await this.openDb();

    return new Promise((resolve, reject) => {

      // Create a write transaction
      const tx = db.transaction(this.storeName, 'readwrite');

      // Select pending_transactions store
      const store = tx.objectStore(this.storeName);

      // Insert transaction
      const request = store.add(transaction);

      request.onsuccess = () => {
        console.log('Transaction saved');
        resolve(request.result as number);
      };

      request.onerror = () => {
        console.error('Save failed');
        reject(request.error);
      };
    });
  }

// ------ Method 3: Get all PENDING transactions ------
  async getAllPendingTransactions(): Promise<PendingTransaction[]> {
    // Open database
    const db = await this.openDb();

    return new Promise((resolve, reject) => {
      // Read-only transaction
      const tx = db.transaction(this.storeName, 'readonly');

      // Select object store
      const store = tx.objectStore(this.storeName);

      // Fetch all records
      const request = store.getAll();

      request.onsuccess = () => {
        console.log('Transaction fetched: ', request.result);
        resolve(request.result as PendingTransaction[]);
      };

      request.onerror = () => {
        console.error('Error fetching transactions');
        reject(request.error);
      };
    });
  }  

// ------ Method 4: Update Transaction ------
  async updatePendingTransaction(transaction: PendingTransaction): Promise<void> {
    const db = await this.openDb();

    return new Promise((resolve, reject) => {
      // Start write transaction
      const tx = db.transaction(this.storeName, 'readwrite');

      // Select pending_transaction store
      const store = tx.objectStore(this.storeName);

      // Update record
      const request = store.put(transaction);

      request.onsuccess = () => {
        console.log('Transaction updated: ', transaction);
        resolve();
      };

      request.onerror = () => {
        console.error('Update failed: ', request.error);
        reject(request.error);
      };
    });
  }  

// ------ Method 5: Delete PENDING Transaction ------
  async deletePendingTransaction(id: number): Promise<void> {
    const db = await this.openDb();

    return new Promise((resolve, reject) => {

      // Start write transaction because we are deleting data
      const tx = db.transaction(this.storeName, 'readwrite');

      // Select pending_transactions store
      const store = tx.objectStore(this.storeName);

      // Delete record by primary key id
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log('Transaction deleted: ', id);
        resolve();
      };

      request.onerror = () => {
        console.error('Delete failed: ', request.error);
        reject(request.error);
      };
    });
  }  
}
