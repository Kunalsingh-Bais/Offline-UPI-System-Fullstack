import { Injectable } from '@angular/core';

interface CryptoKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

@Injectable({
  providedIn: 'root',
})

export class EncryptionService {

  // For WiFi payment :-
  // RSA configuration
  private readonly RSA_ALGORITHM = 'RSA-OAEP';
  private readonly SIGN_ALGORITHM = 'RSA-PSS';
  private readonly KEY_SIZE = 4096;
  private readonly HASH_ALGORITHM = 'SHA-256';

  // Key storage
  private localPrivateKeyBase64: string | null = null;
  private localPublicKeyBase64: string | null = null;
  private localKeyPair: CryptoKeyPair | null = null;

  // Storage keys
  private readonly PRIVATE_KEY_STORAGE = 'offline_upi_private_key';
  private readonly PUBLIC_KEY_STORAGE = 'offline_upi_public_key';

  constructor() {
    console.log('EncryptionService initialized');
  }

// ======== NORMAL UPI PAYMENT (workflow) ========  
  // Purpose : Client-side encryption of payment data

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
      const jsonData = `${paymentData.senderUpiId}|${paymentData.receiverUpiId}|${paymentData.amount}`;
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
      const finalEncrypted = `${encryptedAESKey},${encryptedData},${hash}`;

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


// ======== OFFLINE WiFi PAYMENT (workflow) ========

// ------ Method 1: Generate Local key pair ------
  async generateLocalKeyPair(): Promise<void> {

    console.log('Generating local RSA-4096 key pair...');

    try {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: this.RSA_ALGORITHM,
          modulusLength: this.KEY_SIZE,
          publicExponent: new Uint8Array([1, 0, 1]),  // 65537
          hash: this.HASH_ALGORITHM
        },
        true,  // extractable (needed to export)
        ['encrypt', 'decrypt']
      );

      console.log('Key pair generated');
      console.log('Algorithm: ' + this.RSA_ALGORITHM);
      console.log('Key size: ' + this.KEY_SIZE + ' bits');

      // Store in memory
      this.localKeyPair = keyPair;

      // Export and store
      await this.exportAndStoreKeyPair(keyPair);

      console.log('Key pair stored securely');

    } catch (error: any) {
      console.error('❌ Error generating key pair: ' + error.message);
      throw new Error('Failed to generate key pair: ' + error.message);
    }
  }

// ------ Method 2: Export and store Key pair ------
  // Export key pair to Base64 and store in localStorage
  private async exportAndStoreKeyPair(keyPair: CryptoKeyPair): Promise<void> {

    console.log('Exporting and storing key pair...');

    try {
      // Export private key
      const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
      const privateKeyJson = JSON.stringify(privateKeyJwk);
      this.localPrivateKeyBase64 = btoa(privateKeyJson);

      // Export public key
      const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
      const publicKeyJson = JSON.stringify(publicKeyJwk);
      this.localPublicKeyBase64 = btoa(publicKeyJson);

      // Store in localStorage
      try {
        localStorage.setItem(this.PRIVATE_KEY_STORAGE, this.localPrivateKeyBase64);
        localStorage.setItem(this.PUBLIC_KEY_STORAGE, this.localPublicKeyBase64);
        console.log('Keys stored in localStorage');
      } catch (e) {
        console.warn('⚠️ Could not store in localStorage: ' + e);
      }
    } 
    catch (error: any) {
      console.error('❌ Error exporting keys: ' + error.message);
      throw new Error('Failed to export keys: ' + error.message);
    }
  }

// ------ Method 3: Load Keys from Storage ------
  private loadKeysFromStorage(): void {

    console.log('Loading keys from localStorage...');

    try {
      const privateKeyBase64 = localStorage.getItem(this.PRIVATE_KEY_STORAGE);
      const publicKeyBase64 = localStorage.getItem(this.PUBLIC_KEY_STORAGE);

      if (privateKeyBase64 && publicKeyBase64) {
        this.localPrivateKeyBase64 = privateKeyBase64;
        this.localPublicKeyBase64 = publicKeyBase64;
        console.log('Keys loaded from localStorage');
      } else {
        console.log('No stored keys found, will need to generate');
      }                         
    } 
    catch (error: any) {
      console.warn('⚠️ Error loading keys: ' + error.message);
    }
  }  

