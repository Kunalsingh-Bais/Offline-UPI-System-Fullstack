import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators, } from '@angular/forms';
import { UserService } from '../../../services/user';
import { TransactionService } from '../../../services/transaction';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-payment-initiate',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule],
  templateUrl: './payment-initiate.html',
  styleUrl: './payment-initiate.css',
})
export class PaymentInitiateComponent implements OnInit {
  
  // Properties 
  paymentForm!: FormGroup;
  senderProfileId: number | null = null;
  senderUpiId: string | null = null;
  receiverDetails: any = null;         // Receiver's details after search
  loading = false;
  submitted = false;
  errorMessage = '';
  successMessage = '';

  /**
   * Step in payment process
   * 1 = Search receiver
   * 2 = Enter amount
   * 3 = Review & confirm
   */
  currentStep = 1;   
  
  constructor(private formBuilder: FormBuilder, private userService: UserService,private transactionService: TransactionService,private router: Router, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    console.log('PaymentInitiateComponent initialized');

    this.loadSenderInfo();
    this.initializeForm();
  }

// ------ Method 1: Load sender info ------
  private loadSenderInfo(): void {
    console.log('Loading sender info...');

    this.senderUpiId = localStorage.getItem('upiId');
    const profileIdvalue = localStorage.getItem('profileId');

    this.senderProfileId = profileIdvalue ? Number(profileIdvalue) : null; 

    console.log('Sender UPI:', this.senderUpiId);
    console.log('Profile ID:', this.senderProfileId);

    if (!this.senderUpiId || !this.senderProfileId) {
      console.log('Sender info not found');
      this.errorMessage = 'Unable to load your profile. Please login again.';
    }

    console.log('Sender info loaded: ', this.senderUpiId);
  }  

// ------ Method 2: Initialize form ------
  // Create payment form with validators
  private initializeForm(): void {
    this.paymentForm = this.formBuilder.group({

      receiverUpiId: ['',[Validators.required, Validators.pattern(/^[a-zA-Z0-9._-]+@upi$/)
      ]],

      amount: ['', [Validators.required, Validators.min(1),Validators.max(100000)
      ]],
      
      description: ['', [Validators.maxLength(500)]]
    });

    console.log('Payment form initialized');
  }  

// ------ Method 3: Search Receiver ------
  // Search for receiver by UPI ID
  searchReceiver(): void {
    const receiverUpiId = this.paymentForm.get('receiverUpiId')?.value?.trim();

    if(!receiverUpiId) {
      this.errorMessage = 'Please enter receiver UPI ID';
      return;
    }

    // Check if trying to send to self
    if (receiverUpiId === this.senderUpiId) {
      this.errorMessage = 'Cannot send money to yourself';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.receiverDetails = null;

    console.log('Searching for receiver: ', receiverUpiId);

    this.userService.getProfileByUpiId(receiverUpiId).subscribe({
      next:(response: any) => {
        console.log('Receiver response: ', response);

        if (response && (response.success || response.profileId || response.upiId)) {

          this.receiverDetails = {
            profileId: response.profileId || response.id,
            name: response.name || response.userName || receiverUpiId,
            upiId: response.upiId || receiverUpiId
          };

          this.loading = false;
          this.currentStep = 2;
          console.log('Receiver found: ', this.receiverDetails);
          
          this.cdr.detectChanges();
        }
        else {
          console.warn('Receiver not found');
          this.errorMessage = 'No user found with UPI ID: ' +receiverUpiId;
        }

        this.loading = false;
      },

      error: (error: any) => {
        console.error('Error searching receiver: ', error);
        this.loading = false;
        this.receiverDetails = null;
        
        if(error.status === 404) {
          this.errorMessage = 'No user found with UPI ID: ' + receiverUpiId;
        }
        else {
          this.errorMessage = 'Error searching receiver. Please try again.';
        }
      }
    });
  }  

// ------ Method 4: Handle Payment submission ------
  onSubmit(): void {
    this.submitted = true;
    console.log('Initiating payment...');

    // Validate form
    if (this.paymentForm.invalid) {
      console.warn('⚠️ Form validation failed');
      return;
    }

    // Check receiver details
    if (!this.receiverDetails) {
      this.errorMessage = 'Please search for receiver first';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const { receiverUpiId, amount, description } = this.paymentForm.value;

    // Call initate transaction API
    this.transactionService.initiateTransaction({
      senderUpiId: this.senderUpiId || '',
      senderProfileId: this.senderProfileId || 0,
      receiverUpiId: receiverUpiId,
      receiverProfileId: this.receiverDetails.profileId,
      amount: parseFloat(amount),
      description: description
    }).subscribe ({

      // Success
      next: (response) => {
        if (response.success) {
          console.log('Transaction initiated successfully');
          console.log('Transaction ID: ', response.transactionId);
          console.log('Public Key received');

          // Store transaction data in sessionStorage (temporary)
          sessionStorage.setItem('transactionData', JSON.stringify({
            transactionId: response.transactionId,
            publicKey: response.publicKey,
            senderUpiId: this.senderUpiId,
            receiverUpiId: receiverUpiId,
            amount: amount,
            expiresAt: response.expiresAt
          }));

          this.loading = false;
          this.successMessage = 'Transaction initated! Proceeding to payment...';

          // Redirect to payment complete
          setTimeout(() => {
            this.router.navigate(['/payment/complete']);
          }, 1500);
        }
      },

      // Handle error
      error: (error) => {
        console.error('Error initiating transaction: ', error);
        this.loading = false;
        this.errorMessage = error.error?.message || 'Failed to initiate transaction. Please try again.';
      }
    });
  }  

// ------ Method 5: Go Back to previous step ------
  goBackStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.receiverDetails = null;
    }
  }  

// ------ Method 6: Get Form controls ------
  get f() {
    return this.paymentForm.controls;
  } 

// ------ Method 7: Format currency ------
  formatCurrency(amount: number): string {
    return '₹' + amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }  
}
