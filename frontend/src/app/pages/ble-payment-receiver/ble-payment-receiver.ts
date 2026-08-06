import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ReceiverService } from '../../services/receiver';
import { UserService } from '../../services/user';
import { IndexedDbService, PendingTransaction } from '../../services/indexed-db';
import { BLETransaction } from '../../model/ble-transaction';

// Combined format for display
export interface DisplayedReceivedPayment {
  id: string;
  senderUPI: string;
  amount: number;
  timestamp: number;
  dateTime: string;
  status: 'SYNCED' | 'SYNCING' | 'SYNCED_BACKEND' | 'FAILED';
  statusLabel: string;
}

@Component({
  selector: 'app-ble-payment-receiver',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './ble-payment-receiver.html',
  styleUrl: './ble-payment-receiver.css',
})
export class BlePaymentReceiverComponent implements OnInit, OnDestroy{

  // Properties :
  isListening = false;
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  userUpiId: string | null = null;
  username: string | null = null;
  walletBalance: number | null = null;
  profileId: number | null = null;

  // Received payments list
  receivedPayments: DisplayedReceivedPayment[] = [];
  loadingPayments = false;
  paymentStats = {
    totalReceived: 0,
    totalAmount: 0,
    pendingSync: 0
  };

  // For unsubscribing
  private destroy$ = new Subject<void>();

  constructor(private receiverService: ReceiverService, private userService: UserService, private indexedDbService: IndexedDbService, private router: Router, private cdr: ChangeDetectorRef ) {}

  async ngOnInit(): Promise<void> {
    console.log('BlePaymentReceiverComponent initialized');

    try {
      await this.indexedDbService.openDb();
      console.log('IndexedDB initialized');
    }
    catch(error) {
      console.error('IndexedDB error: ', error);
      this.errorMessage = 'Failed to initialize local storage';
    }

    this.loadUserInfo();
    await this.loadReceivedPayments();
    this.setupListeners();
  }

