import { Component, OnInit } from '@angular/core';
import { UserService } from '../../services/user';
import { TransactionService } from '../../services/transaction';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';

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
  walletBalance: number = 0;
  profileId: number | null = null;
  loadingBalance = true;
  loadingTransactions = false;
  recentTransactions: any[] = [];    // last 5 transactions
  errorMessage = '';

  constructor(private userService: UserService, private transactionService: TransactionService, private router: Router) {}

  ngOnInit(): void {
    console.log('DashboardComponent initialized');

    this.loadUserInfo();
    this.loadWalletBalance();
    this.loadRecentTransactions();
  }
 
// ------ Method 1: Load user info ------
  private loadUserInfo(): void {
    console.log('Loading user info...');

    this.userName = this.userService.getUserNameFromStorage();
    this.userUpiId = this.userService.getUpiIdFromStorage();
    this.userEmail = localStorage.getItem('email');
    this.profileId = this.userService.getProfileIdFromStorage();

    console.log('User info loaded');
    console.log('Name: ', this.userEmail);
    console.log('UPI: ', this.userUpiId);
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

    this.userService.getBalance(this.profileId).subscribe({
      next: (response) => {
        if (response.success) {
          this.walletBalance = response.balance;
          console.log('Balance loaded: ₹' + this.walletBalance);
        }
        this.loadingBalance = false;
      },

      error: (error) => {
        console.log('Error loading balance: ', error);
        this.loadingBalance = false;
        this.errorMessage = 'Failed to load wallet balance.';
      }
    });
  }  

// ------ Method 3: Load recent transaction ------
  // shows last 5 transactions history
  private loadRecentTransactions(): void {
    console.log('Loading recent transactions...');

    this.loadingTransactions = false;

    // Mock data (replace with API call)
    this.recentTransactions = [
      {
        transactionId: 'TXN_001',
        senderUpiId: this.userUpiId || 'unknown',
        receiverUpiId: 'receiver@upi',
        amount: 500,
        status: 'SUCCESS',
        createdAt: new Date(Date.now() -1*24*60 * 60 * 1000).toLocaleString(),
        description: 'Payment for food'
      },
      {
        transactionId: 'TXN_002',
        senderUpiId: 'sender@upi',
        receiverUpiId: this.userUpiId || 'unknown',
        amount: 1000,
        status: 'SUCCESS',
        createdAt: new Date(Date.now() -3*24*60 * 60 * 1000).toLocaleString(),
        description: 'Salary received'
      }
    ];

    console.log('Recent transaction loaded: ', this.recentTransactions.length);
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
     return '👈';  // Money in
   }
   else {
     return '👉';  // Money out
   }
  } 

// ------ Method 9: Refresh all dashboard data ------
  refreshDashboard(): void {
    console.log('Refreshing dashboard...');
    this.loadWalletBalance();
    this.loadRecentTransactions();
  }
}
