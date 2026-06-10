import { Component, OnInit } from '@angular/core';
import { TransactionService } from '../../../services/transaction';
import { UserService } from '../../../services/user';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';


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
  
  constructor(private trasactionServie: TransactionService, private userService: UserService, private router: Router) {}

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

    // TODO: Call EncryptionService when available 
    console.log('Ready for encryption');
  }  

// ------ Method 3: Encrypt payment data ------
  // Encrypt payment data before sending to server
  encryptPaymentData(): void {
    console.log('Encrypting payment data...');

    this.encryptingData = true;
    this.errorMessage = '';

    // TODO: Call EncryptionService

    // For now, using placeholder
    setTimeout(() => {
      // Mock encrypted data
      this.encryptedData = 'RSA_ENCRYPTED_KEY.AES_ENCRYPTED_DATA,SHA256_HASH';

      this.encryptingData = false;
      this.currentStep = 3;

      console.log('Payment data encrypted');
    }, 2000);
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
        }
      },

      // Error
      error: (error) => {
        console.error('Error completing payment: ', error);
        this.loading = false;
        this.currentStep = 5;
        this.errorMessage = error.error?.message || 'Failed to complete payment. Please try again.';
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
