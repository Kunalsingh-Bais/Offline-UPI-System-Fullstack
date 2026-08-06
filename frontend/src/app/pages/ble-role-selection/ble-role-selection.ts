import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-role-selection',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ble-role-selection.html',
  styleUrl: './ble-role-selection.css',
})
export class BleRoleSelectionComponent {

  isProcessing = false;

  constructor(private router: Router) {}

  // ------ Select Sender Role ------
  selectSender(): void {
    console.log('User selected: I am Sending');
    
    this.isProcessing = true;

    setTimeout(() => {
      console.log('Navigating to bluetooth-payment (sender)...');
      this.router.navigate(['/bluetooth-payment'], {
        queryParams: { role: 'sender' }
      });
    }, 300);
  }

  // ------ Select Receiver Role ------
  selectReceiver(): void {
    console.log('User selected: I am Receiving');
    
    this.isProcessing = true;

    setTimeout(() => {
      console.log('Navigating to receiver-mode (receiver)...');
      this.router.navigate(['/ble-payment-receiver'], {
        queryParams: { role: 'receiver' }
      });
    }, 300);
  }

  // ------ Go Back ------
  goBack(): void {
    console.log('Going back to dashboard...');
    this.router.navigate(['/dashboard']);
  }
}