import { Injectable } from '@angular/core';
import { EncryptionService } from './encryption';
import { NonceService } from './nonce';
import { WifiKeyExchangeService } from './wifi-key-exchange';

// Interface for encrypted payload ready to send
export interface EncryptedWIFIPayload {
  encryptedData: string;
  signature: string;
  nonce: string;
  timestamp: number;
  payloadVersion: number;
  senderUPI: string;
  receiverUPI: string;
}

// Plain payment payload
export interface PaymentPayload {
    transactionId: string;
    senderUpiId: string;
    receiverUpiId: string;
    amount: number;
    timestamp: number;
    nonce: string;
    payloadVersion: number;
  }

// Formatted payload for WiFi transmission  
  export interface FormattedPayload {
    encryptedData: string;      // RSA-OAEP encrypted
    signature: string;           // RSA-PSS signed
    nonce: string;
    timestamp: number;
    senderUPI: string;
    receiverUPI: string;
    amount: number;
    transactionId: string;
    payloadVersion: number;
    algorithm: string;
    signatureAlgorithm: string;
    keySize: number;
  }  

@Injectable({
  providedIn: 'root',
})
export class WifiPaymentBuilderService {
  
  private readonly PAYLOAD_VERSION = 1;
  private readonly MTU_SIZE = 512;
  private readonly HEADER_SIZE = 100;  // Reserved for metadata
  private readonly MAX_PAYLOAD_SIZE = this.MTU_SIZE - this.HEADER_SIZE;

