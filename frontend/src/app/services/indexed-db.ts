import { Injectable } from '@angular/core';

export interface PendingTransaction {
  id?: number;
  transactionId: string;
  senderUpiId: string;
  receiverUpiId: string;
  amount: number;
  description?: string;
  encryptedData: string;
  status: 'PENDING' | 'SYNCING' | 'FAILED' | 'SYNCED' | 'RECEIVED';
  createdAt: string;
  retryCount: number;
  type?:'WIFI';

  // --- WIFI specific fields ---
  nonce?: string;
  signature?: string;
  payloadVersion?: number;
  receivedAt?: string;
  syncedAt?: number;
  source?: 'SENT' | 'RECEIVED';
  isOffline?: boolean;
  deviceInfo?: string;
  lastSyncError?: string;
  backendTransactionId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class IndexedDbService {

  private dbName = 'Offline-upi-db';   // Database name
  private dbVersion = 1;
  private storeName = 'pending_transactions';  // TaWIFI
 
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

// ------ Method 6: Save WIFI Received Payment ------
  async saveWIFIReceivedPayment(transaction: PendingTransaction): Promise<number> {
    console.log('Saving WIFI received payment: ', transaction.transactionId);

    // check if already exists
    const existingTxn = await this.getWIFITransactionById(transaction.transactionId);

    if (existingTxn && existingTxn.id) {
      console.warn('Transaction already exists in IndexedDB, skipping duplicate.');
      return existingTxn.id;
    }
    
    transaction.type = "WIFI";
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
        console.log('WIFI received payment saved with ID: ', request.result);
        resolve(request.result as number);
      };

      request.onerror = () => {
        console.error('Error saving WIFI received payment: ', request.error);
        reject(request.error);
      };
    });
  }  

// ------ Method 7: Save WIFI sent payment ------  
  async saveWIFISentPayment(transaction: PendingTransaction): Promise<number>{
    console.log('Saving WIFI sent payment: ', transaction.transactionId);

    // check if already exists
    const existingTxn = await this.getWIFITransactionById(transaction.transactionId);

    if (existingTxn && existingTxn.id) {
      console.warn('Transaction already exists in IndexedDB, skipping duplicate.');
      return existingTxn.id;
    }

    transaction.type = 'WIFI';
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
        console.log('WIFI sent payment saved with ID: ', request.result);
        resolve(request.result as number);
      };

      request.onerror = () => {
        console.error('Error saving WIFI sent payment: ', request.error);
        reject(request.error);
      };
    });
  }

// ------ Method 8: Get ALL WIFI received payments ------
  async getAllWIFIReceivedPayments(): Promise<PendingTransaction[]> {
    console.log('Fetching all WIFI received payments');

    const db = await this.openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        // Filter for WIFI and RECEIVED
        const WIFIReceivedPayments = (request.result as PendingTransaction[]).filter( txn => txn.type === 'WIFI' && txn.source === 'RECEIVED' );

        console.log('WIFI received payments fetched: ', WIFIReceivedPayments.length);
        resolve(WIFIReceivedPayments);
      };

      request.onerror = () => {
        console.error('Error fetching WIFI received payments: ', request.error);
        reject(request.error);
      };
    });
  }

// ------ Method 9: Get All WIFI Sent payments ------  
  async getAllWIFISentPayments(): Promise<PendingTransaction[]> {
    console.log('Fetching all WIFI sent payments');

    const db = await this.openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        // Filter for WIFI and SENT
        const WIFISentPayments = (request.result as PendingTransaction[]).filter( txn => txn.type === 'WIFI' && txn.source === 'SENT' );

        console.log('WIFI sent payments fetched: ', WIFISentPayments.length);
        resolve(WIFISentPayments);
      };

      request.onerror = () => {
        console.error('Error fetching WIFI sent payments: ', request.error);
        reject(request.error);
      };
    });
  }

// ------ Method 10: Get All WIFI Payments Pending Sync ------  
  async getAllWIFIPendingSync(): Promise<PendingTransaction[]> {
    console.log('Fetching WIFI payments pending sync to backend');

    const db = await this.openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        // Filter for WIFI with status PENDING or SYNCING
        const pendingSync = (request.result as PendingTransaction[]).filter( txn => txn.type === 'WIFI' && txn.status === 'PENDING' || txn.status === 'SYNCING');

        console.log('WIFI payments pending sync: ', pendingSync.length);
        resolve(pendingSync);
      };

      request.onerror = () => {
        console.error('Error fetching pending sync: ', request.error);
        reject(request.error);
      };
    });
  }

// ------ Method 11: Mark WIFI payment as Syncing ------
  async markWIFIAsSyncing(transactionId: string): Promise<void> {
    console.log('Marking WIFI payment as SYNCING : ', transactionId);

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

// ------ Method 12: Mark WIFI Payment as Synced ------ 
  async markWIFIAsSynced(transactionId: string, backendTransactionId?: string): Promise<void> {
    console.log('Mark WIFI payment as SYNCED: ', transactionId);

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

// ------ Method 13: Mark WIFI payment as Failed ------  
  async MarkWIFIAsFailed(transactionId: string, errorMessage: string): Promise<void> {
    console.log('Mark WIFI payment as FAILED: ', transactionId);

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

// ------ Method 14: Get WIFI Transaction by ID ------
  async getWIFITransactionById(transactionId: string): Promise<PendingTransaction | null> {
    console.log('Fetching WIFI transaction by ID: ', transactionId);

    const allTransactions = await this.getAllPendingTransactions();
    const transaction = allTransactions.find(t => t.transactionId === transactionId && t.type === 'WIFI');

    if (!transaction) {
      console.warn('WIFI transaction not found: ', transactionId);
      return null;
    }

    return transaction;
  }

// ------ Method 15: Clear All WIFI Synced payments ------
  async clearWIFISyncedPayments(): Promise<void> {
    console.log('Clearing all synced WIFI payments');

    const db = await this.openDb();
    const allTransactions = await this.getAllPendingTransactions();

    // Filter for WIFI payments that are synced
    const syncedWIFI = allTransactions.filter(t => t.type === 'WIFI' && t.status === 'SYNCED');

    for (const transaction of syncedWIFI) {
      if(transaction.id) {
        await this.deletePendingTransaction(transaction.id);
      }
    }

    console.log('Cleared ', syncedWIFI.length, ' synced WIFI payments');
  }  

// ------ Method 16: Get WIFI Statistics ------
  async getWIFIStatistics(): Promise<{
    totalWIFI: number;
    received: number;
    sent: number;
    pendingSync: number;
    synced: number;
    failed: number;
  }> {

    const allTransactions = await this.getAllPendingTransactions();
    const WIFITransaction = allTransactions.filter(t => t.type === 'WIFI');

    return {
      totalWIFI: WIFITransaction.length,
      received: WIFITransaction.filter(t => t.source === 'RECEIVED').length,
      sent: WIFITransaction.filter(t => t.source === 'SENT').length,
      pendingSync: WIFITransaction.filter(t => t.status === 'PENDING' || t.status === 'SYNCING').length,
      synced: WIFITransaction.filter(t => t.status === 'SYNCED').length,
      failed: WIFITransaction.filter(t => t.status === 'FAILED').length
    };
  }  
}