  ngOnDestroy(): void {
    console.log('ReceiverModeComponent destroyed');

    // Stop listening if active
    if (this.isListening) {
      this.stopReceiving();
    }

    // Unsubscribe all
    this.destroy$.next();
    this.destroy$.complete();
  }

// ------ Method 1: Load user info ------  
  private loadUserInfo(): void {
    console.log('Loading user info for receiver mode...');

    this.userUpiId = this.userService.getUpiIdFromStorage();
    this.username = this.userService.getUserNameFromStorage();
    this.profileId = this.userService.getProfileIdFromStorage();

    if (!this.userUpiId) {
      console.error('No UPI ID found');
      this.errorMessage = 'No UPI ID found. Please setup your profile.';
    }

    console.log('User info loaded: ', this.userUpiId);
  }

// ------ Method 2: Start receiving payments ------  
  startReceiving(): void {
    console.log('Starting to receive payments...');

    if (!this.userUpiId) {
      this.errorMessage = 'No UPI ID found. Cannot start receiver.';
      return;
    }

    if (this.isListening) {
      this.errorMessage = 'Already listening for payments';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.receiverService.startReceiving(this.userUpiId).subscribe({
      next: (response) => {
        console.log('Receiver started successfully: ', response);

        if (response.success) {
          this.isListening = true;
          this.successMessage = '✅ Listening for payments! Your phone is visible to nearby senders.';

          // Clear error
          this.errorMessage = '';
        }
        else {
          this.errorMessage = response.message || 'Failed to start receiver';
          this.isListening = false;
        }

        this.isLoading = false;
        this.cdr.detectChanges();
      },

      error: (error) => {
        console.error('Error starting receiver: ', error);
        this.errorMessage = error?.message || 'Failed to start listening for payments';
        this.isListening = false;
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }  

// ------ Method 3: Stop receiving payments ------
  stopReceiving(): void {
    console.log('Stopping receiver mode...');

    if (!this.isListening) {
      this.errorMessage = 'Not currently listening';
      return;
    }

    this.isLoading = true;
    this.successMessage = '';

    this.receiverService.stopReceiving().subscribe({
      next: (response) => {
        console.log('Receiver stopped: ', response);

        if (response.success) {
          this.isListening = false;
          this.successMessage = '⏹️ Stopped listening for payments.';
          this.errorMessage = '';
        }
        else {
          this.errorMessage = response.message || 'Failed to stop receiver';
        }

        this.isLoading = false;
        this.cdr.detectChanges();
      },

      error: (error) => {
        console.error('Error stopping receiver: ', error);
        this.errorMessage = error?.message || 'Failed to stop listening';
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }  

// ------ Method 4: Setup Listeners from ReceiverService ------
  private setupListeners(): void {
    console.log('Setting up listeners...');

    // Listen for payment received events
    this.receiverService.paymentReceived$.pipe(
      takeUntil(this.destroy$)).subscribe({
        next: (transaction: BLETransaction) => {
          console.log('Payment received event: ', transaction);

          this.onPaymentReceived(transaction);
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error in payment received listener: ', error);
        }
      });

    // Listen for receiver status changes  
    this.receiverService.receiverStatus$.pipe(
      takeUntil(this.destroy$)).subscribe({
        next: (status) => {
          console.log('Receiver status: ', status);
          this.successMessage = status.message;
          this.cdr.detectChanges();
        }, 
        error: (error) => {
          console.error('Error in status listener: ', error);
        }
      });  

    // Listen for receiver error
    this.receiverService.receiverError$.pipe(
      takeUntil(this.destroy$)).subscribe({
        next: (error) => {
          console.error('Receiver error: ', error);
          this.errorMessage = error;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error in error listener: ', err);
        }
      });
  }

// ------ Method 5: Handle Payment received ------
  private async onPaymentReceived(transaction: BLETransaction): Promise<void> {
    console.log('Processing received payment...');

    try {
      // Save to IndexedDB
      const pendingTransaction: PendingTransaction = {
        transactionId: transaction.id,
        senderUpiId: transaction.senderUPI,
        receiverUpiId: transaction.receiverUPI,
        amount: transaction.amount,
        encryptedData: transaction.encryptedPayload,
        status: 'PENDING',  // Pending sync to backend
        createdAt: new Date(transaction.timestamp).toISOString(),
        retryCount: 0,
        type: 'BLE',
        nonce: transaction.nonce,
        signature: transaction.signature,
        payloadVersion: transaction.payloadVersion,
        source: 'RECEIVED',
        isOffline: true
      };

      const dbId = await this.indexedDbService.saveBLEReceivedPayment(pendingTransaction);
      console.log('Payment saved to IndexedDB with ID: ', dbId);

      // Show success
      this.successMessage = `✅ Received ₹${transaction.amount} from ${transaction.senderUPI}`;

      // Reload received payments list
      await this.loadReceivedPayments();

      // Auto hides success message after 3 seconds
      setTimeout(() => {
        this.successMessage = '';
        this.cdr.detectChanges();
      }, 3000);
    }
    catch (error) {
      console.error('Error processing received payment: ', error);
      this.errorMessage = 'Failed to save paymen. Please try again.';
    }
  }  

// ------ Method 6: Load received payments from IndexedDB ------
  private async loadReceivedPayments(): Promise<void> {
    console.log('Loading received payments...');

    try {
      this.loadingPayments = true;

      // Get all BLE received payments from IndexedDB
      const payments = await this.indexedDbService.getAllBLEReceivedPayments();
      console.log('Received payments fetched: ', payments);

      // Transform to display format
      this.receivedPayments = payments.map(payment => ({
        id: payment.transactionId,
        senderUPI: payment.senderUpiId,
        amount: payment.amount,
        timestamp: new Date(payment.createdAt).getTime(),
        dateTime: new Date(payment.createdAt).toLocaleString('en-IN'),
        status: (payment.status as any) || 'SYNCED',
        statusLabel: this.getStatusLabel(payment.status)
      }));

      // Sort by date (newest first)
      this.receivedPayments.sort((a, b) => b.timestamp - a.timestamp);

      // Calculate stats
      await this.calculateStats();

      this.loadingPayments = false;
      console.log('Received payments loaded: ', this.receivedPayments.length);
    }  
    catch (error) {
      console.error('Error loading received payments: ', error);
      this.errorMessage = 'Failed to laod received payments';
      this.loadingPayments = false;
    }
  }

// ------ Method 7: Calculate Statistics ------
  private async calculateStats(): Promise<void> {
    console.log('Calculating statistics...');

    try {
      const stats = await this.indexedDbService.getBLEStatistics();

      this.paymentStats.totalReceived = stats.received;
      this.paymentStats.totalAmount = this.receivedPayments.reduce(
        (sum, payment) => sum + payment.amount, 0);

      this.paymentStats.pendingSync = stats.pendingSync;
      console.log('Statistics calculated: ', this.paymentStats);  
    }
    catch (error) {
      console.error('Error calculating stats: ', error);
    }
  }  

// ------ Method 8: Get Status Label ------
  private getStatusLabel(status: string): string {
    switch (status) {
      case 'PENDING':
        return 'Pending Sync';
      case 'SYNCING':
        return 'Syncing...';
      case 'SYNCED':
      case 'OFFLINE_SYNCED':
        return 'Offline Confirmed';
      case 'SYNCED_BACKEND':
        return 'Synced ✓';
      case 'FAILED':
        return 'Failed';
      default:
        return 'Pending';        
    }
  }  

// ------ Method 9: Get Status Badge color ------
  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'OFFLINE_SYNCED':
      case 'SYNCED':
      case 'SYNCED_BACKEND':
        return 'bg-green-100 text-green-800';
      case 'SYNCING':
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'FAILED':
        return 'bg-red-100 text-red-800';
      default: 
        return 'bg-gray-100 text-gray-800';            
    }
  }  

// ------ Method 10: Format Currency ------ 
  formatCurrency(amount: number): string {
    return '₹' + amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  } 

// ------ Method 11: Extract Name from UPI ------
  extractName(upi: string): string {
    if (!upi) return 'Unknown';
    const name = upi.split('@')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }  

// ------ Method 12: Go Back to dashboard ------
  goBackToDashboard(): void {
    console.log('Navigating back to dashboard...');

    // Stop receiving before navigating away
    if (this.isListening) {
      this.stopReceiving();
    }

    this.router.navigate(['/dashboard']);
  }  

// ------ Method 13: Refresh received payments ------
  async refreshPayments(): Promise<void> {
    console.log('Refreshing payments...');
    await this.loadReceivedPayments();
  }  

// ------ Method 14: Clear All Synced payments ------
  async clearSyncedPayments(): Promise<void> {
    console.log('Clearing synced payments...');

    if (confirm('Clear all synced payments? This cannot be undone.')) {
      try {
        await this.indexedDbService.clearBLESyncedPayments();
        this.successMessage = '✅ Synced payments cleared';
        await this.loadReceivedPayments();
      }
      catch (error) {
        console.error('Error clearing payments: ', error);
        this.errorMessage = 'Failed to clear payments';
      }
    }
  }  

// ------ Method 15: Get receiver status text ------
  getReceiverStatusText(): string {
    if (this.isListening) {
      return '🟢 Listening for payments...';
    }
    else if (this.isLoading) {
      return '⏳ Loading...';
    }
    else {
      return '🔴 Not listening';
    }
  }  
}
