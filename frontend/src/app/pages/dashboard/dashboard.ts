import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { UserService } from '../../services/user';
import { TransactionService } from '../../services/transaction';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IndexedDbService } from '../../services/indexed-db';

// Combined transaction interface (UPI or WiFi)
export interface CombinedTransaction {
  id: string;
  type: 'UPI' | 'WiFi';
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
export class DashboardComponent implements OnInit, OnDestroy{

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
  wifiTransactions: CombinedTransaction[] = [];
  isOnline = navigator.onLine;
  totalTransactions = 0;  

  private onlineListener: any;
  private offlineListener: any;

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

// ------ Method 3: Load ALL transaction (UPI + WiFi) ------
  // shows last 5 transactions history
  private async loadAllTransactions(): Promise<void> {
    console.log('Loading all transactions (UPI + WiFi)...');

    try {
      this.loadingTransactions = true;

      // Load UPI transactions from backend
      await this.loadUPITransactions();

      // Load WiFi transactions from indexedDB
      await this.loadWiFiTransactions();

      this.mergeTransactions();

      // Sort by date
      this.sortTransactions();

      // Total transactions
      this.totalTransactions = this.recentTransactions.length;
      this.upiTransactions = this.recentTransactions.filter(t => t.type === 'UPI');
      this.wifiTransactions = this.recentTransactions.filter(t => t.type === 'WiFi');

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
        const currentUserUpi = (this.userUpiId || localStorage.getItem('upiId') || '').trim().toLowerCase();

        this.transactionService.getTransactionHistory(profileId).subscribe({
          next: (response) => {
            console.log('UPI transactions received: ', response?.length || 0);

            // Transform backend transactions to CombinedTransaction format
            this.upiTransactions = (response || []).map((txn: any) => {
              
              const parsedSender = txn.senderUpiId || (txn.sender && txn.sender.upiId) || txn.from || 'unknown@upi';
              const parsedReceiver = txn.receiverUpiId || (txn.receiver && txn.receiver.upiId) || txn.to || 'unknown@upi';
              const txId = txn.transactionId || txn.id?.toString() || 'UPI_' + Date.now();
              
              // Detect WiFi transactions disguised as UPI
              let txType = 'UPI';
              const rawDesc = (txn.description || txn.notes || '').toLowerCase();
              if (txn.type === 'WIFI' || txn.type === 'WiFi' || rawDesc.includes('wifi') || rawDesc.includes('offline')) {
                txType = 'WiFi';
              }
              
              const safeDate = txn.createdAt || txn.timestamp || txn.date || new Date().toISOString();
              const isReceived = (parsedReceiver || '').trim().toLowerCase() === currentUserUpi;

              return {
                id: txId,
                type: txType as 'UPI' | 'WiFi',
                fromUPI: parsedSender,
                toUPI: parsedReceiver,
                amount: txn.amount || 0,
                description: txn.description || txn.notes || (txType === 'WiFi' ? 'WiFi P2P Payment' : 'UPI Payment'),
                timestamp: new Date(safeDate).getTime() || Date.now(),
                dateTime: this.formatSafeDate(safeDate),
                status: 'completed' as const,
                synced: true,
                source: 'backend' as const,
                direction: isReceived ? 'received' : 'sent'
              };
            });

            resolve();
          }, 
          error: (error) => {
            console.error('Error fetching UPI transactions: ', error);
            this.upiTransactions = [];
            resolve();
          }
        });

        setTimeout(() => resolve(), 5000);
      }
      catch (error) {
        console.error('Error in loadUPITransactions: ', error);
        resolve();
      }
    });
  }

