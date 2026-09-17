import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, timestamp } from 'rxjs/operators';
import { UserService } from '../../services/user';
import { IndexedDbService, PendingTransaction } from '../../services/indexed-db';
import { WifiPayloadValidatorService } from '../../services/wifi-payload-validator';
import { RelayPayload, WifiRelayService } from '../../services/wifi-relay';
import { HttpClient } from '@angular/common/http';
import { EncryptionService } from '../../services/encryption';
import { QRCodeComponent } from 'angularx-qrcode';

@Component({
  selector: 'app-wifi-receiver',
  standalone: true,
  imports: [CommonModule, QRCodeComponent],
  templateUrl: './wifi-payment-receiver.html',
  styleUrls: ['./wifi-payment-receiver.css'],
})
export class WiFiPaymentReceiverComponent implements OnInit, OnDestroy {

  // Properties: 
  userUPI: string = '';
  isListening: boolean = false;
  receiverUPI: string = '';
  isLocalServerRunning: boolean = false;
  pendingPayments: any[] = [];

  // UI state
  isLoading = false;
  loadingPayments = false;
  message: string = '';
  messageType: 'success' | 'error' | 'info' = 'info';
  messageTimeout: any;
  isPolling: boolean = false;
  isSyncing: boolean = false; 
  syncProgress: boolean = false;
  isDecrypting: boolean = false;

  // Local IP shown to sender devices
  private localIp: string = '';

  paymentTab: 'received' | 'pending' = 'received'; 
  receivedPayments: any[] = [];
  private rawPayments: PendingTransaction[] = [];
  processedNonces: Set<string> = new Set();

  private pollingInterval: any;
  
  private destroy$ = new Subject<void>();

  // Internet connectivity indicator
  isOnline = navigator.onLine;

  private networkCheckInterval: any;
  private wasOffline = false;  //To track when we transition from offline -> online

  // Receiver Ip 
  receiverIpUrl: string = '';

  // Dynamically grab the IP of whatever device is hosting the Angular app
  private get relayBaseUrl(): string {
    const host = (window && window.location && window.location.hostname) || 'localhost';
    return `http://${host}:5000`;
  }

  constructor(
    private userService: UserService,
    private indexedDbService: IndexedDbService,
    private paymentValidatorService: WifiPayloadValidatorService,
    private router: Router,
    private wifiRelayService: WifiRelayService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private encryptionService: EncryptionService,
  ) {}

  ngOnInit(): void {
    console.log('WIFIReceiverComponent initialized');
    this.receiverUPI = this.userService.getUpiIdFromStorage() || '';
    this.userUPI = this.receiverUPI;
    this.fetchRealIpForQrCode();
    this.updateNetworkState(navigator.onLine);
    this.startNetworkPolling();
    this.setupAutoSync();
    this.loadAllReceivedPayments();
    this.loadPendingPayments();

    // Attempt to determine a best-effort local hostname/IP for display
    this.localIp = this.resolveLocalIp();
  }

  ngOnDestroy(): void {
    // Clean up the interval when leaving the page
    if (this.networkCheckInterval) {
      clearInterval(this.networkCheckInterval);
    }

    this.stopPollingServer();
    this.destroy$.next();
    this.destroy$.complete();
  }

// ----- UI helpers -----
  getReceiverStatusText(): string {
    return this.isListening ? '🟢 Listening' : '⚪ Not listening';
  }

  formatCurrency(amount: number): string {
    try {
      const v = Number(amount) || 0;
      return '₹' + v.toFixed(2);
    } catch {
      return '₹0.00';
    }
  }

  extractName(upi: string): string {
    if (!upi) return 'Unknown';
    const parts = upi.split('@');
    return parts[0] || upi;
  }

