import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { IndexedDbService, PendingTransaction } from '../../services/indexed-db';
import { TransactionService } from '../../services/transaction';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SyncBleService } from '../../services/sync-ble';

@Component({
  selector: 'app-pending-transactions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pending-transactions.html',
  styleUrl: './pending-transactions.css',
})
export class PendingTransactionsComponent implements OnInit, OnDestroy{

  // Properties :
  // This array will store transactions
  pendingTransactions: PendingTransaction[] =[];
  loading = false;
  isRetrying = false;
  retryingTransactionId: string | null = null;

  // Properties for BLE Sync
  isSyncingBLE = false;
  isOnline = navigator.onLine;
  bleStats = {pending: 0, synced: 0, failed: 0};

  // Notification system
  notification: {
    type: 'processing' | 'success' | 'error' | 'info';
    message: string;
  } | null = null;

  // Event listeners
  private onlineListener: any;
  private offlineListener: any;

  constructor(private indexedDbService: IndexedDbService, private cdr: ChangeDetectorRef, private transactionService: TransactionService, private router: Router , private syncBleService: SyncBleService) {}

  ngOnInit(): void {
    this.loadPendingTransactions();
    this.setupOnlineOfflineListeners();
  }

  ngOnDestroy(): void {
    // Clean up listeners
    if (this.onlineListener) {
      window.removeEventListener('online', this.onlineListener);
    }
    if (this.offlineListener) {
      window.removeEventListener('offline', this.offlineListener);
    }
  }

// ------ Setup Online/Offline Listeners ------  
  private setupOnlineOfflineListeners(): void {
    this.onlineListener = () => {
      this.isOnline = true;
      console.log('Back Online');
      this.cdr.detectChanges();
    };
 
    this.offlineListener = () => {
      this.isOnline = false;
      console.log('Going Offline');
      this.cdr.detectChanges();
    };

    window.addEventListener('online', this.onlineListener);
    window.addEventListener('offline', this.offlineListener);
  }

// ------ Method 1: Load all Pending Transactions from IndexedDB ------  
  async loadPendingTransactions(): Promise<void> {
    // Start loading
    this.loading = true;

    try {
      // Read all transactions from IndexedDB service
      this.pendingTransactions = await this.indexedDbService.getAllPendingTransactions();

      this.calculateBLEStats();
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

// ------ Calculate BLE Sync Statistics ------  
  private calculateBLEStats(): void {
    this.bleStats = {
      pending: this.pendingTransactions.filter(t => t.type === 'BLE' && t.status === 'PENDING').length,
      synced: this.pendingTransactions.filter(t => t.type === 'BLE' && t.status === 'SYNCED').length,
      failed: this.pendingTransactions.filter(t => t.type === 'BLE' && t.status === 'FAILED').length
    };
    console.log('BLE Stats: ', this.bleStats);
  }

// ------ Method 2: Sync All BLE Transactions to backend ------  
  async syncAllBLE(): Promise<void> {
    if (this.bleStats.pending === 0) {
      this.showNotification('info','✅ No pending BLE transactions to sync');
      return;
    }

    if (!this.isOnline) {
      this.showNotification('error', '📴 You are offline.\n\nWill sync automatically when online.');
    }

    if (this.isSyncingBLE) {
      console.warn('Already syncing BLE transactions');
      return;
    }

    // Confirm sync
    const confirmSync = confirm(`Sync ${this.bleStats.pending} pending BLE transactions?\n\n` + `Total Amount: ₹${this.getTotalAmount()}`);

    if (!confirmSync) return;

    // Step 1: Set UI flags
    this.isSyncingBLE = true;
    this.cdr.detectChanges();

    this.showNotification('processing', `⏳ Syncing ${this.bleStats.pending} BLE transactions to backend...`);

    console.log('Starting BLE sync');

    try {
      // Step 2: Call sync service
      const results = await firstValueFrom(this.syncBleService.syncAllPendingBLE());

      console.log('BLE Sync completed: ', results);

      // Step 3: Check results
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      // Step 4: Show summary 
      const summary = `Sync Complete:\n✅ Synced: ${successCount}\n❌ Failed: ${failureCount}`;
      this.showNotification('success', summary);

      console.log(summary);

      await this.delay(3000);
    }
    catch (error) {
      console.error('BLE sync error: ', error);
      this.showNotification('error', '❌ Sync Failed\n\nCould not sync BLE transactions. Please try again.');
      await this.delay(3000);

    }
    finally {
      // Step 5: Reset UI flags
      this.isSyncingBLE = false;
      this.cdr.detectChanges();

      // Step 6: Reload list
      await this.loadPendingTransactions();

      // Clear notification
      this.notification = null;
      this.cdr.detectChanges();
    }
  } 

// ------ Method 3: Delete transaction ------
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

// ------ Method 4: Retry Pending transaction (UPI + BLE) ------
  async retryTransaction(txn: PendingTransaction): Promise<void> {
    if (!txn.id) {
      console.warn('Transaction ID missing');
      return;
    }

    if (this.isRetrying) {
      console.warn('Already retrying another transaction');
      return;
    }

    if (!this.isOnline) {
      this.showNotification('error', '📴 You are offline.\n\nWill retry when online.');
      return;
    }

    if ((txn.retryCount || 0) > 5) {
      txn.status = 'FAILED';

      await this.indexedDbService.updatePendingTransaction(txn);

      this.showNotification('error', `❌ Maximum retry limit reached.`);

      await this.loadPendingTransactions();
      return;
    }

    // Step 1: Show processing state 
    this.isRetrying = true;
    this.retryingTransactionId = txn.transactionId;
    this.cdr.detectChanges();

    this.showNotification('processing', `⏳ Processing payment for ₹{txn.type === 'BLE' ? 'BLE' : 'UPI'} payment...\n\nAmount: ₹${txn.amount}`);

    console.log(`Starting retry for: ${txn.transactionId} (Type" ${txn.type})`);

    console.log('⏳ Showing processing spinner...');
    await this.delay(2000);
    
    try {
      // Step 2: Update status to SYNCING
      
      txn.retryCount = (txn.retryCount || 0) + 1;
      txn.status = 'SYNCING';

      await this.indexedDbService.updatePendingTransaction(txn);
      console.log('Updated to SYNCING, retry count: ', txn.retryCount);
      this.cdr.detectChanges();

      // Step 3: Prepare request
      const request = {
        transactionId: txn.transactionId,
        encryptedData: txn.encryptedData
      };

      console.log('Sending to backend...');

      // Step 4: Route to correct endpoint based on type
      let response: any;

      if (txn.type === 'BLE') {
        // --- BLE transaction ---
        console.log('Routing to BLE sync endpoint...');
        response = await this.syncBleService.syncSingleBLE(txn);
        console.log('BLE response: ', response);

        // Check if sync was successful
        if (response && response.success) {
          console.log('SUCCESS: BLE synced');
          
          // Update status to SYNCED
          txn.status = 'SYNCED';
          await this.indexedDbService.updatePendingTransaction(txn);

          this.showNotification('success', `✅ BLE Payment Synced!\n\nAmount: ₹${txn.amount}\nTransaction synced to backend`);
        }
        else {
          console.log('Failed: BLE sync failed');
          txn.status = 'FAILED';
          await this.indexedDbService.updatePendingTransaction(txn);

          if (txn.retryCount >= 5) {
            this.showNotification('error', `❌ BLE Sync Failed\n\n${response.message}\n\nRetry count: ${txn.retryCount}/5`);
          }
          else {
            this.showNotification('error', `❌ BLE Sync Failed\n\n${response.message}\n\nRetry count: ${txn.retryCount}/5`);
          }
        }
      }
      else {
        // --- UPI Transaction ---
        console.log('Routing to UPI complete endpoint...');
        response = await firstValueFrom(this.transactionService.completeTransaction(request));

        console.log('UPI response: ', response);

        // Check if backend accepted
        if (response && response.success) {
          console.log('SUCCESS: UPI payment completed');

          // Delete from IndexedDbService (Transaction is completed)
          await this.indexedDbService.deletePendingTransaction(txn.id);
          console.log('Deleted from IndexedDB');

          this.showNotification('success', `✅ UPI Payment Completed!\n\nAmount: ₹${txn.amount}`);
        }
        else {
          console.log('FAILED: Backend rejected UPI');

          txn.status = 'FAILED';
          await this.indexedDbService.updatePendingTransaction(txn);

          this.showNotification('error','❌UPI Payment Failed');
        }
      }
    }
    catch (error: any) {
      console.log('❌ CATCH BLOCK: Error occurred');
      console.log('Error status: ', error?.status);
      console.log('Error message: ', error?.message);

      txn.status = 'FAILED';

      await this.indexedDbService.updatePendingTransaction(txn);

      let errorMsg = 'Unknown error';

      if(error?.status === 503) {
        errorMsg = 'Backend service unavailable. \n Please try again later.';
      }
      else if(error?.status === 0) {
        errorMsg = 'Network error.\n Check if backend is reachable.';
      }
      else if(error?.error?.message) {
        errorMsg = error.error.message;
      }
      else if(error?.message) {
        errorMsg = error.message;
      }

      this.showNotification('error', `❌ Retry Failed\n\n ${errorMsg}\n\n Retry count: ${txn.retryCount}/5`);

      await this.delay(6000);
    }
    finally {
      // Step 5: Reset UI flags
      this.isRetrying = false;
      this.retryingTransactionId = null;
      this.cdr.detectChanges();

      await this.delay(3000);

      // Step 6: Reload List
      await this.loadPendingTransactions();

      // Clear notification
      this.notification = null;
      this.cdr.detectChanges();
    }
  }

// ------ Method 5: Show Notification system ------
  private showNotification(type: 'processing' | 'success' | 'error' | 'info', message: string): void {
    
    console.log(`[${type.toUpperCase()}] ${message}`);

    this.notification = { type: type as any, message};
    this.cdr.detectChanges();

    // Auto-hide after 5 seconds (except processing)
    if (type !== 'processing') {
      setTimeout(() => {
        if (this.notification && this.notification.type === type) {
          this.notification = null;
          this.cdr.detectChanges();
        }  
      }, 5000);
    }
  }  

// ------ Method 6: Sync All Pending Transactions ------  
  async syncAllTransactions(): Promise<void> {

    // Step 1: Check whether transactions exist
    if (this.pendingTransactions.length === 0) {
      this.showNotification('info', 'No pending transactions to sync');
      return;
    }

    // Prevent multiple sync processes at the same time
    if(this.isRetrying) {
      console.warn('Already syncing');
      return;
    }

    // Step 2: Only include transactions below max retry limit
    const syncableTransactions = this.pendingTransactions.filter(txn => (txn.retryCount || 0) < 5);

    // Nothing can be retried
    if (syncableTransactions.length === 0) {
      this.showNotification('info', '⚠️ All transactions have reached max retry limit (5)');
      return;
    }

    // Calculate amount only for transactions actually being synced
    const syncableTotalAmount = syncableTransactions.reduce((sum, txn) => sum + txn.amount, 0);

    // Ask user for confirmation
    const confirmSync = confirm(
      `Sync ${this.getSyncableTransactionCount()} pending transactions?\n\n` +
      `Total Amount: ₹${this.getSyncableTransactionAmount()}`
    );

    if (!confirmSync) return;

    // Step 3: Set UI syncing state 
    this.isRetrying = true;
    this.cdr.detectChanges();

    this.showNotification('processing', `⏳ Syncing ${this.getSyncableTransactionCount()} transactions...\n\nTotal Amount: ₹${this.getSyncableTransactionAmount()}`);

    console.log('Starting sync of All Transactions...');
    await this.delay(4000);

    let successCount = 0;
    let failureCount = 0;

    try {
      // Step 4: Create one async task for every transaction
      const syncPromises = syncableTransactions.map(async (txn, index) => {
        if (!txn.id) {
          console.warn(`Skipping ${txn.transactionId}: IndexedDB ID missing`);
          return;
        }

        console.log(`Syncing ${index + 1}/${syncableTransactions.length}: ` + `${txn.transactionId} (${txn.amount})`);

        try {
          // Increment retry only ONCE for this attempt
          txn.retryCount = (txn.retryCount || 0) + 1;
          txn.status = 'SYNCING';

          await this.indexedDbService.updatePendingTransaction(txn);

          console.log(`${txn.transactionId} marked SYNCING - ` + `retry ${txn.retryCount}/5`);

          // Request required for backend
          const request = {
            transactionId: txn.transactionId,
            encryptedData: txn.encryptedData
          };

          // BLE Transaction
          if (txn.type === 'BLE') {
            console.log(`Routing ${txn.transactionId} to BLE sync`);

            const response = await this.syncBleService.syncSingleBLE(txn);

            console.log('BLE sync response: ', response);

            if (response && response.success) {
              console.log(`BLE ${txn.transactionId} synced successfully`);

              successCount++;

              // Keep BLE record locally as synced
              txn.status = 'SYNCED';
              await this.indexedDbService.updatePendingTransaction(txn);
            }
            else {
              console.log(`BLE ${txn.transactionId} failed`);

              failureCount++;
              txn.status = 'FAILED';

              await this.indexedDbService.updatePendingTransaction(txn);
            }
          }

          // UPI Transaction
          else {
            console.log(`Routing ${txn.transactionId} to UPI endpoint`);

            const response = await firstValueFrom(this.transactionService.completeTransaction(request));

            console.log('UPI response: ', response);

            if(response && response.success) {
              console.log(`UPI ${txn.transactionId} synced successfully`);

              successCount++;

              // After UPI is completed , remove pending locally
              await this.indexedDbService.deletePendingTransaction(txn.id);

              console.log(`${txn.transactionId} removed from pending IndexedDB`);
            }
            else {
              console.log(`UPI ${txn.transactionId} failed`);
              failureCount++;

              txn.status = 'FAILED';
              await this.indexedDbService.updatePendingTransaction(txn);
            }
          }
        }
        catch (error: any) {
          console.error(`Error syncing ${txn.transactionId}: `, error);

          failureCount++;
          txn.status = 'FAILED';

          try {
            await this.indexedDbService.updatePendingTransaction(txn);
          }
          catch (dbError) {
            console.error(`Failed to update ${txn.transactionId} ` + `to FAILED in IndexedDB: `, dbError);
          }
        }
      });

      // Step 5: Wait until All transactions finish
      await Promise.all(syncPromises);

      console.log('All transaction sync attempts completed');
    }
    catch (error) {
      console.error('Unexpected error during Sync All: ', error);

      this.showNotification('error', '❌ An unexpected error occurred while syncing transactions.');

    }
    finally {
      // Step 6: Always reset UI state
      this.isRetrying = false;
      this.cdr.detectChanges();

      // Reload latest transaction states from IndexedDB
      await this.loadPendingTransactions();

      // Show final summary
      const summary = `Sync Complete: \n\n` + `Success: ${successCount}\n` + `Failed: ${failureCount}`;

      if (failureCount > 0) {
        this.showNotification('info', summary);
      }
      else {
        this.showNotification('success', summary);
      }

      console.log(summary);

      await this.delay(3000);
      this.notification = null;
      this.cdr.detectChanges();
  }
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

// ------ Helper Method 6: Delay for UX ------
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }  

// ------ Helper Method 7: Get Count by status ------
  getPendingCount(): number {
    return this.pendingTransactions.filter(txn => txn.status === 'PENDING').length;
  }  

  getFailedCount(): number {
    return this.pendingTransactions.filter(txn => txn.status === 'FAILED').length;
  }

  getSyncingCount(): number {
    return this.pendingTransactions.filter(txn => txn.status === 'SYNCING').length;
  }

  getSyncedCount(): number {
    return this.pendingTransactions.filter(txn => txn.status === 'SYNCED').length;
  }

  getSyncableTransactionCount(): number {
    return this.pendingTransactions.filter(txn => txn.retryCount < 5 && txn.status === 'PENDING').length;
  }

  getSyncableTransactionAmount(): number {
    return this.pendingTransactions.filter(txn => txn.status === 'PENDING').reduce((total, txn) => total + txn.amount, 0);
  }
}