// ------ Method 4: Get Private key ------
  async getPrivateKey(): Promise<string> {

    console.log('Getting private key...');

    if (!this.localPrivateKeyBase64) {
      console.warn('⚠️ No private key found, generating...');
      await this.generateLocalKeyPair();
    }

    if (!this.localPrivateKeyBase64) {
      throw new Error('Failed to get private key');
    }

    console.log('✅ Private key retrieved');

    return this.localPrivateKeyBase64;
  }  

// ------ Method 5: Get Public key ------
  async getPublicKey(): Promise<string> {

    console.log('Getting public key...');

    if (!this.localPublicKeyBase64) {
      console.warn('⚠️ No public key found, generating...');
      await this.generateLocalKeyPair();
    }

    if (!this.localPublicKeyBase64) {
      throw new Error('Failed to get public key');
    }

    console.log('Public key retrieved');
    console.log('Size: ' + this.localPublicKeyBase64.length + ' bytes (base64)');

    return this.localPublicKeyBase64;
  }

// ------ Method 6: Encrypt with Public key ------
  // Encrypt with receiver's PUBLIC key
  async encryptWithPublicKey(plaintext: string, publicKeyBase64: string): Promise<string> {

    console.log('Encrypting with public key (RSA-OAEP)...');

    try {
      // Step 1: Decode Base64 public key
      const publicKeyJson = atob(publicKeyBase64);
      const publicKeyJwk = JSON.parse(publicKeyJson);

      console.log('Public key decoded');  

      // Step 2: Import as CryptoKey
      const publicKey = await crypto.subtle.importKey(
        'jwk',
        publicKeyJwk,
        {
          name: this.RSA_ALGORITHM,
          hash: this.HASH_ALGORITHM
        },
        false,
        ['encrypt']
      );

      console.log('Public key imported');

      // Step 3: Convert plaintext to bytes
      const plaintextBytes = new TextEncoder().encode(plaintext);
      console.log('   Plaintext size: ' + plaintextBytes.length + ' bytes');

      // Step 4: Encrypt with RSA-OAEP
      const encryptedArrayBuffer = await crypto.subtle.encrypt(
        this.RSA_ALGORITHM,
        publicKey,
        plaintextBytes
      );

      console.log('Encryption successful');

      // Step 5: Convert to Base64 for transmission
      const encryptedBytes = new Uint8Array(encryptedArrayBuffer);
      const encryptedBase64 = this.bytesToBase64(encryptedBytes);

      console.log('   Ciphertext size: ' + encryptedBase64.length + ' bytes (base64)');
      console.log('   Compression: ' + ((encryptedBase64.length / plaintextBytes.length) * 100).toFixed(1) + '%');

      return encryptedBase64;
    } 
    catch (error: any) {
      console.error('❌ Encryption failed: ' + error.message);
      throw new Error('Failed to encrypt with public key: ' + error.message);
    }
  }

// ------ Method 7: Decrypt with Private key ------
  async decryptWithPrivateKey(ciphertextBase64: string, privateKeyBase64: string): Promise<string> {

    console.log('Decrypting with private key (RSA-OAEP)...');

    try {
      // Step 1: Decode Base64 private key
      const privateKeyJson = atob(privateKeyBase64);
      const privateKeyJwk = JSON.parse(privateKeyJson);

      console.log('Private key decoded');  

      // Step 2: Import as CryptoKey
      const privateKey = await crypto.subtle.importKey(
        'jwk',
        privateKeyJwk,
        {
          name: this.RSA_ALGORITHM,
          hash: this.HASH_ALGORITHM
        },
        false,
        ['decrypt']
      );

      console.log('Private key imported');

      // Step 3: Decode Base64 ciphertext
      const ciphertextBytes = this.base64ToBytes(ciphertextBase64);
      console.log('   Ciphertext size: ' + ciphertextBytes.length + ' bytes');

      const bufferToDecrypt = new Uint8Array(ciphertextBytes);

      // Step 4: Decrypt with RSA-OAEP
      const decryptedArrayBuffer = await crypto.subtle.decrypt(
        this.RSA_ALGORITHM,
        privateKey,
        bufferToDecrypt
      );

      console.log('✅ Decryption successful');

      // Step 5: Convert bytes to string
      const plaintext = new TextDecoder().decode(decryptedArrayBuffer);

      console.log('   Plaintext size: ' + plaintext.length + ' bytes');

      return plaintext;
    } 
    catch (error: any) {
      console.error('❌ Decryption failed: ' + error.message);
      throw new Error('Failed to decrypt with private key: ' + error.message);
    }
  }  

