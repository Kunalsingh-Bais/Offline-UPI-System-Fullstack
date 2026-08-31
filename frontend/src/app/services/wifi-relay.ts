import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Subject, timestamp } from 'rxjs';
import { EncryptionService } from './encryption';

export interface RelayPayload {
  encryptedData: string;
  signature: string;
  nonce: string;
  amount: number;
  timestamp: number;
  senderUPI: string;
  receiverUPI: string;
  transactionId: string;
  payloadVersion: number;
}

export interface RelayResponse {
  success: boolean;
  status: string;
  transactionId: string;
  message: string;
}

export interface CachedPublicKey {
  publicKey: string;
  cachedAt: number,
  algorithm: string;
  keySize: number;
  getAgeMinutes?: () => number;
  isExpired?: () => boolean;
}

export function getPublicKeyAgeMinutes(cachedKey: CachedPublicKey): number {
  return (Date.now() - cachedKey.cachedAt) / (60 * 1000);
}

export function isPublicKeyExpired(cachedKey: CachedPublicKey): boolean {
  // Expire after 24 hours
  return (Date.now() - cachedKey.cachedAt) > (24 * 60 * 60 * 1000);
}

@Injectable({
  providedIn: 'root',
})
export class WifiRelayService {

  private localServerPort = 5000;
  private localServerUrl = `http://${window.location.hostname === 'localhost' ? '10.11.73.26' : window.location.hostname}:${this.localServerPort}`;

  private backendUrl = 'http://10.11.73.26:8080/transaction';

  private paymentReceivedSubject = new Subject<RelayPayload>();
  public paymentReceived$ = this.paymentReceivedSubject.asObservable();

  // Cache for public keys (UPI -> public key)
  private publicKeyCache = new Map<string, CachedPublicKey>();

  private serverStatusSubject = new Subject<string>();
  private serverStatus$ = this.serverStatusSubject.asObservable();

