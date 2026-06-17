import { Component, OnInit } from '@angular/core';
import { UserService } from '../../services/user';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

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

  constructor(private userService: UserService) {}

  ngOnInit(): void {
    console.log('TransactionHistoryComponent initialized');

    this.loadUserInfo();
    this.loadTransactions();
  }

// ------ Method 1: Load user info ------
  private loadUserInfo(): void {
    this.userUpiId = this.userService.getUpiIdFromStorage();
  }  

// ------ Method 2: Load Transactions ------
  private loadTransactions(): void {
    console.log('Loading transactions...');

    this.loading = true;

    // TODO: Call API 
    // this.transactionService.getTransactions()

    // Mock data for now
    setTimeout(() => {
      this.allTransactions = [
        {
          transactionId: 'TXN_001',
          senderUpiId: this.userUpiId,
          receiverUpiId: 'alice@upi',
          amount: 500,
          status: 'SUCCESS',
          description: 'Food payment',
          createdAt: new Date(Date.now() -1*24*60*60*1000).toLocaleString()
        },
        {
          trasactionId: 'TXN_002',
          senderUpiId: 'ram@upi',
          receiverUpiId: this.userUpiId,
          amount: 1000,
          status: 'SUCCESS',
          description: 'Salary',
          createdAt: new Date(Date.now() -3*24*60*60*1000).toLocaleString()
        },
        {
          trasactionId: 'TXN_003',
          senderUpiId: this.userUpiId,
          receiverUpiId: 'charlie@upi',
          amount: 500,
          status: 'FAILED',
          description: 'Loan repayment',
          createdAt: new Date(Date.now() -5 * 60 *1000).toLocaleString()
        }
      ];

      this.filterTransactions();
      this.loading = false;

      console.log('Transactions loaded: ', this.allTransactions.length);
    }, 1000);
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

  getTransactionIcon(transaction: any): string {
    if (transaction.receiverUpiId === this.userUpiId) {
      return '👈';
    }
    else {
      return '👉';
    }
  }

  getTransactionType(transaction: any): string {
    if (transaction.receiverUpiId === this.userUpiId) {
      return 'Received';
    }
    else {
      return 'Sent';
    }
  }

  formatCurrency(amount: number): string {
    return '₹' + amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
}
