import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { UserService } from '../../services/user';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TransactionService } from '../../services/transaction';
import { IndexedDbService } from '../../services/indexed-db';

export interface CombinedTransaction {
  id: string;
  type: 'UPI' | 'BLE';
  senderUpiId: string;
  receiverUpiId: string;
  amount: number;
  description?: string;
  status: string;
  createdAt: string;
  source: 'backend' | 'indexeddb';
  direction?: 'sent' | 'received';
}

@Component({
  selector: 'app-transaction-history',
  standalone: true,
  imports: [CommonModule,FormsModule],
  templateUrl: './transaction-history.html',
  styleUrl: './transaction-history.css',
})

// Purpose: Display all user's transactions

// TODO: Implement API call when endpoint available
export class TransactionHistoryComponent implements OnInit{

  // Properties
  allTransactions: CombinedTransaction[] = [];
  filteredTransactions: CombinedTransaction[] = [];
  userUpiId: string | null = null;
  // Filters:- "all" | "success" | "pending" | "failed"
  selectedFilter = 'all'; 
  selectedTransactionType = 'all';  // 'all' | 'upi' | 'ble'
  sortOrder = 'latest';
  loading = false;
  selectedTransaction: CombinedTransaction | null = null;
  showModal = false;
  errorMessage = '';

  // statistics
  totalTransactions = 0;
  totalAmount = 0;
  upiCount = 0;
  bleCount = 0;

  constructor(private userService: UserService, private transactionService: TransactionService, private indexedDbService: IndexedDbService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    console.log('TransactionHistoryComponent initialized');
    
    this.loadUserInfo();
    this.loadAllTransactions();
  }

// ------ Method 1: Load user info ------
  private loadUserInfo(): void {
    this.userUpiId = localStorage.getItem('upiId')?.trim().toLowerCase() || null;
    console.log('History userUpiId: ', this.userUpiId);
  }  

// ------ Method 2: Load All Transactions (UPI + BLE) ------
  private async loadAllTransactions(): Promise<void> {
    console.log('Loading all transactions (UPI + BLE)...');
    this.loading = true;
    this.allTransactions = [];

    try {
      // Load both in parallel
      await Promise.all([
        this.loadUPITransactions(),
        this.loadBLETransactions(),
      ]);

      this.allTransactions = this.allTransactions.filter((txn, index, self) => index === self.findIndex(t => t.id === txn.id));
      
      // Calculate stats
      this.calculateStatistics();

      // Apply filters
      this.filterTransactions();

      this.loading = false;
      this.cdr.detectChanges();
    }
    catch(error) {
      console.error('Error loading transactions: ', error);
      this.errorMessage = 'Failed to load transactions.';
      this.loading = false;
      this.cdr.detectChanges();
    }
  }  

// ------ Method 3: Load UPI Transactions History ------
  private async loadUPITransactions(): Promise<void> {
    return new Promise((resolve) => {
      const profileIdValue = localStorage.getItem('profileId');

      if(!profileIdValue) {
        console.warn('Profile ID not found');
        resolve();
        return;
      }

      const profileId = Number(profileIdValue);

      this.transactionService.getTransactionHistory(profileId).subscribe({
        next: (response: any[]) => {
          console.log('UPI transactions loaded: ', response.length);

          // Convert to CombinedTransaction format
          const upiTxns = response.map(txn => ({
            id:txn.id || txn.transactionId,
            type: 'UPI' as const,
            senderUpiId: txn.senderUpiId,
            receiverUpiId: txn.receiverUpiId,
            amount: txn.amount,
            description: txn.description,
            status: txn.status,
            createdAt: txn.createdAt,
            source: 'backend' as const,
            direction: (this.isReceivedUPI(txn) ? 'received' : 'sent') as 'received' | 'sent'
          }));
          
          this.allTransactions.push(...upiTxns);
          resolve();
        },
        error: (error) => {
          console.error('Error loading UPI transactions: ', error);
          this.errorMessage = 'Failed to load UPI transactions.';
          resolve();
        }
      });
    });
  }  

// ------ Method 4: Load BLE Transactions (from IndexedDB) ------
  private async loadBLETransactions(): Promise<void> {
    try {
      const allPending = await this.indexedDbService.getAllPendingTransactions();

      // filter to load BLE transaction
      const bleData = allPending.filter(txn => txn.type === 'BLE');
  
      console.log('BLE transactions loaded: ', bleData?.length || 0);
      console.log(bleData);

      if(bleData && bleData.length > 0) {
        
        const syncedBLE = bleData.filter(t => t.status === 'SYNCED');
        // Convert to CombinedTransaction format
        const bleTxns = bleData.map(txn => ({
          id: txn.transactionId || `BLE_${Math.random().toString(36).substr(2, 9)}`,
          type: txn.type,
          senderUpiId: txn.senderUpiId,
          receiverUpiId: txn.receiverUpiId,
          amount: txn.amount,
          description: txn.description || (txn.type === 'BLE' ? 'BLE Bluetooth Payment' : 'UPI Payment'),
          status: txn.status,
          createdAt: txn.createdAt,
          source: 'indexeddb' as const,
          direction: (this.isReceivedBLE(txn) ? 'received' : 'sent') as 'received' | 'sent'
        }));

        bleTxns.forEach(txn => {
          const exists = this.allTransactions.some(t => t.id === txn.id);

          if (!exists) {
            this.allTransactions.push(txn);
          }
        });
      }
    }
    catch(error) {
      console.error('Error loading BLE transactions: ', error);
    }
  }  

// ------ Method 5: Calculate Statistics ------  
  private calculateStatistics(): void {
    this.totalTransactions = this.allTransactions.length;
    this.totalAmount = this.allTransactions.reduce((sum,t) => sum + t.amount, 0);
    this.upiCount = this.allTransactions.filter(t => t.type === 'UPI').length;
    this.bleCount = this.allTransactions.filter(t => t.type === 'BLE').length;

    console.log(`Stats - Total: ${this.totalTransactions}, UPI: ${this.upiCount}, BLE: ${this.bleCount}`);
  }

// ------ Method 6: Filter Transactions ------
  filterTransactions(): void {

    let filtered = this.allTransactions;

    // Filter by status
    if(this.selectedFilter !== 'all') {
      filtered = filtered.filter(t => t.status.toLowerCase() === this.selectedFilter);
    }

    // Filter by transaction type (UPI/BLE)
    if(this.selectedTransactionType !== 'all') {
      filtered = filtered.filter(t => t.type.toLowerCase() === this.selectedTransactionType.toLowerCase());
    }

    // Sort
    switch(this.sortOrder) {
      case 'latest': 
        filtered.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break; 
      
      case 'oldest':
        filtered.sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;

      case 'highest': 
        filtered.sort((a,b) => b.amount - a.amount);
        break;
       
      case 'lowest':
        filtered.sort((a,b) => a.amount - b.amount);
        break;
    }
    this.filteredTransactions = filtered;
  }  

// ------ Method 7: Update Filter ------
  updateFilter(filter: string): void {
    this.selectedFilter = filter;
    this.filterTransactions();
  }

