import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

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

@Injectable({
  providedIn: 'root',
})
export class WifiRelayService {

  private localServerPort = 5000;
  private localServerUrl = `http://${window.location.hostname === 'localhost' ? '10.11.73.26' : window.location.hostname}:${this.localServerPort}`;

  private paymentReceivedSubject = new Subject<RelayPayload>();
  public paymentReceived$ = this.paymentReceivedSubject.asObservable();

  private serverStatusSubject = new Subject<string>();
  private serverStatus$ = this.serverStatusSubject.asObservable();

  constructor(private http: HttpClient) {
    console.log('WifiRelayService initialized');
  }

// ========== SENDER SIDE: Send payment via WiFi ==========  

// ------ Method 1: Send encrypted payment to receiver device via Wifi ------
  async sendPaymentViaWiFi(receiverDeviceIP: string, payload: RelayPayload): Promise<RelayResponse> {
    console.log('Sending payment via Wifi to: '+ receiverDeviceIP);

    try {
      const receiverUrl = `http://${receiverDeviceIP}:${this.localServerPort}/api/payment/receive`;

      console.log('Target URL: ' + receiverUrl);

      const response = await this.http.post<RelayResponse>(receiverUrl, payload).toPromise();

      if (response && response.success) {
        console.log('Payment sent successfully via Wifi');
        return response;
      }
      else {
        console.error('Payment send failed: ', response);
        throw new Error(response?.message || 'Unknown error');
      }

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

        // Call backend sync endpoint
        const response = await this.http.post('/api/transaction/sync-ble', {
          transactionId: payment.transactionId,
          encryptedData: payment.encryptedData,
          signature: payment.signature,
          nonce: payment.nonce,
          timestamp: payment.timestamp,
          senderUPI: payment.senderUpiId,
          recevierUPI: payment.receiverUpiId,
          payloadVersion: payment.payloadVersion || 1
        })
        .toPromise();

      results.push({
        transactionId: payment.transactionId,
        status: 'SYNCED',
        response: response
      });  
    }
    catch (error: any) {
      console.error('Sync failed for: ' + payment.transactionId);
      results.push({
        transactionId: payment.transactionId,
        status: 'FAILED',
        error: error.message
      });
    } 

  }
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
}
