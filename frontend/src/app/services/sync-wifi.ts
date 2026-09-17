import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { IndexedDbService, PendingTransaction } from './indexed-db';
import { catchError, from, Observable, of, switchMap} from 'rxjs';
import { ApiService } from './api';
import { NetworkService } from './network';

export interface WIFISyncRequest {
  transactionId: string;
  encryptedData: string;
}

export interface SyncResult {
  success: boolean;
  transactionId: string;
  message: string;
  synced?: boolean;
}

@Injectable({
  providedIn: 'root',
})

export class SyncWIFIService {

  constructor(private indexedDbService: IndexedDbService, private api: ApiService, private network: NetworkService) {}

// ------ Main Method: Sync All Pendinig WIFI Transactions ------  
  syncAllPendingWIFI(): Observable<SyncResult[]> {
    console.log('Starting WIFI sync...');

    return from(this.indexedDbService.getAllPendingTransactions()).pipe(
      switchMap((transactions: PendingTransaction[] | null) => {
        if (!transactions || transactions.length === 0) {
          console.log('No pending transactions to sync');
          return of([]);
        }

        // Filter only PENDING ones
        const pending = transactions.filter(t => t.status === 'PENDING');

        if (pending.length === 0) {
          console.log('No PENDING transactions to sync');
          return of([])
        }

        console.log(`Found ${pending.length} pending WIFI transactions to sync`);

        // Sync each one
        const syncObservables = pending.map(txn => this.syncSingleWIFI(txn));

        // Use Promise.all to wait for all syncs
        return from(Promise.all(syncObservables));
      }),
      catchError(err => {
        console.error('Error syncing WIFI transactions: ', err);
        return of([] as SyncResult[]);
      }) 
    );
  }

// ------ Method 2: Sync single WIFI transaction ------  
  syncSingleWIFI(transaction: PendingTransaction): Promise<SyncResult> {
    return new Promise((resolve) => {
      // Updated status to SYNCING in IndexedDB
      this.updateTransactionStatus(transaction.id, 'SYNCING');

      const syncRequest: WIFISyncRequest = {
        transactionId: transaction.transactionId,
        encryptedData: transaction.encryptedData
      };

      console.log(`Syncing WIFI transaction: ${transaction.transactionId}`);

      this.network.post<any>(`${this.api.syncWIFI}/sync-WIFI`, syncRequest).subscribe({
        next: (response) => {
          console.log(`WIFI transaction synced successfully: `, response);

          // Update to SYNCED in IndexedDB
          this.updateTransactionStatus(transaction.id, 'SYNCED').then(() => {
            resolve({
              success: true,
              transactionId: transaction.transactionId,
              message: 'Synced successfully',
              synced: true
            });
          });
        },

        error: (error: HttpErrorResponse) => {
          console.error(`Failed to sync WIFI transaction: ${transaction.transactionId}`, error);

          // Increment retry count
          const newRetryCount = (transaction.retryCount || 0) + 1;

          // Update to FAILED in IndexedDB with retry count
          this.updateTransactionStatus(transaction.id, 'FAILED', newRetryCount).then(() => {
            resolve({
              success: false,
              transactionId: transaction.transactionId,
              message: error.error?.message || 'Failed to sync',
              synced: false
            });
          });
        }
      });
    });
  }

// ------ Method 3: Update Transaction status in indexedDb ------  
  private updateTransactionStatus(txnId: number | undefined, newStatus: 'PENDING' | 'SYNCING' | 'FAILED' | 'SYNCED', retryCount?: number): Promise<void> {
    return new Promise((resolve) => {
      if(!txnId) {
        resolve();
        return;
      }

      this.indexedDbService.getAllPendingTransactions().then((transactions) => {
        if(!transactions) {
          resolve();
          return;
        }

        const txn = transactions.find(t => t.id === txnId);
        if(!txn) {
          resolve();
          return;
        }

        // Update status
        txn.status = newStatus;
        if (retryCount !== undefined) {
          txn.retryCount = retryCount;
        }

        // Save updated transaction
        this.indexedDbService.updatePendingTransaction(txn).then(() => {
          console.log(`Updated ${txn.transactionId} to ${newStatus}`);
          resolve();
        })
          .catch(err => {
            console.error('Error updating transaction: ', err);
            resolve();
          });
      });
    });
  }

// ------ Method 4: Sync with retry logic ------
  syncWithRetry(maxRetries = 3): Observable<SyncResult[]> {
    console.log(`Starting WIFI sync with retry (max ${maxRetries} attempts)...`);

    return from(this.indexedDbService.getAllPendingTransactions()).pipe(
      switchMap((transactions: PendingTransaction[] | null) => {
        if(!transactions || transactions.length === 0) {
          return of([]);
        }

        const pending = transactions.filter(t => t.status === 'PENDING' || (t.status === 'FAILED' && (t.retryCount || 0) < maxRetries));

        if(pending.length === 0) {
          return of([]);
        }

        console.log(`Found ${pending.length} transactions to sync (including retries)`);

        const syncObservables = pending.map(txn => this.syncSingleWIFI(txn));
        return from(Promise.all(syncObservables));
      }),
      catchError(err => {
        console.error('Sync with retry failed: ', err);
        return of([] as SyncResult[]);
      })
    );
  }

// ------ Method 5: Get SYNC status ------  
  async getSyncStatus(): Promise<{pending: number; synced: number; failed: number;}> {
    const transactions = await this.indexedDbService.getAllPendingTransactions();

    if (!transactions) {
      return {pending: 0, synced: 0, failed: 0};
    }

    return {
      pending: transactions.filter(t => t.status === 'PENDING').length,
      synced: transactions.filter(t => t.status === 'SYNCED').length,
      failed: transactions.filter(t => t.status === 'FAILED').length
    };
  }

// ------ Method 6: Retry failed transactions ------  
  retryFailedTransactions(): Observable<SyncResult[]> {
    console.log('Retrying failed WIFI transactions...');

    return from(this.indexedDbService.getAllPendingTransactions()).pipe(
      switchMap((transactions: PendingTransaction[] | null) => {
        if (!transactions) {
          return of([]);
        }

        const failed = transactions.filter(t => t.status === 'FAILED');

        if (failed.length === 0) {
          console.log('No failed transactions to retry');
          return of([]);
        }

        console.log(`Retrying ${failed.length} failed transactions`);

        const retryObservables = failed.map(txn => this.syncSingleWIFI(txn));
        return from(Promise.all(retryObservables));
      }),
      catchError(err => {
        console.error('Retry failed: ', err);
        return of([] as SyncResult[]);
      })
    )
  }  
}