// ------ Method 5: Load WiFi Transactions from IndexedDB ------
  private async loadWiFiTransactions(): Promise<void> {
    try {
      console.log('Fetching WiFi transactions from IndexedDB...');

      // 1. Fetch from the dedicated WiFi tables
      let sentTxns: any[] = [];
      let receivedTxns: any[] = [];
      try { sentTxns = await (this.indexedDbService as any).getAllWIFISentPayments?.() || []; } catch(e) {}
      try { receivedTxns = await (this.indexedDbService as any).getAllWIFIReceivedPayments?.() || []; } catch(e) {}
      
      let offlineTxns = [...sentTxns, ...receivedTxns];

      // 2. Fallback: Check the generic pending table
      if (offlineTxns.length === 0) {
        const pending = await this.indexedDbService.getAllPendingTransactions() || [];
        offlineTxns = pending.filter(txn => 
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

      // 3. Transform to CombinedTransaction format
      this.wifiTransactions = offlineTxns.map(txn => {
        const txnIdStr = txn.transactionId?.toString() || 'WIFI_' + Date.now();
        // Determine direction by checking receiver ID against the logged-in user
        const isReceived = txnIdStr.includes('_RCV_') || txn.receiverUpiId === localStorage.getItem('upiId')?.trim();

        return {
          id: txnIdStr,
          type: 'WiFi' as const, 
          fromUPI: txn.senderUpiId || txn.senderUPI,
          toUPI: txn.receiverUpiId || txn.receiverUPI,
          amount: Number(txn.amount),
          description: txn.description || 'WiFi P2P Payment',
          timestamp: new Date(txn.createdAt || txn.timestamp).getTime() || Date.now(),
          dateTime: this.formatSafeDate(txn.createdAt || txn.timestamp),
          status: ['RECEIVED', 'SENT', 'SYNCED', 'COMPLETED'].includes(txn.status?.toUpperCase()) ? 'completed' : 'pending',
          synced: txn.status !== 'PENDING',
          source: 'indexeddb' as const,
          direction: isReceived ? 'received' : 'sent'
        };
      });

      console.log('WiFi transactions loaded: ', this.wifiTransactions.length);
    }
    catch (error) {
      console.error('Error loading WiFi transactions: ', error);
      this.wifiTransactions = [];
    }
  }
   
// ------ Method 6: Merge UPI + WiFi Transactions ------
  private mergeTransactions(): void {
    console.log('Merging transactions...');
    const merged: any[] = [];

    // 1. Add Backend (UPI/Synced) transactions first.
    merged.push(...this.upiTransactions);

    // 2. Add Local (IndexedDB) transactions
    for (const wifiTxn of this.wifiTransactions) {
      
      // Find if this transaction already synced to the backend
      let existingBackendTxn = merged.find(t => 
        t.id === wifiTxn.id || 
        (t.amount === wifiTxn.amount && t.direction === wifiTxn.direction && Math.abs(t.timestamp - wifiTxn.timestamp) < 5 * 60 * 1000)
      );

      // If it exists in both places, RESCUE THE CUSTOM NOTE!
      if (existingBackendTxn) {
        const hasLocalCustomNote = wifiTxn.description && wifiTxn.description.trim() !== '' && wifiTxn.description !== 'WiFi P2P Payment';

        console.log(`🔍 Checking TXN ${wifiTxn.id} | Local Note: "${wifiTxn.description}" | Backend Note: "${existingBackendTxn.description}"`);

        const backendLostNote = !existingBackendTxn.description || existingBackendTxn.description === 'WiFi P2P Payment' || existingBackendTxn.description.includes('settled');

        if (hasLocalCustomNote && backendLostNote) {
           console.log(`📝 Rescuing custom note for TXN: ${wifiTxn.description}`);
           existingBackendTxn.description = wifiTxn.description; 
        }
      } 
      // If it is completely new (offline only), add it normally
      else {
        merged.push(wifiTxn);
      }
    }

    this.recentTransactions = merged;
    console.log('Merged total: ', this.recentTransactions.length);
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
    this.onlineListener = () => {
      console.log('Connection restored');
      this.isOnline = true;
      this.cdr.detectChanges();
    };

    this.offlineListener = () => {
      console.log('Connection lost');
      this.isOnline = false;
      this.cdr.detectChanges();
    };

    window.addEventListener('online', this.onlineListener);
    window.addEventListener('offline', this.offlineListener);
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
  goToWiFiPayment(): void {
    console.log('Navigating to Bluetooth Payment...');
    this.router.navigate(['/wifi-role-selection']);
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
      const status = transaction.status?.toUpperCase();
  
      if (status === 'FAILED') return '❌';
      if (status === 'PENDING') return '⏳';
  
      const isReceived = transaction.direction === 'received' || transaction.toUPI === this.userUpiId;
  
      // 👉 points in for Received, 👈 points out for Sent
      return isReceived ? '👉' : '👈';
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
      // WiFi
      const otherUPI = transaction.fromUPI === this.userUpiId ? transaction.toUPI : transaction.fromUPI;
      const direction = transaction.direction === 'sent' ? 'to' : 'from';
      const name = this.extractName(otherUPI);
      return `${direction} ${name}`;
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

  ngOnDestroy(): void {
    if (this.onlineListener) {
      window.removeEventListener('online', this.onlineListener);
    }

    if (this.offlineListener) {
      window.removeEventListener('offline', this.offlineListener);
    }
  }

// ------ Helper Method: Safe Data formatter  ------  
  private formatSafeDate(dateVal: any): string {
    if (!dateVal) return 'Recently';
    try {
      const d = new Date(dateVal);
      // Check if it's an invalid date 
      if (isNaN(d.getTime())) return 'Recently'; 
      
      // Format to a clean "12 Sep, 02:30 PM" format
      return d.toLocaleString('en-IN', { 
        day: 'numeric', 
        month: 'short', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch (e) {
      return 'Recently';
    }
  }
}
