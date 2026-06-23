import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { UserService } from '../../services/user';
import { TransactionService } from '../../services/transaction';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IndexedDbService } from '../../services/indexed-db';

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
  recentTransactions: any[] = [];    // last 5 transactions
  errorMessage = '';

  constructor(private userService: UserService, private transactionService: TransactionService, private router: Router, private cdr: ChangeDetectorRef, private indexedDbService: IndexedDbService) {}

   async ngOnInit(): Promise<void> {
    console.log('DashboardComponent initialized');

   /* await this.indexedDbService.openDb();
    await this.indexedDbService.savePendingTransaction({
    transactionId: 'TEST_' + Date.now(),
    senderUpiId: 'kunal@upi',
    receiverUpiId: 'raj@upi',
    amount: 100,
    description: 'Test offline transaction',
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    retryCount: 0
  }); */

    const transactions = await this.indexedDbService.getAllPendingTransactions();
    console.log(transactions)
    this.loadUserInfo();
    this.loadWalletBalance();
    this.loadRecentTransactions();
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

// ------ Method 3: Load recent transaction ------
  // shows last 3 transactions history
  private loadRecentTransactions(): void {
    console.log('Loading transactions...');

    const profileIdValue = localStorage.getItem('profileId');

    if (!profileIdValue) {
      this.recentTransactions = [];
      this.loadingTransactions = false;
      this.errorMessage = 'Profile not found. Please login again.';
      this.cdr.detectChanges();
      return;
    }

    const profileId = Number(profileIdValue);
    this.loadingTransactions = true;

    this.transactionService.getTransactionHistory(profileId).subscribe({
      next: (response) => {
        this.recentTransactions = response.slice(0, 3);
        this.loadingTransactions = false;
        console.log('Transaction history loaded: ', response);

        this.cdr.detectChanges(); 
      },

      error: (error) => {
        console.error('Error loading transaction history: ', error);
        this.recentTransactions = [];
        this.loadingTransactions = false;
        this.errorMessage = 'Failed to load transaction history.';

        this.cdr.detectChanges();
      }
    });
  }  

// ------ Method 4: Navigate to send money ------
  goToSendMoney(): void {
    console.log('Navigating to send money...');
    this.router.navigate(['/payment/initiate']);
  }

// ------ Method 5: Navigate to history ------
  goToHistory(): void {
    console.log('Navigating to transaction history...');
    this.router.navigate(['/transactions']);
  }  

// ------ Method 6: Format currency ------
  formatCurrency(amount: number | null): string {
    if(amount === null || amount === undefined) {
      return '₹0.00';
    }

    return '₹' + amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

// ------ Method 7: Get transaction status color ------
  getStatusBadgeClass(status: string): string {

   switch(status?.toUpperCase()) {
     case 'SUCCESS':
       return 'bg-green-100 text-green-800';
     case 'PENDING':
       return 'bg-yellow-100 text-yellow-800';
     case 'FAILED':
       return 'bg-red-100 text-red-800';
     default: 
       return 'bg-gray-100 text-gray-800';      
   }
  }

// ------ Method 8: Get transaction icon ------
  // Get emoji icon based on transaction type
  getTransactionIcon(transaction: any): string {
   if(transaction.receiverUpiId === this.userUpiId) {
     return '👉';  // Money in
   }
   else {
     return '👈';  // Money out
   }
  } 

// ------ Method 9: Refresh all dashboard data ------
  refreshDashboard(): void {
    console.log('Refreshing dashboard...');
    this.loadWalletBalance();
    this.loadRecentTransactions();
  }
}
