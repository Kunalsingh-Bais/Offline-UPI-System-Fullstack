import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { UserService } from '../../services/user';
import { TransactionService } from '../../services/transaction';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IndexedDbService } from '../../services/indexed-db';

// Combined transaction interface (UPI or BLE)
export interface CombinedTransaction {
  id: string;
  type: 'UPI' | 'BLE';
  fromUPI: string;
  toUPI: string;
  amount: number;
  description: string;
  timestamp: number;
  dateTime: string;
  status: 'pending' | 'completed' | 'failed' | 'synced';
  synced: boolean;
  source: 'backend' | 'indexeddb';
  direction?: 'sent' | 'received';
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardComponent implements OnInit{

  // Properties
  userName: string | null = null;
  userUpiId: string | null = null;
  userEmail: string | null = null;
  walletBalance: null | number = 0;
  profileId: number | null = null;
  loadingBalance = true;
  loadingTransactions = false;
  recentTransactions: CombinedTransaction[] = [];    // last 5 transactions
  errorMessage = '';
  upiTransactions: any[] = [];
  bleTransactions: CombinedTransaction[] = [];
  isOnline = navigator.onLine;
  totalTransactions = 0;  

  constructor(private userService: UserService, private transactionService: TransactionService, private router: Router, private cdr: ChangeDetectorRef, private indexedDbService: IndexedDbService) {}

  async ngOnInit(): Promise<void> {
    console.log('DashboardComponent initialized');

    try {
      await this,this.indexedDbService.openDb();
      console.log('IndexedDB initalized');
    }
    catch (error) {
      console.error('IndexedDB error: ', error);
    }

    this.loadUserInfo();
    this.loadWalletBalance();
    
    await this.loadAllTransactions();

    this.setupOnlineDetection();
  }
 
// ------ Method 1: Load user info ------
  private loadUserInfo(): void {
    console.log('Loading user info...');

    this.userName = localStorage.getItem('name') || 'User';
    this.userUpiId = this.userService.getUpiIdFromStorage() || localStorage.getItem('upiId');
    this.userEmail = localStorage.getItem('email');

    const storedProfileId = this.userService.getProfileIdFromStorage();
    const storedUSerId = localStorage.getItem('userId');

    this.profileId = storedProfileId || (storedUSerId ? Number(storedUSerId) : null);

    console.log('User info loaded');
    console.log('Name: ', this.userEmail);
    console.log('UPI: ', this.userUpiId);
    console.log('Profile ID: ', this.profileId);
  }  

// ------ Method 2: Load wallet balance ------
  private loadWalletBalance(): void {
    console.log('Loading wallet balance...');

    if(!this.profileId) {
      console.warn('⚠️ No profileId found');
      this.errorMessage = 'Unable to load profile. Please login again.';
      return;
    }

    this.loadingBalance = true;
    this.walletBalance = null;

    this.userService.getBalance(this.profileId).subscribe({
      next: (response) => {
        console.log('Balance response: ', response);

        if (response !== null && response !== undefined) {

          if(response.balance !== undefined) {
            this.walletBalance = Number(response.balance);
          }
          else if (typeof response === 'number') {
            this.walletBalance = response;
          }
          else if(response.success && response.balance !== undefined) {
            this.walletBalance = Number(response.balance);
          }
          else {
            console.log('Full response: ', JSON.stringify(response));
            this.walletBalance = 0;
          }
        }
        this.loadingBalance = false;
        console.log('loadingBalance: ', this.loadingBalance);
        this.cdr.detectChanges();
      },

      error: (error) => {
        console.log('Error loading balance: ', error);
        this.loadingBalance = false;
        this.errorMessage = 'Failed to load wallet balance.';
        this.cdr.detectChanges();
      }
    });
  }  

// ------ Method 3: Load ALL transaction (UPI + BLE) ------
  // shows last 3 transactions history
  private async loadAllTransactions(): Promise<void> {
    console.log('Loading all transactions (UPI + BLE)...');

    try {
      this.loadingTransactions = true;

      // Load UPI transactions from backend
      await this.loadUPITransactions();

      // Load BLE transactions from indexedDB
      await this.loadBLETransactions();

      this.mergeTransactions();

      // Sort by date
      this.sortTransactions();

      // Total transactions
      this.totalTransactions = this.recentTransactions.length;

      // Show last 5 transactions
      this.recentTransactions = this.recentTransactions.slice(0,5);

      console.log('All transactions loaded: ', this.recentTransactions.length);
    }
    catch (error) {
      console.error('Error loading transactions: ', error);
      this.errorMessage = 'Failed to load transactions.';
    }
    finally {
      this.loadingTransactions = false;
      this.cdr.detectChanges();
    }
  }  

// ------ Method 4: Load UPI transactions from Backend ------  
  private loadUPITransactions(): Promise<void> {
    return new Promise((resolve) => {
      try {
        console.log('Fetching UPI transactions from backend...');

        const profileIdValue = localStorage.getItem('profileId');

        if(!profileIdValue) {
          console.warn('No profileId, skipping UPI transactions');
          this.upiTransactions = [];
          resolve();
          return;
        }

        const profileId = Number(profileIdValue);

        this.transactionService.getTransactionHistory(profileId).subscribe({
          next: (response) => {
            console.log('UPI transactions received: ', response?.length || 0);

            // Transform backend transactions to CombinedTransaction format
            this.upiTransactions = (response || []).map((txn: any) => ({
              id: txn.id?.toString() || 'UPI_' + Date.now(),
              type: 'UPI' as const,
              fromUPI: txn.senderUpiId || txn.from || 'unknown@upi',
              toUPI: txn.receiverUpiId || txn.to || 'unknown@upi',
              amount: txn.amount || 0,
              description: txn.description || 'UPI Payment',
              timestamp: new Date(txn.timestamp || txn.date).getTime(),
              dateTime: new Date(txn.timestamp || txn.date).toLocaleString('en-IN'),
              status: 'completed' as const,
              synced: true,
              source: 'backend' as const
            }));

            resolve();
          }, 
          error: (error) => {
            console.error('Enter fetching UPI transactions: ', error);
            this.upiTransactions = [];
            resolve();
          }
        });

        // Timeout after 5 seconds
        setTimeout(() => {
          resolve();
        }, 5000);
      }
      catch (error) {
        console.error('Error in loadUPITransactions: ', error);
        resolve();
      }
    });
  }

// ------ Method 5: Load BLE Transactions from IndexedDB ------
  private async loadBLETransactions(): Promise<void> {
    try {
      console.log('Fetching BLE transactions from IndexedDB...');

      const PendingTransactions = await this.indexedDbService.getAllPendingTransactions();

      console.log('Found in IndexedDB: ', PendingTransactions?.length || 0);

      // Transform IndexedDB format to CombinedTransaction format
      this.bleTransactions = (PendingTransactions || []).filter(txn => txn.transactionId.startsWith('BLE')).map(txn => ({
        id: txn.transactionId,
        type: 'BLE' as const,
        fromUPI: txn.senderUpiId,
        toUPI: txn.receiverUpiId,
        amount: txn.amount,
        description: txn.description || 'BLE Payment',
        timestamp: new Date(txn.createdAt).getTime(),
        dateTime: new Date(txn.createdAt).toLocaleString('en-IN'),
        status: txn.status === 'PENDING' ? 'pending' : 'completed',
        synced: txn.status !== 'PENDING',
        source: 'indexeddb' as const,
        direction: txn.transactionId.includes('_RCV_') ? 'received' : 'sent'
      }));

      console.log('BLE transactions loaded: ', this.bleTransactions.length);
    }
    catch (error) {
      console.error('Error loading BLE transactions: ', error);
      this.bleTransactions = [];
    }
  }
   
// ------ Method 6: Merge UPI + BLE Transactions ------
  private mergeTransactions(): void {
    console.log('Merging transactions...');
    console.log('UPI: ', this.upiTransactions.length);
    console.log('BLE: ', this.bleTransactions.length);

    const merged: CombinedTransaction[] = [];

    // Add UPI transactions
    merged.push(...this.upiTransactions);

    // Add BLE transactions
    merged.push(...this.bleTransactions);

    this.recentTransactions = merged;

    console.log('Merged total: ', merged.length);
  }  

// ------ Method 7: Sort Transactions by Date ------
  private sortTransactions(): void {
    this.recentTransactions.sort((a,b) => {
      return b.timestamp - a.timestamp;
    });

    console.log('Transactions sorted by date');
  }  

// ------ Method 8: Setup Online Detection ------
  // Detect when device gets online/offline
  private setupOnlineDetection(): void {
    window.addEventListener('online', () => {
      console.log('Connection restored');
      this.isOnline = true;
      this.cdr.detectChanges();
    });

    window.addEventListener('offline', () => {
      console.log('Connection lost');
      this.isOnline = false;
      this.cdr.detectChanges();
    });
  }
    
// ------ Method 9: Navigate to send money ------
  goToSendMoney(): void {
    console.log('Navigating to send money...');
    this.router.navigate(['/payment/initiate']);
  }

// ------ Method 10: Navigate to history ------
  goToHistory(): void {
    console.log('Navigating to transaction history...');
    this.router.navigate(['/transactions']);
  }  

// ------ Method 11: Navigate to Bluetooth Payment ------
  goToBluetoothPayment(): void {
    console.log('Navigating to Bluetooth Payment...');
    this.router.navigate(['/ble-role-selection']);
  }  

// ------ Method 12: Format currency ------
  formatCurrency(amount: number | null): string {
    if(amount === null || amount === undefined) {
      return '₹0.00';
    }

    return '₹' + amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

// ------ Method 13: Get transaction status color ------
  getStatusBadgeClass(status: string): string {
    const normalizedStatus = status?.toUpperCase();

    switch(normalizedStatus) {
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

// ------ Method 14: Get transaction icon ------
  // Get emoji icon based on transaction type
  getTransactionIcon(transaction: any): string {
   if(transaction.receiverUpiId === this.userUpiId) {
     return '👉';  // Money in
   }
   else {
     return '👈';  // Money out
   }
  } 

// ------ Method 15: Get Transaction Label ------
  getTransactionLabel(transaction: CombinedTransaction): string {
    if (transaction.type === 'UPI') {
      const otherUPI = transaction.fromUPI === this.userUpiId ? transaction.toUPI : transaction.fromUPI;
      const direction = transaction.fromUPI === this.userUpiId ? 'to' : 'from';
      const name = this.extractName(otherUPI);
      return `${direction} ${name}`;
    }
    else {
      // BLE
      const otherUPI = transaction.fromUPI === this.userUpiId ? transaction.toUPI : transaction.fromUPI;
      const direction = transaction.direction === 'sent' ? 'to' : 'from';
      const name = this.extractName(otherUPI);
      return `BLE ${direction} ${name}`;
    }
  }
  
// ------ Method 16: Extract Name from UPI ------ 
  private extractName(upi: string): string {
    if (!upi) return 'Unknown';
    const name = upi.split('@')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } 

// ------ Method 17: Get status text ------
  getStatusText(transaction: CombinedTransaction): string {
    if (transaction.type === 'UPI') {
      return 'Confirmed';
    }
    else {
      return transaction.synced ? 'Synced' : 'Pending';
    }
  }  

// ------ Method 18: Refresh all dashboard data ------
  async refreshDashboard(): Promise<void> {
    console.log('Refreshing dashboard...');
    this.loadWalletBalance();
    await this.loadAllTransactions();
  }
}
