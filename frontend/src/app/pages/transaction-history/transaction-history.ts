import { Component, OnInit } from '@angular/core';
import { UserService } from '../../services/user';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TransactionService } from '../../services/transaction';

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
  allTransactions: any[] = [];
  filteredTransactions: any[] = [];
  userUpiId: string | null = null;
  // Filters:- "all" | "success" | "pending" | "lowest"
  selectedFilter = 'all'; 
  sortOrder = 'latest';
  loading = false;
  selectedTransaction: any = null;
  showModal = false;
  errorMessage = '';

  constructor(private userService: UserService, private transactionService: TransactionService) {}

  ngOnInit(): void {
    console.log('TransactionHistoryComponent initialized');
    this.userUpiId = localStorage.getItem('upiId');
    console.log('Current User upi: ', this.userUpiId);

    this.loadUserInfo();
    this.loadTransactions();
  }

// ------ Method 1: Load user info ------
  private loadUserInfo(): void {
    this.userUpiId = this.userService.getUpiIdFromStorage();
  }  

// ------ Method 2: Load Transactions History ------
  private loadTransactions(): void {
    console.log('Loading transactions...');

    const profileIdValue = localStorage.getItem('profileId');

    if (!profileIdValue) {
      this.errorMessage = 'Profile not found. Please login again.';
      return;
    }

    const profileId = Number(profileIdValue);
    this.loading = true;

    this.transactionService.getTransactionHistory(profileId).subscribe({
      next: (response) => {
        this.allTransactions = response;
        this.filterTransactions();
        this.loading = false;
        console.log('Transaction history loaded: ', response);
      },

      error: (error) => {
        console.error('Error loading transaction history: ', error);
        this.loading = false;
        this.errorMessage = 'Failed to load transaction history.';
      }
    });
  }  

// ------ Method 3: Filter Transactions ------
  filterTransactions(): void {

    // Filter by status
    let filtered = this.allTransactions;

    if(this.selectedFilter !== 'all') {
      filtered = filtered.filter(t => t.status.toLowerCase() === this.selectedFilter);
    }

    // Sort
    filtered = [...filtered];

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

// ------ Method 4: Update Filter ------
  updateFilter(filter: string): void {
    this.selectedFilter = filter;
    this.filterTransactions();
  }

// ------ Method 5: Update sort ------
  updateSort(order: string): void {
    this.sortOrder = order;
    this.filterTransactions();
  }

// ------ Method 6: Open Modal ------ 
  openTransactionDetail(transaction: any): void {
    this.selectedTransaction = transaction;
    this.showModal = true;
  }  

// ------ Method 7: Close Modal ------
  closeModal(): void {
    this.showModal = false;
    this.selectedTransaction = null;
  }  

// ------ Helper Methods ------

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

  private normalizeUpi(upi: string | null | undefined): string {
    return (upi || '').trim().toLowerCase();
  }

  isReceived(transaction: any): boolean {
    return this.normalizeUpi(transaction.receiverUpiId) === this.normalizeUpi(this.userUpiId);
  }

  getTransactionIcon(transaction: any): string {
    const status = transaction.status?.toUpperCase();

    if (status === 'FAILED') return '❌';
    if (status === 'PENDING') return '⏳';

    return this.isReceived(transaction) ? '👉' : '👈';
  }

  getTransactionType(transaction: any): string {
    return this.isReceived(transaction) ? 'Received' : 'Sent';
  }

  formatCurrency(amount: number): string {
    return '₹' + amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  getAmountClass(txn: any): string {
    if (txn.status?.toUpperCase() === 'FAILED') {
      return 'text-red-500';
    }
    if (txn.status?.toUpperCase() === 'PENDING') {
      return 'text-yellow-500';
    }

    return txn.senderUpiId === this.userUpiId ? 'text-red-600' : 
    'text-green-600';

  } 

  getAmountPrefix(txn: any): string {
    if (txn.status?.toUpperCase() === 'FAILED') {
      return '✖ ';
    }
    if (txn.status?.toUpperCase() === 'PENDING') {
      return '⏳ ';
    }

    return txn.senderUpiId === this.userUpiId ? '-' : '+';
  }
}
