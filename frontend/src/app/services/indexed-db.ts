import { Injectable } from '@angular/core';

export interface PendingTransaction {
  id?: number;
  transactionId: string;
  senderUpiId: string;
  receiverUpiId: string;
  amount: number;
  description?: string;
  encryptedData: string;
  status: 'PENDING' | 'SYNCING' | 'FAILED' | 'SYNCED';
  createdAt: string;
  retryCount: number;
  type: 'UPI' | 'BLE';

  // --- BLE specific fields ---
  nonce?: string;
  signature?: string;
  payloadVersion?: number;
  receivedAt?: number;
  syncedAt?: number;
  source?: 'SENT' | 'RECEIVED';
  isOffline?: boolean;
  deviceInfo?: string;
  lastSyncError?: string;
  backendTransactionId: string;
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

// ------ Method 6: Save BLE Received Payment ------
  async saveBLEReceivedPayment(transaction: PendingTransaction): Promise<number> {
    console.log('Saving BLE received payment: ', transaction.transactionId);

    // Ensure it's marked as BLE and RECEIVED
    transaction.type = "BLE";
    transaction.source = "RECEIVED";
    transaction.isOffline = true;
    transaction.status = 'PENDING';
    transaction.createdAt = new Date().toISOString();
    transaction.retryCount = 0;

    const db = await this.openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.add(transaction);

      request.onsuccess = () => {
        console.log('BLE received payment saved with ID: ', request.result);
        resolve(request.result as number);
      };

      request.onerror = () => {
        console.error('Error saving BLE received payment: ', request.error);
        reject(request.error);
      };
    });
  }  

// ------ Method 7: Save BLE sent payment ------  
  async saveBLESentPayment(transaction: PendingTransaction): Promise<number>{
    console.log('Saving BLE sent payment: ', transaction.transactionId);

    // Ensure it's marked as BLE and SENT
    transaction.type = 'BLE';
    transaction.source = 'SENT';
    transaction.isOffline = true;
    transaction.status = 'PENDING';
    transaction.createdAt = new Date().toISOString();
    transaction.retryCount = 0;

    const db = await this.openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.add(transaction);

      request.onsuccess = () => {
        console.log('BLE sent payment saved with ID: ', request.result);
        resolve(request.result as number);
      };

      request.onerror = () => {
        console.error('Error saving BLE sent payment: ', request.error);
        reject(request.error);
      };
    });
  }

// ------ Method 8: Get ALL BLE received payments ------
  async getAllBLEReceivedPayments(): Promise<PendingTransaction[]> {
    console.log('Fetching all BLE received payments');

    const db = await this.openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        // Filter for BLE and RECEIVED
        const bleReceivedPayments = (request.result as PendingTransaction[]).filter( txn => txn.type === 'BLE' && txn.source === 'RECEIVED' );

        console.log('BLE received payments fetched: ', bleReceivedPayments.length);
        resolve(bleReceivedPayments);
      };

      request.onerror = () => {
        console.error('Error fetching BLE received payments: ', request.error);
        reject(request.error);
      };
    });
  }

// ------ Method 9: Get All BLE Sent payments ------  
  async getAllBLESentPayments(): Promise<PendingTransaction[]> {
    console.log('Fetching all BLE sent payments');

    const db = await this.openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        // Filter for BLE and SENT
        const bleSentPayments = (request.result as PendingTransaction[]).filter( txn => txn.type === 'BLE' && txn.source === 'SENT' );

        console.log('BLE sent payments fetched: ', bleSentPayments.length);
        resolve(bleSentPayments);
      };

      request.onerror = () => {
        console.error('Error fetching BLE sent payments: ', request.error);
        reject(request.error);
      };
    });
  }

// ------ Method 10: Get All BLE Payments Pending Sync ------  
  async getAllBLEPendingSync(): Promise<PendingTransaction[]> {
    console.log('Fetching BLE payments pending sync to backend');

    const db = await this.openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        // Filter for BLE with status PENDING or SYNCING
        const pendingSync = (request.result as PendingTransaction[]).filter( txn => txn.type === 'BLE' && txn.status === 'PENDING' || txn.status === 'SYNCING');

        console.log('BLE payments pending sync: ', pendingSync.length);
        resolve(pendingSync);
      };

      request.onerror = () => {
        console.error('Error fetching pending sync: ', request.error);
        reject(request.error);
      };
    });
  }

