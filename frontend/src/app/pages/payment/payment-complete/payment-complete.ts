import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { TransactionService } from '../../../services/transaction';
import { UserService } from '../../../services/user';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { EncryptionService } from '../../../services/encryption';
import { IndexedDbService } from '../../../services/indexed-db';

@Component({
  selector: 'app-payment-complete',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './payment-complete.html',
  styleUrl: './payment-complete.css',
})

// Purpose: Encrypt and complete payment
export class PaymentCompleteComponent implements OnInit{

  //properties
  transactionData: any = null;
  encryptedData: string | null = null;
  loading = false;
  encryptingData = false;
  paymentConfirmed = false;
  errorMessage = '';
  successMessage = '';

  /** Current step
   * 1 = Review transaction
   * 2 = Encrypt data
   * 3 = Confirm payment
   * 4 = Processing
   * 5 = Success/Failure
  */
  currentStep = 1;
  
  constructor(private trasactionServie: TransactionService, private userService: UserService, private router: Router, private encryptionService: EncryptionService, private cdr: ChangeDetectorRef, private indexedDbService: IndexedDbService) {}

  ngOnInit(): void {
    console.log('PaymentCompleteComponent initialized');

    this.loadTransactionData();
    this.prepareEncryption();
  }

// ------ Method 1: Load transaction data ------
  private loadTransactionData(): void {
    console.log('Loading transaction data from sessionStorage...');

    const data = sessionStorage.getItem('transactionData');

    if (!data) {
      console.error('No transaction data found');
      this.errorMessage = 'No active transaction. Please initate payment first.';
      return;
    }

    try {
      this.transactionData = JSON.parse(data);
      console.log('Transaction data loaded');
      console.log('Transaction ID: ', this.transactionData.transactionId);
    }
    catch(error) {
      console.error('Error parsing transaction data: ', error);
      this.errorMessage = 'Invalid transaction data.';
    }
  } 

// ------ Method 2: Prepare Encryption ------
  private prepareEncryption(): void {
    console.log('Preparing for encryption...');

    if(!this.transactionData) {
      return;
    }
 
    console.log('Ready for encryption');

    this.currentStep = 2;
  }  

// ------ Method 3: Encrypt payment data ------
  // Encrypt payment data before sending to server
  async encryptPaymentData(): Promise<void> {
    console.log('Encrypting payment data...');

    if(!this.transactionData) {
      this.errorMessage = 'Transaction data not loading';
      return;
    }

    if(!this.transactionData.publicKey) {
      this.errorMessage = 'Public key not found';
      return;
    }

    console.log(
  'Frontend Public Key:',
  this.transactionData.publicKey.substring(0, 80)
);

    this.encryptingData = true;
    this.errorMessage = '';

    try {
      // Step 1: Prepare payment data object
      const paymentData = {
        senderUpiId: this.transactionData.senderUpiId,
        receiverUpiId: this.transactionData.receiverUpiId,
        amount: this.transactionData.amount,
        transactionId: this.transactionData.transactionId,
        timestamp: new Date().toISOString()
      };

      console.log('Payment data prepared: ',paymentData);

      // Step 2: Call EncryptionService to encrypt
      this.encryptedData = await this.encryptionService.encryptPayment(this.transactionData.publicKey, paymentData);

      console.log('Payment encrypted successfully');
      console.log('Encrypted string ready to send');
      console.log('Length: ', this.encryptedData.length, 'characters');

      this.encryptingData = false;
      this.currentStep = 3;    // Move to confirmation step
    }
    catch (error) {
      console.log('Encryption failed: ', error);
      this.encryptingData = false;
      this.errorMessage = 'Failed to encrypt payment data. Please try again.';
    }
  }
  
// ------ Method 4: Confirm and Complete payment ------
  completePayment(): void {
    if(!this.paymentConfirmed) {
      this.errorMessage = 'Please confirm payment';
      return;
    }

    if(!this.encryptedData) {
      this.errorMessage = 'Payment data not encrypted';
      return;
    }

    console.log('Completing payment...');
    console.log('Sending encrypted data to backend');

    // DEBUG: Log what we're sending 
    console.log("==== Encrypted Data Details ====");
    console.log('Format: RSA-key,AES-data,hash');
    console.log('Total length: ',this.encryptedData.length);

    // Split to see parts
    const parts = this.encryptedData.split(',');
    console.log('Part 1 (RSA-key) length:', parts[0]?.length);
    console.log('Part 2 (AES-data) length:', parts[1]?.length);
    console.log('Part 3 (hash) length:', parts[2]?.length);
    console.log('First 100 chars:', this.encryptedData.substring(0, 100));
    console.log('================================');

    this.loading = true;
    this.errorMessage = '';
    this.currentStep = 4;

    this.trasactionServie.completeTransaction({
      transactionId: this.transactionData.transactionId,
      encryptedData: this.encryptedData
    }).subscribe({

      // Success

      next: (response) => {

        if(response.success && response.status === 'SUCCESS') {
          console.log('Payment completed successfully');
          console.log('Sender balance: ', response.senderNewBalance);
          console.log('Receiver balance: ', response.receiverNewBalance);

          this.loading = false;
          this.currentStep = 5;
          this.successMessage = response.message;

          this.userService.triggerBalanceRefresh();

          // Redirect to dashboard after 3 seconds
          setTimeout(() => {
            // Clear sessionStorage
            sessionStorage.removeItem('transactionData');

            // Redirect
            this.router.navigate(['/dashboard']);
          }, 3000);
        }
        else{
          console.warn('Payment failed: ', response.message);
          this.loading = false;
          this.currentStep = 5;
          this.errorMessage = response.message || 'Payment failed. Please try again.'

          this.cdr.detectChanges();
        }
      },

      // Error
      error: async (error) => {
        console.error('Error completing payment: ', error);
        this.loading = false;
        this.currentStep = 5;

        if (!this.encryptedData) {
          this.errorMessage = 'Encrypted payment data missing. Cannot save offline transaction.';
          this.cdr.detectChanges();
          return;
        }

        // Save to IndexedDB only when APi/Backend fails
        await this.indexedDbService.savePendingTransaction({
          transactionId: this.transactionData.transactionId,
          senderUpiId: this.transactionData.senderUpiId,
          receiverUpiId: this.transactionData.receiverUpiId,
          amount: this.transactionData.amount,
          description: this.transactionData.description,
          encryptedData: this.encryptedData,
          type: 'UPI',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          retryCount: 0
        });

        this.errorMessage = error.error?.message || 'Failed to complete payment. Please try again.';

        this.cdr.detectChanges();
      }
    });
  }  

// ------ Method 5: Toggle confirmation ------
  // Toggle payment confirmation checkbox
  toggleConfirmation(): void {
    this.paymentConfirmed = !this.paymentConfirmed;
  }  

// ------ Method 6: Cancel payment ------
  cancelPayment(): void {
    console.log('Payment cancelled');
    sessionStorage.removeItem('transactionData');
    this.router.navigate(['/payment/initiate']);
  }
  
// ------ Method 7: Format currency ------
  formatCurrency(amount: number): string {
    if (amount === null || amount === undefined) {
      return '₹0.00';
    }
    return '₹' +amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }  

// ------ Method 8: Format DateTime ------
  formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString();
  }  
}
