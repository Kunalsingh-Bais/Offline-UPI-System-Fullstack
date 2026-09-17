import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class WifiPayloadValidatorService {
  
  constructor() {}

// ------ Validate received payment ------
  validatePayment(payment: any): {valid: boolean; errors: string[]} {

    const errors: string[] = [];

    // Check required fields
    if (!payment.senderUPI) errors.push('Sender UPI missing');
    if (!payment.receiverUPI) errors.push('Receiver UPI missing');
    if (!payment.amount) errors.push('Amount missing');
    if (!payment.nonce) errors.push('Nonce missing');
    if (!payment.timestamp) errors.push('Timestamp missing');

    // Validate UPI format
    if (payment.senderUPI && !this.isValidUPI(payment.senderUPI)) {
      errors.push('Invalid sender UPI format');
    }
    if (payment.receiverUPI && !this.isValidUPI(payment.receiverUPI)) {
      errors.push('Invalid receiver UPI format');
    }

    // Validate amount
    if (payment.amount && payment.amount <=0) {
      errors.push('Amount must be positive');
    }
    if (payment.amount && payment.amount > 100000) {
      errors.push('Amount exceeds maximum limit');
    }

    // Validate timestamp (maximum 5 min)
    if (payment.timestamp) {
      const age = Date.now() - payment.timestamp;
      const maxAge = 5 * 60 * 1000; // 5 minutes

      if (age > maxAge) {
        errors.push('Payment is too old');
      }
    }

    // Check not self-transfer
    if (payment.senderUPI === payment.receiverUPI) {
      errors.push('Cannot send to yourself');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

// ------ Validate UPI format ------
  private isValidUPI(upi: string): boolean {
    const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/;
    return upiRegex.test(upi) && upi.length >= 5 && upi.length <=50;
  }
}
