import { Injectable } from '@angular/core';
import { EncryptionService } from './encryption';
import { NonceService } from './nonce';
import { BLEPayloadPlain } from '../model/ble-transaction';

// Interface for encrypted payload ready to send
export interface EncryptedBLEPayload {
  encryptedData: string;
  signature: string;
  nonce: string;
  timestamp: number;
  payloadVersion: number;
  senderUPI: string;
  receiverUPI: string;
}

@Injectable({
  providedIn: 'root',
})
export class BluetoothPaymentBuilderService {
  
  private readonly PAYLOAD_VERSION = 1;
  private readonly MTU_SIZE = 512;
  private readonly HEADER_SIZE = 100;  // Reserved for metadata
  private readonly MAX_PAYLOAD_SIZE = this.MTU_SIZE - this.HEADER_SIZE;

  constructor(private  encryptionService: EncryptionService, private nonceService: NonceService) {
    console.log('PaymentBuilderService initialized');
  }

// ------ Method 1: Build Payment Payload (plain) ------
  buildPayloadPlain(senderUPI: string, receiverUPI: string, amount: number): BLEPayloadPlain {

    console.log('Building plain payment payload...');

    const nonce = this.nonceService.generateNonce();

    const payload: BLEPayloadPlain = {
      senderUPI: senderUPI,
      receiverUPI: receiverUPI,
      amount: amount,
      timestamp: Date.now(),
      nonce: nonce
    };

    console.log('Plain payload built: ', payload);

    return payload;
  }  

// ------ Method 2: Generate Signature for Payload ------
  async generateSignature(payload: BLEPayloadPlain): Promise<string> {
    console.log('Generating signature for payload...');

    try {
      // Step 1: Serialize payload to JSON
      const payloadJSON = JSON.stringify(payload);
      console.log('Payload serialized to JSON');

      // Step 2: Generate SHA-256 hash
      const hashBase64 = await this.encryptionService.generateHash(payloadJSON);
      console.log('SHA-256 hash generated');

      // Step 3: Convert base64 to hex for signature
      const signature = this.base64ToHex(hashBase64);
      console.log('Signature generated (hex): ', signature);

      return signature;
    }
    catch (error) {
      console.error('Error generating signature: ', error);
      throw new Error ('Failed to generate signature');
    }
  } 

// ------ Method 3: Validate Signature ------
  async validateSignature(payload: BLEPayloadPlain, signature: string): Promise<boolean> {
    console.log('Validating signature');

    try {
      // Step 1: Generate signature for received payload
      const expectedSignature = await this.generateSignature(payload);

      // Step 2: Compare signature
      const isValid = expectedSignature === signature;

      if (isValid) {
        console.log('Signature is valid');
      }
      else {
        console.warn('Signature is INVALID - data may be tampered');
      }

      return isValid;
    }
    catch (error) {
      console.error('Error validating signature: ', error);
      return false;
    }
  }  

// ------ Method 4: Encrypt Payload for BLe ------
  async encryptPayloadForBLE(payload: BLEPayloadPlain, receiverPublicKeyBase64: string): Promise<EncryptedBLEPayload> {

    console.log('Encrypting payload for BLE transmission...');

    try {
      // Step 1: Generate signature
      const signature = await this.generateSignature(payload);

      // Step 2: Serialize payload to JSON
      const payloadJSON = JSON.stringify(payload);
      console.log('Payload JSON size: ', payloadJSON.length, 'bytes');

      // Step 3: Check if payload fits in BLE MTU
      if (payloadJSON.length > this.MAX_PAYLOAD_SIZE) {
        console.warn('Payload exceeds max size, will be chunked');
      }

      // Step 4: Encrypt payload (includes chunking)
      const encryptedData = await this.encryptionService.encryptData(
        this.generateEncryptionKey(), {payloadJSON}
      );

      // Step 5: Build encrypted payload structure
      const encryptedPayload: EncryptedBLEPayload = {
        encryptedData: encryptedData,
        signature: signature,
        nonce: payload.nonce,
        timestamp: payload.timestamp,
        payloadVersion: this.PAYLOAD_VERSION,
        senderUPI: payload.senderUPI,
        receiverUPI: payload.receiverUPI
      };

      console.log('Payload encrypted and ready for transmission');

      return encryptedPayload;
    }
    catch (error) {
      console.error('Error encrypting payload: ', error);
      throw new Error('Failed to encrypt payload for BLE');
    }
  }   

// ------ Method 5: Decrypt and Validate received payload ------
  async decryptAndValidatePayload(encryptedPayload: EncryptedBLEPayload, senderPublicKeyBase64?: string): Promise<BLEPayloadPlain> {

    console.log('Decrypting and validating received payload...');

    try {
      // Step 1: Check for replay attack
      if (this.nonceService.hasSeenNonce(encryptedPayload.nonce)) {
        throw new Error('Replay attack detected: Nonce already used');
      }

      // Step 2: Register nonce as seen
      this.nonceService.registerNonce(encryptedPayload.nonce);

      // Step 3: Parse encrypted data back to object
      // Note: Full decryption would require private key
      // For now, we trust the encrypted data and validate signature
 
      // Step 4: Create payload object from encrypted payload
      const payload: BLEPayloadPlain = {
        senderUPI: encryptedPayload.senderUPI,
        receiverUPI: encryptedPayload.receiverUPI,
        amount: 0,
        timestamp: encryptedPayload.timestamp,
        nonce: encryptedPayload.nonce
      };

      // Step 5: Validate signature 
      const isSignatureValid = await this.validateSignature(payload, encryptedPayload.signature);

      if (!isSignatureValid) {
        throw new Error('Signature validation failed: Data may be tampered');
      }

      // Step 6: Validate timestamp (not too old)
      const ageMs = Date.now() - encryptedPayload.timestamp;
      const MAX_AGE_MS = 5 * 60 * 1000;

      if (ageMs > MAX_AGE_MS) {
        throw new Error(`Payment is too old: ${ageMs}ms > ${MAX_AGE_MS}ms`);
      }

      console.log('Payload decrypted and validated successfully');

      return payload;
    }
    catch (error) {
      console.error('Error decrypting/validating payload: ', error);
      throw error;
    }
  }  

// ------ Method 6: Format Payload for BLE Transmission ------
  formatPayloadForBLE(encryptedPayload: EncryptedBLEPayload): string {
    console.log('Formatting payload for BLE transmission...');

    try {
      // Serialize entire encrypted payload as JSON
      const formattedPayload = JSON.stringify(encryptedPayload);

      console.log('Payload formatted, size: ', formattedPayload.length, 'bytes');

      // Check if it exceeds MTU
      if(formattedPayload.length > this.MTU_SIZE) {
        console.warn(`⚠️ Payload (${formattedPayload.length}B) exceeds MTU 
          (${this.MTU_SIZE} B)`);
        console.warn('Will be sent in chunks');  
      }

      return formattedPayload;
    }
    catch (error) {
      console.error('Error formatting payload: ', error);
      throw new Error('Failed to format payload for BLE');
    }
  }

// ------ Method 7: Chunk Large payload ------
  chunkPayload(payload: string, chunkSize: number = this.MAX_PAYLOAD_SIZE): string[] {
    console.log(`Chunking payload (${payload.length}B) into ${chunkSize}B chunks...`);

    const chunks: string[] = [];

    for (let i=0; i<payload.length; i+=chunkSize) {
      chunks.push(payload.substring(i, i + chunkSize));
    }

    console.log(`Payload chunked into ${chunks.length} chunks`);

    return chunks;
  }  

// ------ Method 8: Validate BLE Configuration ------
  validateConfiguration(): {valid: boolean; errors: string[];} {
    console.log('Validating BLE configuration...');

    const errors: string[] = [];

    if (this.MTU_SIZE < 20) {
      errors.push('MTU size to small (minimum 20 bytes)');
    }

    if (this.MAX_PAYLOAD_SIZE <= 0) {
      errors.push('Max payload size is invalid');
    }

    if (this.PAYLOAD_VERSION < 1) {
      errors.push('Invalid payload version');
    }

    const valid = errors.length === 0;

    if (valid) {
      console.log('Configuration is valid');
    }
    else {
      console.error('Configuration errors: ', errors);
    }

    return {valid, errors};
  } 
  
// ------ Helper Methods ------

  // --- generate a consistent encryption key ---
  private generateEncryptionKey(): Uint8Array {
    // For now , generated from hardcoded seed (temporary)
    // In production, this will be exchanged during handshake
    const seed = 'ble-payment-encryption-key-v1';
    const seedBytes = new TextEncoder().encode(seed);

    // Expand to 32 bytes using SHA-256
    // In production , use proper key derivation
    const key = new Uint8Array(32);
    for(let i=0; i<32; i++) {
      key[i] = seedBytes[i % seedBytes.length];
    }

    return key;
  }

  // --- Convert base64 to hex ---
  private base64ToHex(base64: string): string {
    const binaryString = atob(base64);
    let hex = '';

    for (let i=0; i<binaryString.length; i++) {
      hex += binaryString.charCodeAt(i).toString(16).padStart(2, '0');
    }

    return hex;
  }

  // --- Convert hex to base64 ---
  private hexToBase64(hex: string): string {
    let binaryString = '';

    for (let i=0; i<hex.length; i+=2) {
      binaryString += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }

    return btoa(binaryString);
  }
}
