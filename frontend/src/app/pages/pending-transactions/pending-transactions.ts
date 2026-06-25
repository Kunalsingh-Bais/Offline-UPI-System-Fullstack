import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { IndexedDbService, PendingTransaction } from '../../services/indexed-db';
import { TransactionService } from '../../services/transaction';
import { Router } from '@angular/router';

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
  isRetrying = false;
  retryingTransactionId: string | null = null;

  constructor(private indexedDbService: IndexedDbService, private cdr: ChangeDetectorRef, private transactionService: TransactionService, private router: Router) {}

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

    if (!confirm('Are you sure you want to delete this transaction?')) {
      return;
    }  

    try {
      // Delete transaction from IndexedDB
      await this.indexedDbService.deletePendingTransaction(id);
      console.log('Transaction deleted from IndexedDB');

      // Reload list after deleting
      await this.loadPendingTransactions();
    }
    catch (error) {
      console.log('Failed to delete transaction: ', error);
      alert('Failed to delete transaction');
    } 
  }  

// ------ Method 3: Retry Pending transaction ------
  async retryTransaction(txn: PendingTransaction): Promise<void> {
    if (!txn.id) {
      console.warn('Transaction ID missing');
      return;
    }

    if (this.isRetrying) {
      console.warn('Already retrying another transaction');
      return;
    }

    this.isRetrying = true;
    this.retryingTransactionId = txn.transactionId;
      this.cdr.detectChanges();

    console.log('Starting retry for: ', txn.transactionId);

    txn.status = 'SYNCING';
    txn.retryCount = txn.retryCount + 1;

    await this.indexedDbService.updatePendingTransaction(txn);

    const request = {
      transactionId: txn.transactionId,
      encryptedData: txn.encryptedData
    };

    this.transactionService.completeTransaction(request).subscribe({
      next: async (response: any) => {
        if (response.success) {
          await this.indexedDbService.deletePendingTransaction(txn.id!);

          this.showAlert(
            'success',
            `Transaction ${txn.transactionId} synced successfully!`
          );
        } else {
          txn.status = 'FAILED';
          await this.indexedDbService.updatePendingTransaction(txn);

          this.showAlert(
            'error',
            `Server rejected transaction. Retry count: ${txn.retryCount}`
          );
        }

        await this.loadPendingTransactions();

        this.isRetrying = false;
        this.retryingTransactionId = null;
        this.cdr.detectChanges();
      },

      error: async (error) => {
        console.error('Retry failed:', error);

        txn.status = 'FAILED';
        await this.indexedDbService.updatePendingTransaction(txn);

        const errorMsg =
          error?.error?.message ||
          error?.message ||
          'Backend unavailable';

        this.showAlert(
          'error',
          `Retry failed: ${errorMsg}. Retry count: ${txn.retryCount}`
        );

        await this.loadPendingTransactions();

        this.isRetrying = false;
        this.retryingTransactionId = null;
        this.cdr.detectChanges();
      }
    });
  }

// ------ Method 4: Retry All Pending Transactions ------  
  async syncAllTransactions(): Promise<void> {
    if (this.pendingTransactions.length === 0) {
      this.showAlert('info', 'No pending transactions to sync');
      return;
    }

    if(this.isRetrying) {
      console.warn('Already retrying');
      return;
    }

    const confirmSync = confirm(
      `Sync ${this.pendingTransactions.length} pending transactions?\n\n` +
      `Total Amount: ₹{this.getTotalAmount()}`
    );

    if (!confirmSync) return;

    // Step 1: Set UI flags
    this.isRetrying = true;
    this.cdr.detectChanges();

    console.log('Starting sync of All Transactions...');

    let successCount = 0;
    let failureCount = 0;
    const transactionsToDelete: number[] = [];

    // Step 2: Process each transaction
    for (const txn of this.pendingTransactions) {
      if (!txn.id) continue;

      try {
        // Mark as SYNCING
        txn.status = 'SYNCING';
        txn.retryCount = txn.retryCount + 1;
        
        await this.indexedDbService.updatePendingTransaction(txn);
        console.log(`Syncing ${txn.transactionId}...`);

        // Send to backend
        const request = {
          encryptedData: txn.encryptedData,
          transactionId: txn.transactionId
        };
        
        this.transactionService.completeTransaction(request).subscribe({
          next: async (response) => {
            // Check response
            if (response.success) {
              console.log(`${txn.transactionId} synced`);
              successCount++;

              await this.indexedDbService.deletePendingTransaction(txn.id!);
            }
            else {
              console.log(`${txn.transactionId} failed at backend`);

              failureCount++;
              txn.status = 'FAILED';

              await this.indexedDbService.updatePendingTransaction(txn);
            }
          }
        });
      }
      catch (error) {
        console.warn(`${txn.transactionId} error:`, error);
        failureCount++;
        txn.status = 'FAILED';

        await this.indexedDbService.updatePendingTransaction(txn);
      }
    }

    // Step 3: Delete successfully synced transactions
    console.log(`Deleting ${transactionsToDelete.length} successful transactions...`);

    for (const id of transactionsToDelete) {
      await this.indexedDbService.deletePendingTransaction(id);
    }

    // Step 4: Reset UI flags
    this.isRetrying = false;
    this.cdr.detectChanges();

    // Step 5: Reload and show summary
    await this.loadPendingTransactions();

    const summary = `Sync Complete:\n Success: ${successCount}\n Failed: ${failureCount}`;
    this.showAlert('info', summary);
    console.log(summary); 
  }

// ------ Helper Method 1: Show Alert/Toast ------  
  private showAlert(type: 'success' | 'error' | 'info', message: string): void{
    console.log(`[${type.toUpperCase()}] ${message}`);

    if(type === 'error') {
      alert(message);
    }
  } 

// ------ Helper Method 2: Get total pending amount ------
  getTotalAmount(): number {
    return this.pendingTransactions.reduce((sum, txn) => sum + txn.amount, 0);
  }  

// ------ Helper Method 3: Get status badge color ------
  getStatusColor(status: string): string {
    switch (status) {
      case 'PENDING':
        return 'yellow';
      case 'SYNCING':
        return 'blue';
      case 'FAILED':
        return 'red';
      default:
        return 'gray';      
    }
  }
  
// ------ Helper Method 4: Format currency ------
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  }  

// ------ Helper Method 5: Format date ------
  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  } 

// ------ Helper Method 6: Get Count by status ------
  getPendingCount(): number {
    return this.pendingTransactions.filter(txn => txn.status === 'PENDING').length;
  }  

  getFailedCount(): number {
    return this.pendingTransactions.filter(txn => txn.status === 'FAILED').length;
  }

  getSyncingCount(): number {
    return this.pendingTransactions.filter(txn => txn.status === 'SYNCING').length;
  }
}
