import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { UserService } from '../../services/user';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TransactionService } from '../../services/transaction';
import { IndexedDbService } from '../../services/indexed-db';

export interface UpiTransactions {
  id: string;
  type: 'UPI' | 'WiFi';
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
  styleUrls: ['./transaction-history.css'],
})

// Purpose: Display all user's transactions

export class TransactionHistoryComponent implements OnInit{

  // Properties
  allTransactions: UpiTransactions[] = [];
  filteredTransactions: UpiTransactions[] = [];
  userUpiId: string | null = null;
  // Filters:- "all" | "success" | "pending" | "failed"
  selectedFilter = 'all'; 
  sortOrder = 'latest';
  loading = false;
  selectedTransaction: UpiTransactions | null = null;
  showModal = false;
  errorMessage = '';

  // statistics
  totalTransactions = 0;
  totalAmount = 0;
  upiCount = 0;
  wifiCount = 0;

  constructor(private userService: UserService, private transactionService: TransactionService, private cdr: ChangeDetectorRef, private indexedDbService: IndexedDbService) {}

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

// ------ Method 2: Load All Transactions (UPI + WiFI) ------
  private async loadAllTransactions(): Promise<void> {
    console.log('Loading all transactions...');
    this.loading = true;
    this.allTransactions = [];

    try {
      // Open DB connection
      await this.indexedDbService.openDb();

      // Load both in parallel
      await Promise.all([
        this.loadUPITransactions(),
        this.loadWiFiTransactions()
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

          // Convert to UpiTransactions format with ROBUST parsing
          const upiTxns = response.map(txn => {
            
            // 1. Safely extract nested Sender/Receiver from Java backend
            const parsedSender = txn.senderUpiId || (txn.sender && txn.sender.upiId) || txn.from || 'unknown@upi';
            const parsedReceiver = txn.receiverUpiId || (txn.receiver && txn.receiver.upiId) || txn.to || 'unknown@upi';
            
            // 2. Exact ID match to prevent duplicates during merge
            const txId = txn.transactionId || txn.id?.toString() || 'UPI_' + Date.now();
            
            // 3. Detect WiFi transactions disguised as UPI
            let txType = 'UPI';
            const rawDesc = (txn.description || txn.notes || '').toLowerCase();
            if (txn.type === 'WIFI' || txn.type === 'WiFi' || rawDesc.includes('wifi') || rawDesc.includes('offline')) {
              txType = 'WiFi';
            }
            
            // 4. Safe Date fallback
            const safeDate = txn.createdAt || txn.timestamp || txn.date || new Date().toISOString();

            return {
              id: txId,
              type: txType as 'UPI' | 'WiFi',
              senderUpiId: parsedSender,
              receiverUpiId: parsedReceiver,
              amount: txn.amount || 0,
              
              description: txn.description || txn.notes || (txType === 'WiFi' ? 'WiFi P2P Payment' : 'UPI Payment'),
              
              status: txn.status || 'COMPLETED',
              createdAt: safeDate,
              source: 'backend' as const,
              direction: (this.normalizeUpi(parsedReceiver) === this.normalizeUpi(this.userUpiId) ? 'received' : 'sent') as 'received' | 'sent'
            };
          });
          
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

// ------ Method 4: Load WiFi Transactions History (IndexedDB)  
  private async loadWiFiTransactions(): Promise<void> {
    try {
      console.log('Fetching WiFi transactions from IndexedDB...');

      // Fetch from the dedicated WiFi tables
      let sentTxns: any[] = [];
      let receivedTxns: any[] = [];

      try { 
        sentTxns = await (this.indexedDbService as any).getAllWIFISentPayments?.() || []; 
      } 
      catch(e) {}

      try { 
        receivedTxns = await (this.indexedDbService as any).getAllWIFIReceivedPayments?.() || []; 
      } 
      catch(e) {}
      
      let offlineTxns = [...sentTxns, ...receivedTxns];

      // Fallback: If empty, grab from the generic pending table and filter by 'type'
      if (offlineTxns.length === 0) {
        const pendingTransactions = await this.indexedDbService.getAllPendingTransactions() || [];
        offlineTxns = pendingTransactions.filter(txn => 
          (txn.type && txn.type.toUpperCase() === 'WIFI') || 
          txn.transactionId?.toString().toUpperCase().includes('WIFI') ||
          txn.transactionId?.toString().toUpperCase().includes('BLE')
        );
      }

      const currentUserUpi = localStorage.getItem('upiId')?.trim().toLowerCase();

      offlineTxns = offlineTxns.filter(txn => {
        const sender = (txn.senderUpiId || txn.senderUPI || '').toLowerCase;
        const receiver = (txn.receiverUpiId || txn.receiverUPI || '').toLowerCase();

        return sender === currentUserUpi || receiver === currentUserUpi;
      });

      if (offlineTxns.length === 0) return;

      const wifiTxns: UpiTransactions[] = offlineTxns.map(txn => {
        const txnIdStr = txn.transactionId?.toString() || `WIFI_${Date.now()}`;
        const isReceived = txnIdStr.includes('_RCV_') || this.isReceivedUPI(txn.receiverUpiId || txn.receiverUPI);
          
          return {
            id: txnIdStr,
            type: 'WiFi' as const,
            senderUpiId: txn.senderUpiId,
            receiverUpiId: txn.receiverUpiId,
            amount: txn.amount,
            description: txn.description || 'WiFi P2P Payment',
            status: txn.status === 'PENDING' ? 'PENDING' : 'SUCCESS',
            createdAt: txn.createdAt, 
            source: 'indexeddb' as const,
            direction: isReceived ? 'received' : 'sent'
          };
        });

      this.allTransactions.push(...wifiTxns);
      console.log('WiFi transactions loaded:', wifiTxns.length);
    } catch (error) {
      console.error('Error loading WiFi transactions:', error);
    }
  }

// ------ Method 5: Calculate Statistics ------  
  private calculateStatistics(): void {
    this.totalTransactions = this.allTransactions.length;
    this.totalAmount = this.allTransactions.reduce((sum,t) => sum + t.amount, 0);
    this.upiCount = this.allTransactions.filter(t => t.type === 'UPI').length;
    this.wifiCount = this.allTransactions.filter(t => t.type === 'WiFi').length;

    console.log(`Stats - Total: ${this.totalTransactions}, UPI: ${this.upiCount}, WIFI: ${this.wifiCount}`);
  }

// ------ Method 6: Filter Transactions ------
  filterTransactions(): void {

    let filtered = this.allTransactions;

    // Filter by status
    if(this.selectedFilter !== 'all') {
      // Need to handle different casings cleanly
      filtered = filtered.filter(t => 
        (t.status || '').toLowerCase() === this.selectedFilter.toLowerCase() || (this.selectedFilter === 'success' && (t.status || '').toLowerCase() === 'completed')
      );
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

  updateSort(order: string): void {
    this.sortOrder = order;
    this.filterTransactions();
  }

// ------ Method 8: Modal Methods ------ 
  openTransactionDetail(transaction: UpiTransactions): void {
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
  private isReceivedUPI(targetUpi: string | null | undefined): boolean {
    return this.normalizeUpi(targetUpi) === this.normalizeUpi(this.userUpiId);
  }

  getTransactionIcon(transaction: UpiTransactions): string {
    const status = transaction.status?.toUpperCase();

    if (status === 'FAILED') return '❌';
    if (status === 'PENDING') return '⏳';

    return transaction.direction === 'received' ? '👉' : '👈';
  }

  // Get transaction label (e.g., "Received from bob@upi")
  getTransactionLabel(transaction: UpiTransactions): string {
    const otherUpi = transaction.direction === 'received' ? transaction.senderUpiId : transaction.receiverUpiId;
    const otherName = this.extractName(otherUpi);
    const action = transaction.direction === 'received' ? 'from' : 'to';
    return `${action} ${otherName}`;
  }

  // Extract name from UPI Id
  private extractName(upiId: string): string {
    if (!upiId) return 'Unknown';
    const name = upiId.split('@')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
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

  getAmountText(txn: UpiTransactions): string {
    return `${this.getAmountPrefix(txn)} ${this.formatCurrency(txn.amount)}`;
  }
}
