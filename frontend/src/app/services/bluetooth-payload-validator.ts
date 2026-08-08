import { Injectable } from '@angular/core';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

@Injectable({
  providedIn: 'root',
})
export class BluetoothPayloadValidatorService {

  // Configuration constraints
  private readonly MIN_AMOUNT = 1;
  private readonly MAX_AMOUNT = 100000;
  private readonly MAX_PAYLOAD_SIZE_BYTES = 512;
  private readonly UPI_REGEX = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/;
  private readonly MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;  // 5 minutes 

  constructor() {
    console.log('PayloadValidatorService initalized');
  }

// ------ Method 1: Validate plain Payload structure ------
  validatePlainPayload(payload: any): ValidationResult {
    console.log('Validating plain payload...');

    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check payload exists
      if(!payload) {
        errors.push('Payload is null or undefined');
        return {valid: false, errors, warnings};
      }

      // Check required fields exist
      if (!payload.senderUPI) {
        errors.push('Missing senderUPI');
      }
      if (!payload.receiverUPI) {
        errors.push('Missing receiverUPI');
      }
      if (payload.amount === undefined || payload.amount === null) {
        errors.push('Missing amount');
      }
      if (!payload.timestamp) {
        errors.push('Missing timestamp');
      }
      if (!payload.nonce) {
        errors.push('Missing nonce');
      }

      // If critical fields missing, return early
      if (errors.length > 0) {
        console.error('Critical fields missing: ', errors);
        return { valid: false, errors, warnings};
      }

      // Validate UPI format
      if (!this.isValidUPI(payload.senderUPI)) {
        errors.push(`Invalid senderUPI format: ${payload.senderUPI}`);
      }
      if (!this.isValidUPI(payload.receiverUPI)) {
        errors.push(`Invalid receiverUPI format: ${payload.receiverUPI}`);
      }

      // Validate amount
      if (typeof payload.amount !== 'number') {
        errors.push(`Amount must be number, got: ${typeof payload.amount}`);
      }
      else {
        if (payload.amount < this.MIN_AMOUNT) {
          errors.push(`Amount too low: ₹${payload.amount} (minimum: ₹${this.MIN_AMOUNT})`);
        }
        if (payload.amount > this.MAX_AMOUNT) {
          errors.push(`Amount too high: ₹${payload.amount} (maximum: ₹${this.MAX_AMOUNT})`);
        }
      }

      // Validate timestamp
      if (typeof payload.timestamp !== 'number') {
        errors.push(`Timestamp must be number, got: ${typeof payload.timestamp}`);
      }
      else {
        const ageMs = Date.now() - payload.timestamp;

        if (ageMs > this.MAX_TIMESTAMP_AGE_MS) {
          errors.push(`Payment is too old: ${Math.round(ageMs / 1000)}s > ${Math.round(this.MAX_TIMESTAMP_AGE_MS / 1000)}s`);
        }
        if (ageMs < 0) {
          warnings.push(`Payment timestamp is in future (clock skew detected`);
        }
      }

      // Validate nonce format
      if (typeof payload.nonce !== 'string') {
        errors.push(`Nonce must be string, got: ${typeof payload.nonce}`);
      }
      else if (payload.nonce.length < 10) {
        errors.push(`Nonce too short: ${payload.nonce.length} chars (minimum: 10)`);
      }

      // Check sender != receiver
      if (payload.senderUPI === payload.receiverUPI) {
        errors.push('Cannot send money to yourself');
      }

      const valid = errors.length === 0;

      if (valid) {
        console.log('Plain payload is valid');
      }
      else {
        console.warn('Plain payload validation failed: ', errors);
      }

      return { valid, errors, warnings};
    }
    catch (error) {
      console.error('Error validating plain payload: ', error);
      errors.push(`Validation error: ${error}`);
      return { valid: false, errors, warnings };
    }
  }  

