import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})

// Purpose : Client-side encryption of payment data
export class EncryptionService {

  constructor() {
    console.log('EncryptionService initialized');
  }

// ------ Method 1: Generate AES Key ------   
  generateAESKey(): Uint8Array {
    console.log('Generating AES-256 key...');

    // Create random 32 bytes for AES-256
    const aesKey = new Uint8Array(32);

    // Fill with cryptographically secure random values
    crypto.getRandomValues(aesKey);

    console.log('AES key generated (256-bit)');

    return aesKey;
  }

// ------ Method 2: Encrypt AES Key with RSA ------
  async encryptAESKey(publicKeyBase64: string, aesKey: Uint8Array): Promise<string> {

    console.log('Encrypting AES key with RSA public key...');

    try {
      // Step 1: Convert base64 public key to bytes
      const publicKeyBytes = this.base64ToBytes(publicKeyBase64);
      console.log('Public key decoded from base64');

      // Step 2: Import ESA public key for crypto operations
      const publicKey = await crypto.subtle.importKey(
        'spki',                    // Format: SubjectPublicKeyInfo
        publicKeyBytes as BufferSource,          // Key data
        {
          name: 'RSA-OAEP',        // Algorithm: RSA with OAEP padding 
          hash: 'SHA-256'          // Hash algorithm
        },
        false,                     // Not extractable
        ['encrypt']                // Usage: encryption only 
      );

      console.log('RSA public key imported');

      // Step 3: Encrypt AES key with RSA public key
      const encryptedAESKey = await crypto.subtle.encrypt(
        {
          name: 'RSA-OAEP'
        },
        publicKey,
        aesKey as BufferSource
      );

      console.log('AES key encrypted with RSA');

      // Step 4: convert encrypted key to base64 for transmission
      const encryptedBase64 = this.bytesToBase64(new Uint8Array(encryptedAESKey));

      console.log('Encrypted AES key converted to base64');

      return encryptedBase64;
    }
    catch (error) {
      console.error('Error encrypting AES key: ', error);
      throw new Error('Failed to encrypt AES key');
    }
  }

// ------ Method 3: Encrypt payment data with AES ------  
  async encryptData(aesKey: Uint8Array, paymentData: any): Promise<string> {
    console.log('Encrypting payment data with AES...');

    try {
      // Step 1: Convert payment object to JSON
      const jsonData = JSON.stringify(paymentData);
      console.log('Payment data JSON: ', jsonData);

      const dataBytes = new TextEncoder().encode(jsonData);
      console.log('JSON converted to bytes');

      // Step 2: Generate random IV (Initialization Vector)
      // IV = Random bytes used for this encryption
      const iv = new Uint8Array(12);  // 12 bytes for GCM
      crypto.getRandomValues(iv);

      console.log('IV generated (12 bytes)');

      // Step 3: Import AES key for crypto operations
      const key = await crypto.subtle.importKey(
        'raw',                     // Format: Raw key byted
        aesKey as BufferSource,                    // Key data (32 bytes)
        {
          name: 'AES-GCM'          // Algorithm: AES-GCM
        },
        false,                     // Not extractable
        ['encrypt']                // Usage: encryption only
      );

      console.log('AES key imported');

      // Step 4: Encrypt payment data
      const encryptedData = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv                   // Use the IV we generated        
        },
        key,
        dataBytes
      );

      console.log('Payment data encrypted with AES-GCM');

      // Step 5: Combine IV + encrypted data
      const combined = new Uint8Array(iv.length + encryptedData.byteLength);
      combined.set(iv, 0);                   // IV first
      combined.set(new Uint8Array(encryptedData), iv.length);  // Encrypted data after

      // Step 6: Convert to base64
      const encryptedBase64 = this.bytesToBase64(combined);

      console.log('Encrypted data converted to base64');

      return encryptedBase64;
    }
    catch (error) {
      console.error('Error encrypting data: ', error);
      throw new Error('Failed to encrypt payment data');
    }
  }

// ------ Method 4: Generate SHA-256 Hash ------
  async generateHash(data: Uint8Array | string): Promise<string> {
    console.log('Generating SHA-256 hash...');

    try {
      // Step 1: Convert to bytes if string
      let dataBytes: Uint8Array;

      if (typeof data === 'string') {
        dataBytes = new TextEncoder().encode(data);
      }
      else {
        dataBytes = data;
      }

      // Step 2: Create SHA-256 hash
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256',                // Algorithm
        dataBytes as BufferSource             // Data to hash
      );

      console.log('SHA-256 hash generated');

      // Step 3: Convert hash to base64
      const hashBase64 = this.bytesToBase64(new Uint8Array(hashBuffer));

      console.log('Hash converted to base64');

      return hashBase64;
    }
    catch (error) {
      console.error('Error generating hash: ', error);
      throw new Error('Failed to generate hash');
    }
  }

// ------ Method 5: Complete Encryption workflow ------ 
  // Result: Single encrypted string ready to send to backend 
  // Format: "RSA-encrypted-AES-key,AES-encrypted-data,SHA256-hash"
  async encryptPayment(publicKeyBase64: string, paymentData: any): Promise<string> {

    console.log('Starting complete payment encryption...');
    console.log('Payment data: ', paymentData);

    try {
      // Step 1: Generate random AES key
      console.log('\n Step 1: Generate AES key');
      const aesKey = this.generateAESKey();

      // Step 2: Encrypt AES key with RSA
      console.log('\n Step 2: Encrypt AES key with RSA public key');
      const encryptedAESKey = await this.encryptAESKey(publicKeyBase64, aesKey);
      console.log('Encrypted AES key (first part ready)');

      // Step 3: Encrypt payment data with AES
      console.log('\n Step 3: Encrypt payment data with AES');
      const encryptedData = await this.encryptData(aesKey, paymentData);
      console.log('Encrypted payment data (second part ready)');

      // Step 4: Generate hash
      console.log('\n Step 4: Generate SHA-256 hash');
      const hash = await this.generateHash(encryptedData);
      console.log('Hash generated (third part ready)');

      // Step 5: Combine into final string
      console.log('\n Step 5: Combine all parts');
      const finalEncrypted = `${encryptedAESKey}, ${encryptedData}, ${hash}`;

      console.log('✅ Encryption complete!');
      console.log('Final encrypted string ready to send');
      console.log('Format: RSA-key,AES-data,hash');

      return finalEncrypted;
    }
    catch (error) {
      console.log('Error in payment encryption: ', error);
      throw error;
    }
  }  

// ------ Helper methods ------
  
  // Convert base64 string to Uint8Array
  private base64ToBytes(base64: string): Uint8Array {

    const binaryString = atob(base64);   // Decode base64 -> binary string
    const bytes = new Uint8Array(binaryString.length);

    for (let i=0;i<binaryString.length;i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes;
  }

  // Convert Uint8Array bytes to base64 string
  private bytesToBase64(bytes: Uint8Array): string {
    let binaryString = '';

    for (let i=0; i<bytes.length; i++) {
      binaryString += String.fromCharCode(bytes[i]);
    }

    return btoa(binaryString);     // Encode binary string -> base64
  }

  // Convert Uint8Array to hex string (for debugging

  bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