// ------ Method 11: Mark BLE payment as Syncing ------
  async markBLEAsSyncing(transactionId: string): Promise<void> {
    console.log('Marking BLE payment as SYNCING : ', transactionId);

    const allTransactions = await this.getAllPendingTransactions();
    const transaction = allTransactions.find(t => t.transactionId === transactionId);

    if (!transaction) {
      console.warn('Transaction not found: ', transactionId);
      return;
    }

    transaction.status = 'SYNCING';
    transaction.retryCount = (transaction.retryCount || 0) + 1;

    await this.updatePendingTransaction(transaction);
  }  

// ------ Method 12: Mark BLE Payment as Synced ------ 
  async markBLEAsSynced(transactionId: string, backendTransactionId?: string): Promise<void> {
    console.log('Mark BLE payment as SYNCED: ', transactionId);

    const allTransactions = await this.getAllPendingTransactions();
    const transaction = allTransactions.find(t => t.transactionId === transactionId);

    if (!transaction) {
      console.warn('Transaction not found: ', transactionId);
      return;
    }

    transaction.status = 'SYNCED';
    transaction.syncedAt = Date.now();

    if (backendTransactionId) {
      transaction.backendTransactionId = backendTransactionId;
    } 

    await this.updatePendingTransaction(transaction);
  }  

// ------ Method 13: Mark BLE payment as Failed ------  
  async MarkBLEAsFailed(transactionId: string, errorMessage: string): Promise<void> {
    console.log('Mark BLE payment as FAILED: ', transactionId);

    const allTransactions = await this.getAllPendingTransactions();
    const transaction = allTransactions.find(t => t.transactionId === transactionId);

    if (!transaction) {
      console.warn('Transaction not found: ', transactionId);
      return;
    }

    transaction.status = 'FAILED';
    transaction.lastSyncError = errorMessage;
    transaction.retryCount = (transaction.retryCount || 0) + 1;

    await this.updatePendingTransaction(transaction);
  }

// ------ Method 14: Get BLE Transaction by ID ------
  async getBLETransactionById(transactionId: string): Promise<PendingTransaction | null> {
    console.log('Fetching BLE transaction by ID: ', transactionId);

    const allTransactions = await this.getAllPendingTransactions();
    const transaction = allTransactions.find(t => t.transactionId === transactionId && t.type === 'BLE');

    if (!transaction) {
      console.warn('BLE transaction not found: ', transactionId);
      return null;
    }

    return transaction;
  }

// ------ Method 15: Clear All BLE Synced payments ------
  async clearBLESyncedPayments(): Promise<void> {
    console.log('Clearing all synced BLE payments');

    const db = await this.openDb();
    const allTransactions = await this.getAllPendingTransactions();

    // Filter for BLE payments that are synced
    const syncedBLE = allTransactions.filter(t => t.type === 'BLE' && t.status === 'SYNCED');

    for (const transaction of syncedBLE) {
      if(transaction.id) {
        await this.deletePendingTransaction(transaction.id);
      }
    }

    console.log('Cleared ', syncedBLE.length, ' synced BLE payments');
  }  

// ------ Method 16: Get BLE Statistics ------
  async getBLEStatistics(): Promise<{
    totalBLE: number;
    received: number;
    sent: number;
    pendingSync: number;
    synced: number;
    failed: number;
  }> {

    const allTransactions = await this.getAllPendingTransactions();
    const bleTransaction = allTransactions.filter(t => t.type === 'BLE');

    return {
      totalBLE: bleTransaction.length,
      received: bleTransaction.filter(t => t.source === 'RECEIVED').length,
      sent: bleTransaction.filter(t => t.source === 'SENT').length,
      pendingSync: bleTransaction.filter(t => t.status === 'PENDING' || t.status === 'SYNCING').length,
      synced: bleTransaction.filter(t => t.status === 'SYNCED').length,
      failed: bleTransaction.filter(t => t.status === 'FAILED').length
    };
  }  
}