// ------ Method 2: Validate Encrypted payload structure ------
  validateEncryptedPayload(payload: any): ValidationResult {

    console.log('Validating encrypted payload...');

    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // check payload exists
      if (!payload) {
        errors.push('Encrypted payload is null or undefined');
        return { valid: false, errors, warnings };
      }

      // Check required fields
      if (!payload.encryptedData) {
        errors.push('Missing encryptedData');
      }
      if (!payload.signature) {
        errors.push('Missing signature');
      }
      if (!payload.nonce) {
        errors.push('Missing nonce');
      }
      if (!payload.timestamp) {
        errors.push('Missing timestamp');
      }
      if (payload.payloadVersion === undefined) {
        errors.push('Missing payloadVersion');
      }
      if (!payload.senderUPI) {
        errors.push('Missing senderUPI (plaintext)');
      }
      if (!payload.receiverUPI) {
        errors.push('Missing receiverUPI (plaintext)');
      }

      if (errors.length > 0) {
        console.error('Critical fields missing: ', errors);
        return { valid: false, errors, warnings };
      }

      // Validate fields types
      if (typeof payload.encryptedData !== 'string') {
        errors.push(`encryptedData must be string, got: ${typeof payload.encryptedData}`);
      }
      else if (payload.encryptedData.length < 20) {
        errors.push(`encryptedData too short: ${payload.encryptedData.length} chars`);
      }

      if (typeof payload.signature !== 'string') {
        errors.push(`Signature must be string, got: ${typeof payload.signature}`);
      }
      else if (!/^[a-f0-9]+$/.test(payload.signature)) {
        errors.push('signature must be hex string');
      }
      else if (payload.signature.length < 32) {
        errors.push(`signature too short: ${payload.signature.length} chars (should be 64 for SHA256)`);
      }

      if (typeof payload.nonce !== 'string') {
        errors.push(`nonce must be string, got: ${typeof payload.nonce}`);
      }

      // Validate version
      if (payload.payloadVersion !== 1) {
        warnings.push(`Payload version ${payload.payloadVersion} may not be supported`);
      }

      // Validate UPI fields
      if (!this.isValidUPI(payload.senderUPI)) {
        errors.push(`Invalid senderUPI: ${payload.senderUPI}`);
      }
      if (!this.isValidUPI(payload.receiverUPI)) {
        errors.push(`Invalid receiverUPI: ${payload.receiverUPI}`);
      }

      // Validate size
      const payloadJSON = JSON.stringify(payload);

      if(payloadJSON.length > this.MAX_PAYLOAD_SIZE_BYTES) {
        errors.push(`Payload too large: ${payloadJSON.length}B > ${this.MAX_PAYLOAD_SIZE_BYTES}B`);
      }

      const valid = errors.length === 0;

      if (valid) {
        console.log('Encrypted payload is valid');
      }
      else {
        console.warn('Encrypted payload validation failed: ', errors);
      }

      return {valid, errors, warnings};
    }
    catch (error) {
      console.error('Error validating encrypted payload: ', error);
      errors.push(`Validation error: ${error}`);
      return { valid: false, errors, warnings };
    }
  }  

// ------ Method 3: Validate UPI ID format ------  
  private isValidUPI(upi: string): boolean {
    if (typeof upi !== 'string') return false;

    // Basic UPI format: username@bank or username@upi
    return this.UPI_REGEX.test(upi) && upi.length >= 5 && upi.length <= 50;
  }

// ------ Method 4: Log validation results ------  
  logValidationResults(result: ValidationResult, label: string = 'validation'): void {

    console.log(`\n========= ${label} Results =========`);
    console.log(`Valid: ${result.valid ? 'YES' : 'NO'}`);

    if (result.errors.length > 0) {
      console.error('Errors:');
      result.errors.forEach((err, i) => {
        console.error(` ${i+1}. ${err}`);
      });
    }

    if (result.warnings.length > 0) {
      console.warn('Warnings:');
      result.warnings.forEach((warn, i) => {
        console.warn(` ${i+1}. ${warn}`);
      });
    }

    if (result.valid && result.warnings.length === 0) {
      console.log('No issues found');
    }

    console.log('=======================================\n');
  }

// ------ Method 5: Get User-Friendly error message ------
  getErrorMessage(result: ValidationResult): string {
    if (result.valid) {
      return 'Payload is valid';
    }

    if (result.errors.length === 1) {
      return result.errors[0];
    }

    return `${result.errors.length} validation errors found`;
  }  
}