  constructor(private http: HttpClient, private encryptionService: EncryptionService) {
    console.log('WifiRelayService initialized');
  }

// ========== SENDER SIDE: Send payment via WiFi ==========  

// ------ Method 1: Send encrypted payment to receiver device via Wifi ------
  async sendPaymentViaWiFi(receiverDeviceIP: string, payload: RelayPayload): Promise<RelayResponse> {
    console.log('Sending payment via Wifi to: '+ receiverDeviceIP);

    try {
      // Step 1: Get receiver's public key from backend
      const receiverPublicKeyBase64 = await this.getReceiverPublicKey(payload.receiverUPI);
      console.log('Got public key');

      // Step 2: Encrypt payload with receiver's PUBLIC key
      const encryptedPayload = await this.encryptionService.encryptWithPublickey(JSON.stringify(payload), receiverPublicKeyBase64);

      console.log('Payload encrypted with RSA-OAEP');

      // Step 3: Sign encrypted payload with sender's PRIVATE key
      const signature = await this.encryptionService.signData(encryptedPayload);
      console.log('Payment signed');

      // Step 4: Create final payload to send
      const finalPayload = {
        encryptedData: encryptedPayload,
        signature: signature,
        nonce: payload.nonce,
        timestamp: Date.now(),
        senderUPI: payload.senderUPI,
        receiverUPI: payload.receiverUPI,
        amount: payload.amount,
        transactionId: payload.transactionId,
        payloadVersion: 2
      }

      // Step 5: Send to receiver device via WiFi
      console.log('URL: http://'+receiverDeviceIP +':5000/api/payment/receive');
      console.log('Encrypted size: ' + encryptedPayload.length + ' bytes');
      console.log('Signature size: ' + signature.length + ' bytes');

      const response = await this.http.post<any>(`http://${receiverDeviceIP}:5000/payment/receive`, finalPayload,
        {headers: { 'Content-Type': 'application/json' }}
      ).toPromise();

      console.log('✅ Payment sent successfully');
      console.log('   Response: ' + response.status);
      console.log('   Message: ' + response.message);

      return {
        success: true,
        status: response.status,
        message: response.message,
        transactionId: payload.transactionId
      };
    }
    catch (error: any) {
      console.error('Wifi send error: ', error);
      throw new Error('Failed to send via Wifi: ' + (error.message || 'Network error'));
    }
  }

// ------ Method 2: Try to send to receiver device (smart retry with multiple IPs) ------
  async sendWithRetry(
    receiverUPI: string, 
    payload: RelayPayload,
    possibleIPs: string[] = ['10.11.73.26', '192.168.1.100', '192.168.1.101', '192.168.1.102', '10.0.0.100']
  ): Promise<RelayResponse> {
    
    console.log('Attempting to send with retry mechanism');
    console.log('Trying IPs: ', possibleIPs);

    let lastError: any;

    for (const ip of possibleIPs) {
      try {
        console.log('Trying IP: ' + ip);
        const response = await this.sendPaymentViaWiFi(ip, payload);
        return response;  // Success!
      }
      catch (error) {
        console.warn('IP failed: ' + ip + ', error: ' + error);
        lastError = error;
        // Continue to next IP
      }
    }

    // All IPs failed
    console.error('All IPs failed. Returning error.');
    throw lastError || new Error('Could not reach receiver device');
  }  

// ------ Method 3: Generate QR code for manual transfer (fallback) ------
  generateQRCode(payload: RelayPayload): string {
    // Serialize payload to JSON and encode as base64
    const json = JSON.stringify(payload);
    const base64 = btoa(json);

    // In real implementation, generate QR from this base64
    console.log('OR Code data (base64): ', base64.substring(0, 50) + '...');

    return base64;
  }  

// ------ Method 4: Decode QR code (receiver scans) ------
  decodeQRCode(base64Data: string): RelayPayload {
    const json = atob(base64Data);
    const payload = JSON.parse(json);
    return payload;
  }  


// ========== RECEIVER SIDE: Local HTTP server =========

// ------ Method : Request Receiver's Public Key ------
  async getReceiverPublicKey(receiverUPI: string): Promise<string> {

    console.log('Requesting receiver public key for: ' + receiverUPI);

    try {
      // Check cache first
      const cached = this.publicKeyCache.get(receiverUPI);
      if (cached && !cached.isExpired?.()) {
        console.log('✅ Public key found in cache (age: ' + cached.getAgeMinutes?.() + ' min)');
        return cached.publicKey;
      }

      // Not in cache, request from backend
      console.log('Fetching public key from backend...');

      const response = await this.http.post<any>(
        `${this.backendUrl}/key-exchange`,
        { receiverUPI: receiverUPI }
      ).toPromise();

      if (!response || !response.publicKey) {
        throw new Error('No public key in response');
      }

      const publicKeyBase64 = response.publicKey;

      console.log('✅ Public key received from backend');
      console.log('   Algorithm: ' + response.algorithm);
      console.log('   Key size: ' + response.keySize + ' bits');
      console.log('   Size: ' + publicKeyBase64.length + ' bytes (base64)');

      // Cache the public key (expires after 24 hours)
      this.publicKeyCache.set(receiverUPI, {
        publicKey: publicKeyBase64,
        cachedAt: Date.now(),
        algorithm: response.algorithm,
        keySize: response.keySize
      });

      return publicKeyBase64;

    } catch (error: any) {
      console.error('❌ Error getting public key: ' + error.message);
      throw new Error('Failed to get receiver public key: ' + error.message);
    }
  }
  
// ------ Method 5: Start local HTTP server on this device ------
  startLocalServer(): void {
    console.log('Local server started on port ' + this.localServerPort);
    console.log('Ready to receive payments from other devices');
    this.serverStatusSubject.next('LISTENING');
  }

// ------ Method 6: Receive payment endpoint ------
  // This is called by Device A (sender)
  async receivePayment(payload: RelayPayload): Promise<RelayResponse> {
    console.log('Payment received via WiFi relay');
    console.log('From: ' + payload.senderUPI);

    try {
      // Validate payload structure
      if (!payload.encryptedData || !payload.signature || !payload.nonce) {
        throw new Error('Invalid payload structure');
      }

      // Store in IndexedDB (will be validated and synced later)
      // This is handled by the receiver component

      // Notify subscribers
      this.paymentReceivedSubject.next(payload);

      console.log('Payment queued for processing');

      // Return success
      return {
        success: true,
        status: 'RECEIVED',
        transactionId: payload.transactionId,
        message: 'Payment received and stored locally'
      };
    }
    catch (error: any) {
      console.error('Error processing payment: ', error);

      return {
        success: false,
        status: 'FAILED',
        transactionId: payload.transactionId,
        message: error.message
      };
    }
  }  

// ------ Method 7: Sync when receiver gets online ------
  // sync pending payments to backend , called by device B
  async syncPaymentsToBackend(payments: any[]): Promise<any[]> {
    console.log('Syncing ' + payments.length + ' payments to backend');

    const results: any[] = [];

    for (const payment of payments) {
      try {
        console.log('Syncing payment: ' + payment.transactionId);

        // Send payment to backend for settlement
        const response = await this.http.post<any>(`${this.backendUrl}/sync-ble`, {
          transactionId: payment.transactionId,
          encryptedData: payment.encryptedData,
          signature: payment.signature,
          nonce: payment.nonce,
          timestamp: payment.timestamp,
          senderUPI: payment.senderUpiId,
          recevierUPI: payment.receiverUpiId,
          amount: payment.amount,
          payloadVersion: 2
        }
      ).toPromise();

      if (response.success) {
        console.log('✅ Synced: ' + response.status);
        console.log('   Backend TX ID: ' + response.backendTransactionId);

        results.push({
          transactionId: payment.transactionId,
          status: 'SYNCED',
          backendTxId: response.backendTransactionId,
          success: true
        });
      }
      else {
        console.error('❌ Sync failed: ' + response.message);

        results.push({
          transactionId: payment.transactionId,
          status: 'FAILED',
          error: response.message,
          success: false
        });
      }  
    }
    catch (error: any) {
      console.error('Sync failed for: ' + payment.transactionId);
      results.push({
        transactionId: payment.transactionId,
        status: 'FAILED',
        error: error.message,
        success: false
      });
    } 
  }
  
    console.log('\n✅ Sync complete');
    console.log('   Successful: ' + results.filter(r => r.success).length);
    console.log('   Failed: ' + results.filter(r => !r.success).length);

    return results;
  }  

// ------ Helper Methods ------

// --- Helper Method 1: Auto-discovery of receiver device ---
  // Try to discover receiver device on local network
  async discoverDeviceOnNetwork(timeout: number = 1500): Promise<string | null> {
    console.log('Scanning local network for receiver device...');

    const currentHost = window.location.hostname;
    const candidateIps = this.buildLocalNetworkCandidates(currentHost);
    console.log('Candidate IPs: ', candidateIps);

    for (const ip of candidateIps) {
      try {
        const response = await Promise.race([
          this.http.get(`http://${ip}:${this.localServerPort}/health`).toPromise(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeout)
          )
        ]);

        if (response) {
          console.log('Found receiver device at: ' + ip);
          return ip;
        }
      }
      catch (e) {
        // Continue to next IP
      }
    }

