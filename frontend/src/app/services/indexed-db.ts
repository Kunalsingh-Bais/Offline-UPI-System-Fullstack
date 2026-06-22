import { Injectable } from '@angular/core';

export interface PendingTransaction {
  id?: number;
  transactionId: string;
  senderUpiId: string;
  receiverUpiId: string;
  amount: number;
  description?: string;
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


}