  constructor(private  encryptionService: EncryptionService, private nonceService: NonceService, private keyExchange: WifiKeyExchangeService) {
    console.log('PaymentBuilderService initialized');
  }

// ------ Method 1: Build Payment Payload (plain) ------
  buildPayloadPlain(senderUPI: string, receiverUPI: string, amount: number): PaymentPayload {

    console.log('Building plain payment payload...');

    const payload: PaymentPayload = {
      transactionId: 'TXN_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      senderUpiId: senderUPI,
      receiverUpiId: receiverUPI,
      amount: amount,
      timestamp: Date.now(),
      nonce: this.nonceService.generateNonce(),
      payloadVersion: 2  
    };

    console.log('Plain payload built: ', payload);
    console.log('   Transaction ID: ' + payload.transactionId);
    console.log('   Nonce: ' + payload.nonce);

    return payload;
  }  

// ------ Method 2: Generate Nonce ------
  generateNonce(): string {
    console.log('Generating nonce...');

    const nonce = this.nonceService.generateNonce();
    console.log('✅ Nonce generated: ' + nonce);

    return nonce;
  }  

// ------ Method 3: Generate Signature for Payload ------
  async generateSignature(payload: PaymentPayload): Promise<string> {
    console.log('Generating signature for payment...');

    try {
      // Create canonical string for signature
      const paymentString = payload.senderUpiId + '|' +
                           payload.receiverUpiId + '|' +
                           payload.amount + '|' +
                           payload.timestamp + '|' +
                           payload.nonce;
  
      console.log('Payload string: ' + paymentString.substring(0, 50) + '...');

      // Sign with sender's PRIVATE key
      const signature = await this.encryptionService.signData(paymentString);

      console.log(' Signature generated (RSA-PSS)');
      console.log(' Size: ' + signature.length + ' characters');

      return signature;
    }
    catch (error) {
      console.error('Error generating signature: ', error);
      throw new Error ('Failed to generate signature');
    }
  } 

// ------ Method 4: Validate Signature ------
  async verifySignature(payloadString: string, signature: string, senderPublicKeyBase64: string): Promise<boolean> {
    console.log('Verifying signature');

    try {
      const isValid = await this.encryptionService.verifySignature(
        payloadString,
        signature,
        senderPublicKeyBase64
      );

      if (isValid) {
        console.log('Signature is VALID - data integrity confirmed');
      } else {
        console.error('Signature is INVALID - data may be tampered');
      }

      return isValid;

    } catch (error: any) {
      console.error('❌ Error verifying signature: ' + error.message);
      return false;
    }
  }

// ------ Method 5: Encrypt Payload for WiFi ------
  async encryptPayloadForWIFI(payloadPlain: PaymentPayload, receiverPublicKeyBase64: string): Promise<string> {

    console.log('Encrypting payload for Wifi transmission...');

    try {
      const coreData = {
        amount: payloadPlain.amount,
        senderUPI: payloadPlain.senderUpiId,
        receiverUPI: payloadPlain.receiverUpiId,
        transactionId: payloadPlain.transactionId,
        nonce: payloadPlain.nonce
      };

      // Step 1: Convert payload to JSON string
      const jsonString = JSON.stringify(coreData);
      console.log('Payload size: ' + jsonString.length + ' bytes');

      // Step 2: Encrypt with receiver's PUBLIC key using RSA-OAEP
      console.log('Algorithm: RSA-OAEP');
      console.log('Key size: 4096 bits');

      const encryptedData = await this.encryptionService.encryptWithPublicKey(
        jsonString,
        receiverPublicKeyBase64
      );  

      console.log('Payload encrypted successfully');
      console.log('Encrypted size: ' + encryptedData.length + ' bytes');
      console.log('Compression ratio: ' + ((encryptedData.length / jsonString.length) * 100).toFixed(1) + '%');

      return encryptedData;
    }
    catch (error: any) {
      console.error('Error encrypting payload: ', error.message);
      throw new Error('Failed to encrypt payload for WIFI: ' + error.message);
    }
  }   

// ------ Method 6: Format Payload for WIFI Transmission ------
  async formatPayloadForWIFI(payloadPlain: PaymentPayload,
    receiverPublicKeyBase64: string): Promise<FormattedPayload> {
    console.log('Formatting payload for WiFi transmission...');

    try {
      // Step 1: Encrypt payload
      const encryptedData = await this.encryptPayloadForWIFI(payloadPlain, receiverPublicKeyBase64);

      // Step 2: Generate signature
      const signature = await this.generateSignature(payloadPlain);

      // Step 3: Format complete payload
      const formattedPayload: FormattedPayload = {
        encryptedData: encryptedData,
        signature: signature,
        // Metadata (not encrypted, needed for routing/verification)
        nonce: payloadPlain.nonce,
        timestamp: payloadPlain.timestamp,
        senderUPI: payloadPlain.senderUpiId,
        receiverUPI: payloadPlain.receiverUpiId,
        amount: payloadPlain.amount,
        transactionId: payloadPlain.transactionId,
        
        // Version info
        payloadVersion: 2,  
        algorithm: 'RSA-OAEP',
        signatureAlgorithm: 'RSA-PSS',
        keySize: 4096
      };

      console.log('Payload formatted successfully');
      console.log('Transaction ID: ' + formattedPayload.transactionId);
      console.log('Encrypted size: ' + formattedPayload.encryptedData.length + ' bytes');
      console.log('   Ready to send via WiFi');

      return formattedPayload;
    }
    catch (error) {
      console.error('Error formatting payload: ', error);
      throw new Error('Failed to format payload for WiFi');
    }
  }  

// ------ Method 7: Validate Encrypted payload ------
  validateEncryptedPayload(payload: FormattedPayload): boolean {

    console.log('Validating encrypted payload...');

    // Check required fields
    if (!payload.encryptedData || payload.encryptedData.length === 0) {
      console.error('❌ Missing encrypted data');
      return false;
    }

    if (!payload.signature || payload.signature.length === 0) {
      console.error('❌ Missing signature');
      return false;
    }

    if (!payload.nonce || payload.nonce.length === 0) {
      console.error('❌ Missing nonce');
      return false;
    }
    
    if (!payload.transactionId || !payload.senderUPI || !payload.receiverUPI) {
      console.error('❌ Missing metadata');
      return false;
    }

    if (payload.amount <= 0) {
      console.error('❌ Invalid amount');
      return false;
    }

    console.log('Payload validation passed');
    console.log('Encrypted data: OK (' + payload.encryptedData.length + ' bytes)');
    console.log('Signature: OK (' + payload.signature.length + ' bytes)');
    console.log('Nonce: OK (' + payload.nonce + ')');
    console.log('Amount: OK (₹' + payload.amount + ')');

    return true;
  }
    
// ------ Method 8: Decrypt payload ------
  async decryptPayloadForWifi( encryptedData: string, receiverPrivateKeyBase64: string): Promise<PaymentPayload> {

    console.log('Decrypting payload with receiver private key...');

    try {
      // Decrypt with receiver's PRIVATE key
      const decryptedJson = await this.encryptionService.decryptWithPrivateKey(
        encryptedData,
        receiverPrivateKeyBase64
      );

      console.log('✅ Decryption successful');

      // Parse JSON
      const payload = JSON.parse(decryptedJson) as PaymentPayload;

      console.log('Payload parsed');
      console.log('From: ' + payload.senderUpiId);
      console.log('Amount: ₹' + payload.amount);

      return payload;

    } catch (error: any) {
      console.error('Error decrypting payload: ' + error.message);
      throw new Error('Failed to decrypt payload: ' + error.message);
    }
  } 
  
// ------ Method 9: Chunk Large payload ------
  chunkPayload(payload: string, chunkSize: number = this.MAX_PAYLOAD_SIZE): string[] {
    console.log(`Chunking payload (${payload.length}B) into ${chunkSize}B chunks...`);

    const chunks: string[] = [];

    for (let i=0; i<payload.length; i+=chunkSize) {
      chunks.push(payload.substring(i, i + chunkSize));
    }

    console.log(`Payload chunked into ${chunks.length} chunks`);

    return chunks;
  }  

// ------ Method 10: Validate WIFI Configuration ------
  validateConfiguration(): {valid: boolean; errors: string[];} {
    console.log('Validating WIFI configuration...');

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

// ------ Method 11: Method for RSA Encryption (future enhancement) ------
  // This can be used to encrypt sensitive parts with peer's RSA key
  async encryptWithPeerRSAKey(data: string, peerDeviceId: string): Promise<string> {
    console.log('Encrypting data with peer RSA public key...');

    try {
      const peerPublicKey = this.getPeerPublicKeyCryptoKey(peerDeviceId);

      const dataBytes = new TextEncoder().encode(data);

      const encryptedBytes = await crypto.subtle.encrypt(
        {name: 'RSA-OAEP'},
        peerPublicKey, 
        dataBytes
      ) as ArrayBuffer;

      const encryptedBase64 = this.bytesToBase64(encryptedBytes);

      console.log('Data encrypted with RSA');

      return encryptedBase64;
    }
    catch (error) {
      console.error('Error in RSA encryption: ', error);
      throw new Error('Failed to encrypt with peer RSA key');
    }
  }  
  
// ------ Helper Methods ------

  // --- Get Peer Public key as CryptoKey ------
  private getPeerPublicKeyCryptoKey(peerDeviceId: string): CryptoKey {
    console.log('Getting peer public key as CryptoKey...');

    const peerPublicKey = this.keyExchange.getPeerPublicKey(peerDeviceId);

    if (!peerPublicKey) {
      throw new Error(`No public key found for device: ${peerDeviceId}`);
    }

    return peerPublicKey;
  }

  // --- generate a consistent encryption key ---
  private generateEncryptionKey(): Uint8Array {
    // For now , generated from hardcoded seed (temporary)
    // In production, this will be exchanged during handshake
    const seed = 'WIFI-payment-encryption-key-v1';
    const seedBytes = new TextEncoder().encode(seed);

    // Expand to 32 bytes using SHA-256
    // In production , use proper key derivation
    const key = new Uint8Array(32);
    for(let i=0; i<32; i++) {
      key[i] = seedBytes[i % seedBytes.length];
    }

    return key;
  } 

  // --- Convert ArrayBuffer to Base64 ---
  private bytesToBase64(bytes: ArrayBuffer): string {
    const byteArray = new Uint8Array(bytes);
    let binaryString = '';

    for (let i=0; i<byteArray.length; i++) {
      binaryString += String.fromCharCode(byteArray[i]);
    }

    return btoa(binaryString);
  }
}