// ------ Method 8: Sign data with Private key ------
  // Sign with sender's PRIVATE key
  async signData(data: string): Promise<string> {

    console.log('Signing data with private key (RSA-PSS)...');

    try {
      // Step 1: Get or generate private key
      const privateKeyBase64 = await this.getPrivateKey();

      // Step 2: Decode and import private key
      const privateKeyJson = atob(privateKeyBase64);
      const privateKeyJwk = JSON.parse(privateKeyJson);
      
      const privateKey = await crypto.subtle.importKey(
        'jwk',
        privateKeyJwk,
        {
          name: this.SIGN_ALGORITHM,
          hash: this.HASH_ALGORITHM
        },
        false,
        ['sign']
      );

      console.log('Private key imported for signing');

      // Step 3: Convert data to bytes
      const dataBytes = new TextEncoder().encode(data);
      console.log('   Data size: ' + dataBytes.length + ' bytes');

      // Step 4: Sign with RSA-PSS
      const signatureArrayBuffer = await crypto.subtle.sign(
        {
          name: this.SIGN_ALGORITHM,
          saltLength: 32
        },
        privateKey,
        dataBytes
      );

      console.log('✅ Signing successful');

      // Step 5: Convert to Base64
      const signatureBytes = new Uint8Array(signatureArrayBuffer);
      const signatureBase64 = this.bytesToBase64(signatureBytes);

      console.log('Signature size: ' + signatureBase64.length + ' bytes (base64)');

      return signatureBase64;

    } catch (error: any) {
      console.error('❌ Signing failed: ' + error.message);
      throw new Error('Failed to sign data: ' + error.message);
    }
  }
  
// ------ Method 9: Verify signature with Public key ------
  // Verify RSA-PSS signature using sender's public key
  async verifySignature(data: string, signatureBase64: string, publicKeyBase64: string): Promise<boolean> {

    console.log('Verifying signature with public key (RSA-PSS)...');

    try {
      // Step 1: Decode and import public key
      const publicKeyJson = atob(publicKeyBase64);
      const publicKeyJwk = JSON.parse(publicKeyJson);
      
      const publicKey = await crypto.subtle.importKey(
        'jwk',
        publicKeyJwk,
        {
          name: this.SIGN_ALGORITHM,
          hash: this.HASH_ALGORITHM
        },
        false,
        ['verify']
      );

      console.log('Public key imported for verification');

      // Step 2: Convert data to bytes
      const dataBytes = new TextEncoder().encode(data);

      // Step 3: Decode signature
      const signatureBytes = this.base64ToBytes(signatureBase64);
      const bufferToVerify = new Uint8Array(signatureBytes);

      // Step 4: Verify signature with RSA-PSS
      const isValid = await crypto.subtle.verify(
        {
          name: this.SIGN_ALGORITHM,
          saltLength: 32
        },
        publicKey,
        bufferToVerify,
        dataBytes
      );

      if (isValid) {
        console.log('✅ Signature VALID - data integrity confirmed');
      } else {
        console.log('❌ Signature INVALID - data may be tampered');
      }

      return isValid;
    } 
    catch (error: any) {
      console.error('❌ Signature verification error: ' + error.message);
      return false;
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
