import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { IndexedDbService, PendingTransaction } from '../../services/indexed-db';
import { TransactionService } from '../../services/transaction';

@Component({
  selector: 'app-pending-transactions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pending-transactions.html',
  styleUrl: './pending-transactions.css',
})
export class PendingTransactionsComponent implements OnInit{

  // Properties :
  // This array will store transactions
  pendingTransactions: PendingTransaction[] =[];
  loading = false;

  constructor(private indexedDbService: IndexedDbService, private cdr: ChangeDetectorRef, private transactionService: TransactionService) {}

  ngOnInit(): void {
    this.loadPendingTransactions();
  }

// ------ Method 1: Load all Pending Transactions from IndexedDB ------  
  async loadPendingTransactions(): Promise<void> {
    // Start loading
    this.loading = true;

    try {
      // Read all transactions from IndexedDB service
      this.pendingTransactions = await this.indexedDbService.getAllPendingTransactions();

      this.cdr.detectChanges();

      console.log('Pending transactions loaded: ', this.pendingTransactions);
    }
    catch (error) {
      console.error('Failed to load pending transactions: ', error);
    }
    finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

// ------ Method 2: Delete transaction ------
  async deleteTransaction(id?: number): Promise<void> {

    // If id is missing, do nothing
    if (!id) {
      return;
    }

    // Delete transaction from IndexedDB
    await this.indexedDbService.deletePendingTransaction(id);

    // Reload list after deleting
    await this.loadPendingTransactions();
  }  

// ------ Method 3: Retry Pending transaction ------
  async retryTransaction(txn: PendingTransaction): Promise<void> {
    if(!txn.id) {
      return;
    }

    // Step 1: Mark transaction as SYNCING    
    txn.status = 'SYNCING';
    txn.retryCount = txn.retryCount + 1;

    await this.indexedDbService.updatePendingTransaction(txn);

    // Step 2: Send transaction to backend again
    try {
      const request = {
        encryptedData: txn.encryptedData,
        transactionId: txn.transactionId
      };

      this.transactionService.completeTransaction(request).subscribe({
        next: async (response: any) => {
          if (response.success) {

            // Step 3: If backend success, delete from IndexedDB
            await this.indexedDbService.deletePendingTransaction(txn.id!);
          }
          else {

            // Step 4: If backend says failed, mark as FAILED
            txn.status = 'FAILED';
            await this.indexedDbService.updatePendingTransaction(txn);
          }

          // Step 5: Reload latest list
          await this.loadPendingTransactions();
        },

        error: async (error) => {
          console.error('Retry failed: ', error);

          txn.status = 'PENDING';

          await this.indexedDbService.updatePendingTransaction(txn);
          await this.loadPendingTransactions();
        }
      });
    }
    catch (error) {
      console.error('Retry error: ', error);
      txn.status = 'PENDING';

      await this.indexedDbService.updatePendingTransaction(txn);
      await this.loadPendingTransactions();
    }
  }  
}