  getStatusBadgeClass(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'received':
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  get paymentStats() {
    const totalReceived = this.receivedPayments.length;
    const totalAmount = this.receivedPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

    const pendingSync = this.rawPayments.filter((p) => p.status === 'PENDING' || p.status === 'RECEIVED' || p.status === 'SYNCING').length;
    
    return { totalReceived, totalAmount, pendingSync };
  }

  async refreshPayments(): Promise<void> {
    this.loadingPayments = true;
    try {
      await this.loadAllReceivedPayments();
      await this.loadPendingPayments();
    } finally {
      this.loadingPayments = false;
      this.cdr.detectChanges();
    }
  }

  async clearSyncedPayments(): Promise<void> {
    try {
      await this.indexedDbService.clearWIFISyncedPayments();
      await this.loadAllReceivedPayments();
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error clearing synced payments', err);
    }
  }

// ------ Method 1: Start Listening -----
  async startListening(): Promise<void> {
    
    console.log('Starting WiFi receiver...');
    
    try {
      // Start local server
      this.isListening = true;
      this.isLocalServerRunning = true;
      this.isPolling = true;

      await this.http.post(`${this.relayBaseUrl}/api/set-listening`, { isListening: true }).toPromise();

      console.log('Uploading local public key and UPI to relay server...');
      const localPublicKey = await this.encryptionService.getPublicKey();
      
      // Send BOTH the publicKey AND the upi!
      await this.http.post(`${this.relayBaseUrl}/api/public-key`, { 
        publicKey: localPublicKey,
        upi: this.receiverUPI 
      }).toPromise();
      
      console.log('✅ Public key and UPI uploaded successfully');

      this.showMessage(`✅ Ready to Receive!\n\nYour UPI: ${this.receiverUPI}\n\nListening for encrypted payments...`, 'success');

      // Load initial payments from server
      console.log('Loading pending payments...');
      await this.loadPendingPaymentsFromServer();

      // Setup listeners
      this.listenForUpcomingPayments();

      // Poll server every 2 seconds for new payments
      this.startPollingServer();

      this.cdr.detectChanges();
    } 
    catch (error: any) {
      console.error('Listen error: ', error);
      this.showMessage('❌ Failed to start receiver: ' + error.message, 'error');
      this.isListening = false;
      this.isLocalServerRunning = false;
      this.isPolling = false;
      this.cdr.detectChanges();
    }
  }

// ------ Method 2: Listen for Payments ------
  private listenForUpcomingPayments(): void {
    
    console.log('Setting up payment listener.');

    this.wifiRelayService.paymentReceived$
    .pipe(takeUntil(this.destroy$))
      .subscribe((payload: RelayPayload) => {
        this.processIncomingPayment(payload);
      }); 
  }  

// ------ Method 3: Process incoming payment ------
  private async processIncomingPayment(payload: RelayPayload): Promise<void> {
    console.log('Processing incoming payment from: ' + payload.senderUPI);

    // Check if receiver is listening
    if (!this.isListening) {
      console.error('Receiver is not listening, rejecting payment');
      this.showMessage('❌ Receiver not listening - payment rejected', 'error');
      return;
    }

    try {
      // Step 1: Nonce Check (Duplicate Prevention)
      if (payload.nonce && this.processedNonces.has(payload.nonce)) {
        console.warn('⚠️ Nonce already processed:', payload.nonce);
        return;
      }

      this.isDecrypting = true;
      this.cdr.detectChanges();

      await this.delay(2000);

      let decryptedPayload: any = payload;

      // Step 2: RSA Decryption (If payload contains encryptedData)
      if (payload.encryptedData) {
        console.log('Decrypting payload with receiver private key...');
        const privateKey = await this.encryptionService.getPrivateKey();
        
        if (!privateKey) {
          throw new Error('Receiver private key missing from local storage');
        }

        const decryptedJson = await this.encryptionService.decryptWithPrivateKey(payload.encryptedData, privateKey);
        decryptedPayload = JSON.parse(decryptedJson);
        console.log('✅ Payload decrypted successfully:', decryptedPayload);
      }
      this.isDecrypting = false;

      // Step 3: Signature Verification (RSA-PSS)
      if (payload.signature && decryptedPayload.senderUpiId) {
        console.log('Verifying sender signature...');
        const senderUPI = decryptedPayload.senderUpiId || payload.senderUPI;
        
        try {
          const senderKeyRes = await this.http.get<any>(`http://10.122.798.14:8080/user/public-key/${senderUPI}`).toPromise();
          
          if (senderKeyRes && senderKeyRes.publicKey) {
            const paymentString = `${decryptedPayload.senderUpiId}|${decryptedPayload.receiverUpiId}|${decryptedPayload.amount}|${decryptedPayload.timestamp}|${decryptedPayload.nonce}`;

            const isValidSignature = await this.encryptionService.verifySignature(paymentString, payload.signature, senderKeyRes.publicKey);
            
            if (!isValidSignature) {
              console.error('Signature verification FAILED');
              this.showMessage('❌ Invalid signature: payload may be tampered', 'error');
              this.cdr.detectChanges();
              return;
            }
            console.log('✅ Signature verified successfully');
          }
        } catch (sigErr) {
          console.warn('⚠️ Could not fetch sender public key for verification:', sigErr);
        }
      }

      // Step 4: Payload Validation
      const senderUPI = decryptedPayload.senderUpiId || payload.senderUPI;
      const receiverUPI = decryptedPayload.receiverUpiId || payload.receiverUPI;
      const amount = decryptedPayload.amount || payload.amount;
      const nonce = decryptedPayload.nonce || payload.nonce;
      const timestamp = decryptedPayload.timestamp || payload.timestamp;
      const description = decryptedPayload.description || payload.description || 'WiFi P2P Payment'; 

      const validation = this.paymentValidatorService.validatePayment({
        senderUPI,
        receiverUPI,
        amount,
        nonce,
        timestamp
      });

      if (!validation.valid) {
        console.error('Validation failed:', validation.errors);
        this.showMessage('❌ Payment rejected: ' + validation.errors[0], 'error');
        this.cdr.detectChanges();
        return;
      }

      // Step 5: Store in IndexedDB
      const paymentRecord: PendingTransaction = {
        transactionId: decryptedPayload.transactionId || payload.transactionId,
        senderUpiId: senderUPI,
        receiverUpiId: receiverUPI,
        encryptedData: payload.encryptedData,
        signature: payload.signature,
        amount: amount,
        description: description,
        nonce: payload.nonce,
        status: 'RECEIVED',
        createdAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        retryCount: 0,
        type: 'WIFI'
      };

      await this.indexedDbService.saveWIFIReceivedPayment(paymentRecord);

      if (nonce) {
        this.processedNonces.add(nonce);
      }

      console.log('Payment stored locally');

      // Update UI
      this.loadPendingPayments();
        this.showMessage(`Payment Received!\n\nFrom: ${payload.senderUPI}\nAmount: ₹${(payload as any).amount}`, 'success');
        this.cdr.detectChanges();
    }
    catch (error: any) {
      console.error('Error processing payment: ', error);
      this.showMessage('❌ Error processing payment', 'error');
      this.isDecrypting = false;
      this.cdr.detectChanges();
    }
  }   

// ------ Method 4: Load PENDING payments ------
  private async loadPendingPayments(): Promise<void> {
    try{
      const payments = await this.indexedDbService.getAllWIFIReceivedPayments();

      const currentUser = (this.receiverUPI || '').trim().toLowerCase();

      this.pendingPayments = (payments || []).filter(p => (p.status === 'PENDING' || p.status === 'RECEIVED' || p.status === 'SYNCING') &&
      ((p.receiverUpiId || '').toLowerCase() === currentUser));

      console.log('Loaded ' + this.pendingPayments.length + ' pending payments');

      this.cdr.detectChanges();
    }
    catch (error: any) {
      console.error('Error loading payments: ', error);
    }
  }  

// ------ Method 5: Load Received Payments ------
  private async loadAllReceivedPayments(): Promise<void> {
    try {
      const payments = await this.indexedDbService.getAllWIFIReceivedPayments();
      const currentUser = (this.receiverUPI || '').trim().toLowerCase();

      this.rawPayments = payments || [];

      // Only show SYNCED payments in received list
      this.receivedPayments = (payments || []).filter(p => p.status === 'SYNCED' && ((p.receiverUpiId || '').toLowerCase() === currentUser)).sort((a, b) => {
        const dateA = a.createdAt || a.receivedAt || new Date().toISOString();
          const dateB = b.createdAt || b.receivedAt || new Date().toISOString();
          
          const timeA = new Date(dateA).getTime();
          const timeB = new Date(dateB).getTime();
          
          // b - a ensures descending order (newest at the top)
          return timeB - timeA;
      });

      console.log('Loaded ' + this.receivedPayments.length + ' received payments');

      this.cdr.detectChanges();
    }
    catch (error: any) {
      console.error('Error loading payments: ', error);
    }
  }

// ------ Method 6: Auto-sync when online ------
  private setupAutoSync(): void {
    console.log('Setting up auto-sync');

    window.addEventListener('online', async() => {
      console.log('Internet connected! Starting auto-sync...');
      await this.syncPendingPayments();
    });
  } 

// ------ Method 7: Sync to backend ------
  async syncPendingPayments(): Promise<void> {
    console.log('Syncing pending payments...');

    try {
      if (this.pendingPayments.length === 0) return;

      // Stop the sync if offline and inform the user
      if (!this.isOnline) {
        alert("You are currently offline.\n\nYour payments are safely saved on this device and will sync automatically the moment your internet connection is restored");
        return;
      }

      this.isSyncing = true;
      this.syncProgress = true;
      this.cdr.detectChanges();

      const results = await this.wifiRelayService.syncPaymentsToBackend(this.pendingPayments);

      // Update UI
      const synced = results.filter(r => r.success === 'SYNCED').length;
      const failed = results.filter(r => r.success === 'FAILED').length;

      this.showMessage(`Sync complete!\n✅ ${synced} synced\n❌ ${failed} failed`,'info');

      // Reload
      await this.loadPendingPayments();
      await this.loadAllReceivedPayments();

      this.cdr.detectChanges();
    }
    catch (error: any) {
      console.error('Sync error: ', error);
      this.showMessage('Sync error: ' + error.message, 'error');
    }
    finally {
      this.isSyncing = false;
      this.syncProgress = false;
      this.cdr.detectChanges();
    }
  }  

// ------ Method 8: Stop Listening ------
  async stopListening(): Promise<void> {
    console.log('Stopping WIFI receiver...');
    this.isListening = false;
    this.isLocalServerRunning = false;
    this.isPolling = false;
    this.stopPollingServer();

    try {
      await this.http.post(`${this.relayBaseUrl}/api/set-listening`, { isListening: false }).toPromise();
    } 
    catch (err) {
      console.error('Could not update node server state', err);
    }

    this.showMessage('⚪ Stopped listening', 'info');
    this.cdr.detectChanges();
  }

// ------ Method 9: Poll server for pending payments ------
  private startPollingServer(): void {
    console.log('Starting server polling...');

    this.pollingInterval = setInterval(async () => {
      try {
        const beforeCount = this.pendingPayments.length;

        await this.loadPendingPaymentsFromServer();

        const afterCount = this.pendingPayments.length;

        if (afterCount > beforeCount) {
          console.log(' New Payment! Total now: ' + afterCount);
          this.cdr.detectChanges();
        }
      }
      catch (error: any) {
        console.warn('Polling error: ', error.message);
      }
    }, 2000);    // Poll every 2 seconds
  }  

// ------ Method 10: Stop polling ------
  private stopPollingServer(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('Polling stopped');
    }
  }  

// ------ Method 11: Fetch pending payments from Node.js server ------
  private async loadPendingPaymentsFromServer(): Promise<void> {
    try {
      // Query the Node.js payment server
      const response = await this.http.get<any>(
        `${this.relayBaseUrl}/api/payments`
      ).toPromise();

      if (response && response.payments && response.payments.length > 0) {
        console.log('Fetched ' + response.payments.length + ' payments from server');

        // Store in local IndexedDB
        for (const payment of response.payments) {
          await this.processIncomingPayment(payment);
        }  
      }
    }
    catch (error: any) {
      // Server not reachabel yet 
      console.warn('Could not fetch from server: ' + error.message);
    }
  }  

// ------ Method 12: Internet connection detection (Online/Offline) ------
  private startNetworkPolling(): void {
    // Check the internet every 5 seconds
    this.networkCheckInterval = setInterval(async () => {
      
      // First, check if the physical Wi-Fi is even turned on
      if (!navigator.onLine) {
        this.updateNetworkState(false);
        return;
      }

      // If Wi-Fi is on, PROVE there is real internet
      const hasRealInternet = await this.checkActualInternet();
      this.updateNetworkState(hasRealInternet);

    }, 5000); // Runs every 5 seconds
  }

// ------ Method 13: Update Network State ------
  private updateNetworkState(isActuallyOnline: boolean): void {
    // If the state hasn't changed, do nothing
    if (this.isOnline === isActuallyOnline) return;

    this.isOnline = isActuallyOnline;
    this.cdr.detectChanges();

    if (isActuallyOnline) {
      console.log('Real Internet Confirmed!');
      
      // AUTO-SYNC MAGIC: Only trigger if we just transitioned from offline to online
      if (this.wasOffline && this.pendingPayments && this.pendingPayments.length > 0) {
        console.log('Auto-syncing pending payments in the background...');
        this.syncPendingPayments();
      }
      this.wasOffline = false; 
    } 
    else {
      console.log('❌ Lie-Fi Detected! Switched to Local Mode');
      this.wasOffline = true;
    }
  }    

// ------ Method 14: Fetch IP for QR Code from Node server ------
  private async fetchRealIpForQrCode(): Promise<void> {
    try {
      console.log('Fetching IP from Node relay...');
      
      // Connect to custom raw Node server
      const response = await fetch(`${this.relayBaseUrl}/api/my-ip`);
      
      if (!response.ok) {
        throw new Error('Node server responded with an error');
      }  
      
      const data = await response.json();
      
      if (data.url) {
        // Give the full URL to the QR Code so the Sender can scan it
        this.receiverIpUrl = data.url; 
        
        // Extract just the IP address (e.g., 192.168.x.x) for the text display
        const parsedUrl = new URL(data.url);
        this.localIp = parsedUrl.hostname;
        
        this.cdr.detectChanges(); 
        console.log('✅ Real Wi-Fi IP loaded:', this.localIp);
        console.log('✅ QR Code URL generated:', this.receiverIpUrl);
      } 
      else {
        throw new Error('URL was missing from Node response');
      }
    } 
    catch (error) {
      console.warn('⚠️ Node relay is offline. Falling back to local hostname.');
      
      const backupIp = this.resolveLocalIp();
      this.localIp = backupIp;
      this.receiverIpUrl = `http://${backupIp}:5000`;
      
      this.showMessage('Relay server offline. Using local IP.', 'error');
      this.cdr.detectChanges();
    }
  }

// ------ HELPER METHODS ------  
  
