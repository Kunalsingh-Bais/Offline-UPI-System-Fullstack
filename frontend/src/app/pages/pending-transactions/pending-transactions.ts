import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { IndexedDbService, PendingTransaction } from '../../services/indexed-db';

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

  constructor(private indexedDbService: IndexedDbService, private cdr: ChangeDetectorRef) {}

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
}