    console.log('No active receiver found on the current LAN.');
    return null;
  }

  private buildLocalNetworkCandidates(currentHost: string): string[] {
    const unique = new Set<string>();

    const commonLanRanges = [
      '10.11.73.',
      '192.168.1.',
      '192.168.0.',
      '10.0.0.'
    ];

    for (const prefix of commonLanRanges) {
      for (let last = 1; last <= 60; last++) {
        unique.add(`${prefix}${last}`);
      }
    }

    // prioritize likely receiver devices first
    const prioritized = [
      '10.11.73.26',
      '10.11.73.25',
      '10.11.73.24',
      '10.11.73.20',
      '192.168.1.100',
      '192.168.1.101',
      '192.168.1.102',
      '192.168.0.100',
      '10.0.0.100'
    ];

    prioritized.forEach(ip => unique.add(ip));

    return Array.from(unique).filter(ip => ip && ip !== '0.0.0.0' && ip !== 'localhost');
  }

// --- Helper Method 2: Health check endpoint (used by discovery) ---
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.http.get<{ status: string }>(`${this.localServerUrl}/health`).toPromise();

      return response?.status === 'ok';
    }
    catch (error) {
      return false;
    }
  }  

// --- Helper Method 3: Clear public Key Cache ---
  clearKeyCache(): void {
    console.log('🧹 Clearing public key cache...');
    this.publicKeyCache.clear();
    console.log('✅ Cache cleared');
  }
}