  // --- Helper: Check real Internet ---
  async checkActualInternet(): Promise<boolean> {
    // Create a controller to forcefully cancel the request
    const controller = new AbortController();
    
    // Set a strict 2-second timeout
    const timeoutId = setTimeout(() => controller.abort(), 2000); 

    try {
      await fetch(`https://www.google.com/favicon.ico?_=${new Date().getTime()}`, { 
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal // Bind the controller to the fetch
      });
      
      // If the internet is working. Clear the timeout!
      clearTimeout(timeoutId);
      return true; 
      
    } catch (error) {
      // If the 2 seconds pass, the controller aborts and triggers this catch block immediately
      return false; 
    }
  }

  async registerWithNodeServer(publicKeyBase64: string): Promise<void> {
    try {
      // Get the logged-in user's UPI
      const myUpiId = localStorage.getItem('upiId') || 'unknown@upi';

      const response = await fetch(`${this.relayBaseUrl}/api/register-receiver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          publicKey: publicKeyBase64,
          upi: myUpiId 
        })
      });

      if (!response.ok) throw new Error('Failed to register with local relay');
      console.log('✅ Registered with Node relay server!');

    } catch (error) {
      console.error('Relay registration error:', error);
    }
  }

  private showMessage(text: string, type: 'success' | 'error' | 'info'): void {
    this.message = text;
    this.messageType = type;
    this.cdr.detectChanges();

    // Clear any existing timer so messages don't disappear too fast if clicked rapidly
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
    }

    // Set a timer to automatically hide the message after 4 seconds
    this.messageTimeout = setTimeout(() => {
      this.message = '';
      this.cdr.detectChanges();
    }, 4000);
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  // Template wrappers / aliases
  goBackToDashboard(): void {
    this.goBack();
  }

  startReceiving(): Promise<void> {
    return this.startListening();
  }

  stopReceiving(): void {
    this.stopListening();
  }

  get errorMessage(): string | null {
    return this.messageType === 'error' ? this.message : null;
  }

  get successMessage(): string | null {
    return this.messageType === 'success' ? this.message : null;
  }

  get userUpiId(): string {
    return this.receiverUPI;
  }

  private resolveLocalIp(): string {
    const hostname = (window && window.location && window.location.hostname) || '';

    if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      return 'localhost';
    }

    return hostname;
  }

  // Returns a display local IP/hostname for the template
  getLocalIP(): string {
    return this.localIp || this.resolveLocalIp();
  }

  // time delay 
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
