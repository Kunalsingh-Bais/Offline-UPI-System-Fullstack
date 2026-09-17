import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { EncryptionService } from './encryption';
import { Subject } from 'rxjs';
import { IndexedDbService } from './indexed-db';

export interface RelayPayload {
  encryptedData: string;
  signature: string;
  nonce: string;
  amount: number;
  description?: string;
  timestamp: number;
  senderUPI: string;
  receiverUPI: string;
  transactionId: string;
  payloadVersion: number;
}

@Injectable({
  providedIn: 'root',
})
export class WifiRelayService {

  // ===== HARDCODED URLS (NO environment needed) =====
  private readonly API_GATEWAY = 'http://localhost:8080';
  private readonly RELAY_SERVER = 'http://localhost:5000';
  private readonly RELAY_PORT = 5000;

  private publicKeyCache = new Map<string, any>();
  paymentReceived$ = new Subject<RelayPayload>;

  constructor(
    private http: HttpClient,
    private encryptionService: EncryptionService,
    private indexedDbService: IndexedDbService
  ) {
    console.log('✅ WifiRelayService initialized');
    console.log('   API Gateway: ' + this.API_GATEWAY);
    console.log('   Relay Server: ' + this.RELAY_SERVER);
  }

  // ===== SEND PAYMENT =====
  async sendPaymentViaWiFi(
    receiverDeviceIP: string,
    payload: RelayPayload
  ): Promise<any> {

    console.log('\n========== SENDING PAYMENT ==========');
    console.log('Receiver IP: ' + receiverDeviceIP);
    console.log('Receiver UPI: ' + payload.receiverUPI);
    console.log('Amount: ₹' + payload.amount);

    try {
      // Step 1: Get receiver's public key
      console.log('Getting receiver public key');
      const receiverPublicKey = await this.getReceiverPublicKey(payload.receiverUPI, receiverDeviceIP);
      console.log('✅ Received public key');

      // Step 2: Encrypt
      console.log('Encrypting (RSA-OAEP)');
      const coreData = JSON.stringify({
        amount: payload.amount,
        senderUPI: payload.senderUPI,
        receiverUPI: payload.receiverUPI,
        transactionId: payload.transactionId,
        nonce: payload.nonce
      });

      const encryptedData = await this.encryptionService.encryptWithPublicKey(
        coreData,
        receiverPublicKey
      );
      console.log('✅ Encrypted');

      // Step 3: Sign
      console.log('Signing (RSA-PSS)');
      const signature = await this.encryptionService.signData(encryptedData);
      console.log('✅ Signed');

      // Step 4: Create final payload
      console.log('Creating final payload');
      const finalPayload = {
        encryptedData: encryptedData,
        signature: signature,
        nonce: payload.nonce,
        timestamp: Date.now(),
        senderUPI: payload.senderUPI,
        receiverUPI: payload.receiverUPI,
        amount: payload.amount,
        transactionId: payload.transactionId,
        payloadVersion: 2
      };

      // Step 5: Send to relay server
      console.log('Sending to relay server');
      const relayUrl = `http://${receiverDeviceIP}:${this.RELAY_PORT}/api/payment/receive`;
      console.log('   POST ' + relayUrl);

      const response = await this.http.post<any>(
        relayUrl,
        finalPayload,
        { headers: { 'Content-Type': 'application/json' } }
      ).toPromise();

      console.log('\n✅ Payment sent successfully!');
      console.log('   Status: ' + response?.status);
      console.log('========== PAYMENT SENT ✅ ==========\n');

      return {
        success: true,
        status: response?.status || 'SENT',
        message: response?.message || 'Payment sent',
        transactionId: payload.transactionId
      };

    } catch (error: any) {
      console.error('\n❌ Error: ' + error.message);
      throw error;
    }
  }

