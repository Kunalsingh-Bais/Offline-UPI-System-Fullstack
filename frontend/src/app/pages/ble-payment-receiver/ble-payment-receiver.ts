import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, timestamp } from 'rxjs/operators';
import { UserService } from '../../services/user';
import { IndexedDbService, PendingTransaction } from '../../services/indexed-db';
import { BluetoothPayloadValidatorService } from '../../services/bluetooth-payload-validator';
import { RelayPayload, WifiRelayService } from '../../services/wifi-relay';
import { HttpClient } from '@angular/common/http';
import { BluetoothPaymentBuilderService } from '../../services/bluetooth-payment-builder';
import { EncryptionService } from '../../services/encryption';

@Component({
  selector: 'app-ble-receiver',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ble-payment-receiver.html',
  styleUrls: ['./ble-payment-receiver.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BlePaymentReceiverComponent implements OnInit, OnDestroy {

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
  isPolling: boolean = false;
  isSyncing: boolean = false; 
  syncProgress: boolean = false;
  isDecrypting: boolean = false;

  // Local IP shown to sender devices
  private localIp: string = '';

  paymentTab: 'received' | 'pending' = 'received'; 
  receivedPayments: any[] = [];
  processedNonces: Set<string> = new Set();

  private pollingInterval: any;
  
  private destroy$ = new Subject<void>();
  private pollingSubscription: any;

  constructor(
    private userService: UserService,
    private indexedDbService: IndexedDbService,
    private paymentValidatorService: BluetoothPayloadValidatorService,
    private router: Router,
    private wifiRelayService: WifiRelayService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private paymentBuilder: BluetoothPaymentBuilderService,
    private encryptionService: EncryptionService,
  ) {}

  ngOnInit(): void {
    console.log('BleReceiverComponent initialized');
    this.receiverUPI = this.userService.getUpiIdFromStorage() || '';
    this.userUPI = this.receiverUPI;
    this.setupAutoSync();
    this.loadAllReceivedPayments();
    this.loadPendingPayments();

    // Attempt to determine a best-effort local hostname/IP for display
    this.localIp = this.resolveLocalIp();
  }

  ngOnDestroy(): void {
    this.startPollingServer();
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
    const pendingSync = this.receivedPayments.filter((p) => p.status === 'PENDING' || p.status === 'RECEIVED' || p.status === 'SYNCING').length;
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
      await this.indexedDbService.clearBLESyncedPayments();
      await this.loadAllReceivedPayments();
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error clearing synced payments', err);
    }
  }

// ------ Method 1: Start Listening ------
  async startListening(): Promise<void> {
    
    console.log('Starting WiFi receiver...');
    
    try {
      // Start local server
      this.wifiRelayService.startLocalServer();
      this.isListening = true;
      this.isLocalServerRunning = true;
      this.isPolling = true;

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
          const senderKeyRes = await this.http.get<any>(`http://10.11.73.26:8080/user/public-key/${senderUPI}`).toPromise();
          
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
        senderUpiId: payload.senderUPI,
        receiverUpiId: payload.receiverUPI,
        encryptedData: payload.encryptedData,
        signature: payload.signature,
        amount: (payload as any).amount,
        nonce: payload.nonce,
        status: 'RECEIVED',
        createdAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        retryCount: 0,
        type: 'BLE'
      };

      await this.indexedDbService.saveBLEReceivedPayment(paymentRecord);

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
      const payments = await this.indexedDbService.getAllBLEReceivedPayments();

      this.pendingPayments = (payments || []).filter(p => p.status === 'PENDING' || p.status === 'RECEIVED' || p.status === 'SYNCING');
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
      const payments = await this.indexedDbService.getAllBLEReceivedPayments();
      // Only show SYNCED payments in received list
      this.receivedPayments = (payments || []).filter(p => p.status === 'SYNCED') || [];
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
      this.isSyncing = true;
      this.syncProgress = true;
      this.cdr.detectChanges();

      const results = await this.wifiRelayService.syncPaymentsToBackend(this.pendingPayments);

      // Update UI
      const synced = results.filter(r => r.status === 'SYNCED').length;
      const failed = results.filter(r => r.status === 'FAILED').length;

      this.showMessage(`Sync complete!\n✅ ${synced} synced\n❌ ${failed} failed`,'info');

      // Reload
      await this.loadPendingPayments();
      await this.loadAllReceivedPayments();
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
  stopListening(): void {
    console.log('Stopping BLE receiver...');
    this.isListening = false;
    this.isLocalServerRunning = false;
    this.isPolling = false;
    this.stopPollingServer();
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
        'http://10.11.73.26:5000/api/payments'
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

// ------ HELPER METHODS ------  
  private showMessage(text: string, type: 'success' | 'error' | 'info'): void {
    this.message = text;
    this.messageType = type;
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
      return '10.11.73.26';
    }

    return hostname;
  }

  // Returns a displayable local IP/hostname for the template
  getLocalIP(): string {
    return this.localIp || this.resolveLocalIp();
  }
}