  updateTransactionType(type: string): void {
    this.selectedTransactionType = type;
    this.filterTransactions();
  }

  updateSort(order: string): void {
    this.sortOrder = order;
    this.filterTransactions();
  }

// ------ Method 8: Modal Methods ------ 
  openTransactionDetail(transaction: CombinedTransaction): void {
    this.selectedTransaction = transaction;
    this.showModal = true;
  }  

  closeModal(): void {
    this.showModal = false;
    this.selectedTransaction = null;
  }  

// ------ Helper Methods ------

  getStatusBadgeClass(status: string): string {
    switch(status?.toUpperCase()) {
      case 'SUCCESS':
      case 'COMPLETED':
      case 'SYNCED':    
        return 'bg-green-100 text-green-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'FAILED':
        return 'bg-red-100 text-red-800';
      default: 
        return 'bg-gray-100 text-gray-800';      
    }
  }  

  private normalizeUpi(upi: string | null | undefined): string {
    return (upi || '').trim().toLowerCase();
  }

  // Check if transaction was received (for UPI)
  private isReceivedUPI(transaction: any): boolean {
    return this.normalizeUpi(transaction.receiverUpiId) === this.normalizeUpi(this.userUpiId);
  }

  // Check if transaction was received (for BLE)
  private isReceivedBLE(transaction: any): boolean {
    return this.normalizeUpi(transaction.receiverUpiId) === this.normalizeUpi(this.userUpiId);
  }

  getTransactionIcon(transaction: CombinedTransaction): string {
    const status = transaction.status?.toUpperCase();

    if (status === 'FAILED') return '❌';
    if (status === 'PENDING') return '⏳';

    return transaction.direction === 'received' ? '👉' : '👈';
  }

  getTransactionType(transaction: any): string {
    if(transaction.type === 'BLE') {
      return transaction.direction === 'received' ? 'Received (BLE)' : 'Sent (BLE)';
    }
    return transaction.direction === 'received' ? 'Received (UPI)' : 'Sent (UPI)';
  }

  // Get transaction label (e.g., "Received from bob@upi")
  getTransactionLabel(transaction: CombinedTransaction): string {
    const otherUpi = transaction.direction === 'received' ? transaction.senderUpiId : transaction.receiverUpiId;
    const otherName = this.extractName(otherUpi);
    const action = transaction.direction === 'received' ? 'from' : 'to';
    const type = transaction.type === 'BLE' ? '(BLE)' : '';
    return `${action} ${otherName} ${type}`;
  }

  // Extract name from UPI Id
  private extractName(upiId: string): string {
    if (!upiId) return 'Unknown';
    const name = upiId.split('@')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  getTransactionTypeBadge(transaction: CombinedTransaction): string {
    return transaction.type === 'BLE' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800';
  }

  formatCurrency(amount: number): string {
    return '₹' + amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  getAmountClass(txn: any): string {
    if (txn.status?.toUpperCase() === 'FAILED') {
      return 'text-red-600';
    }
    if (txn.status?.toUpperCase() === 'PENDING') {
      return 'text-yellow-600';
    }

    return txn.direction === 'received' ? 'text-green-600' : 'text-red-600';

  } 

  getAmountPrefix(txn: any): string {
    if (txn.status?.toUpperCase() === 'PENDING') return '⏳';
    if (txn.status?.toUpperCase() === 'FAILED') return '❌';

    return txn.direction === 'received' ? '+' : '-';
  }

  getAmountText(txn: CombinedTransaction): string {
    return `${this.getAmountPrefix(txn)} ${this.formatCurrency(txn.amount)}`;
  }
}