  // ===== GET PUBLIC KEY =====
  async getReceiverPublicKey(receiverUPI: string, receiverDeviceIP: string): Promise<string> {

    console.log('🔑 Requesting public key for: ' + receiverUPI);

    try {
      // Check cache
      const cached = this.publicKeyCache.get(receiverUPI);
      if (cached && !this.isKeyExpired(cached)) {
        console.log('   ✅ Using cached key');
        return cached.publicKey;
      }

      // Ask receiver's local relay server
      const url = `http://${receiverDeviceIP}:${this.RELAY_PORT}/api/public-key`;
      console.log('   POST ' + url);

      const response = await this.http.get<any>(url).toPromise();

      if (!response?.publicKey) {
        throw new Error('No public key in response');
      }

      // Cache
      this.publicKeyCache.set(receiverUPI, {
        publicKey: response.publicKey,
        cachedAt: Date.now()
      });

      console.log('   ✅ Got public key');
      return response.publicKey;

    } catch (error: any) {
      console.error('❌ Error: ' + error.message);
      throw error;
    }
  }

  // ===== SYNC TO BACKEND =====
  async syncPaymentsToBackend(payments: any[]): Promise<any[]> {

    console.log('\n========== SYNCING TO BACKEND ==========');
    console.log('Syncing ' + payments.length + ' payment(s)');

    const results: any[] = [];

    for (let i = 0; i < payments.length; i++) {
      const payment = payments[i];
      try {
        console.log('\n📤 Payment ' + (i + 1) + ' of ' + payments.length);

        // CORRECT ENDPOINT
        const url = this.API_GATEWAY + '/api/payment/sync-wifi';
        console.log('   POST ' + url);

        const response = await this.http.post<any>(
          url,
          {
            transactionId: payment.transactionId,
            encryptedData: payment.encryptedData,
            signature: payment.signature,
            nonce: payment.nonce,
            timestamp: payment.timestamp || Date.now(),
            senderUPI: payment.senderUpiId || payment.senderUPI,
            receiverUPI: payment.receiverUpiId || payment.receiverUPI,
            amount: payment.amount,
            payloadVersion: 2
          },
          { headers: { 'Content-Type': 'application/json' } }
        ).toPromise();

        if (response?.success) {
          console.log('   ✅ Synced');

          await this.indexedDbService.markWIFIAsSynced(payment.transactionId, response.transactionId);

          results.push({ transactionId: payment.transactionId, success: true });
        } 
        else if (response?.message?.toLowerCase().includes('already processed')) {
          console.log('  ✅ Already processed by server (marking complete)');

          await this.indexedDbService.markWIFIAsSynced(payment.transactionId, response.transactionId);
          
          results.push({ transactionId: payment.transactionId, success: true });
        }  
        else {
          console.log('   ❌ Failed: ' + response?.message);
          results.push({ transactionId: payment.transactionId, success: false });
        }

      } catch (error: any) {
        console.error('   ❌ Error: ' + error.message);
        results.push({ transactionId: payment.transactionId, success: false });
      }
    }

    console.log('\n✅ Sync complete');
    console.log('========== END SYNC ==========\n');

    return results;
  }

  // ===== AUTO-DISCOVERY =====
  async discoverDeviceOnNetwork(): Promise<string | null> {

    console.log('🔍 Discovering relay server...');

    const candidateIPs = [
      '10.122.98.14',
      'localhost',
      '192.168.1.1',
      '192.168.0.1'
    ];

    for (const ip of candidateIPs) {
      try {
        console.log('   Trying: ' + ip);
        await this.http.get(`http://${ip}:${this.RELAY_PORT}/health`, { timeout: 1000 }).toPromise();
        console.log('✅ Found at: ' + ip);
        return ip;
      } catch (e) {
        // Continue
      }
    }

    console.log('❌ Auto-discovery failed. No active receiver found.');
    return null;
  }

  // ===== HELPERS =====
  private isKeyExpired(cached: any): boolean {
    return (Date.now() - cached.cachedAt) > (24 * 60 * 60 * 1000);
  }

  clearKeyCache(): void {
    this.publicKeyCache.clear();
  }
}
