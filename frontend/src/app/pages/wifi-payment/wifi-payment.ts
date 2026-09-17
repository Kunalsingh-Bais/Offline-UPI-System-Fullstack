import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { UserService } from '../../services/user';
import { IndexedDbService } from '../../services/indexed-db';
import { WifiKeyExchangeService } from '../../services/wifi-key-exchange';
import { WifiPaymentBuilderService } from '../../services/wifi-payment-builder';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WifiRelayService } from '../../services/wifi-relay';
import { NonceService } from '../../services/nonce';
import { NgxScannerQrcodeComponent } from 'ngx-scanner-qrcode';

interface RelayPayload {
  encryptedData: any;
  signature: string;
  nonce: string;
  timestamp: number;
  amount: number;
  description?: string;
  senderUPI: string;
  receiverUPI: string;
  transactionId: string;
  payloadVersion: number;
}

@Component({
  selector: 'app-wifi-sender',
  standalone: true,
  imports: [CommonModule, FormsModule, NgxScannerQrcodeComponent],
  templateUrl: './wifi-payment.html',
  styleUrls: ['./wifi-payment.css']
})
export class WifiPaymentComponent implements OnInit, OnDestroy {

  page: 'home' | 'input-ip' | 'sending' | 'success' | 'failed' = 'home';
  
  isScanning: boolean = false;
  isProcessing = false;
  receiverDeviceIP: string = '';
  showIPInput: boolean = true;
  isAutoDiscovering: boolean = false;
  
  senderUPI: string = '';
  senderIP: string = '';
  receiverUPI: string = '';
  amount: number = 0;
  description: string = '';
  
  message: string = '';
  messageType: 'success' | 'error' | 'info' = 'info';
  messageTimeout: any;

  isRequestingPublicKey: boolean = false;
  isEncrypting: boolean = false;
  isSigning: boolean = false;
  encryptionProgress: string = '';
  receiverPublicKeyBase64: string = '';

  receiverUrl: string = '';

  private destroy$ = new Subject<void>();

  @ViewChild('myScanner') myScanner!: NgxScannerQrcodeComponent;

  // QR Scanner Configuration (Rear Camera)
  scannerConfig: any = {
    deviceActive: 1, 
    constraints: {
      video: {
        facingMode: 'environment' 
      }
    } 
  };

  constructor(
    private userService: UserService,
    private indexedDb: IndexedDbService,
    private keyExchange: WifiKeyExchangeService,
    private paymentBuilder: WifiPaymentBuilderService,
    private router: Router,
    private wifiRelay: WifiRelayService,
    private cdr: ChangeDetectorRef,
    private nonceService: NonceService
  ) {}

  ngOnInit(): void {
    console.log('WifiPaymentComponent initialized');
    this.senderUPI = this.userService.getUpiIdFromStorage() || '';
    this.detectSenderIP();
  }

  private detectSenderIP(): void {
    try {
      this.senderIP = (window && window.location && window.location.hostname) || '127.0.0.1';
    } catch {
      this.senderIP = '127.0.0.1';
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

// ------ Method 1: Start Send Payment ------
  async startSendPayment(): Promise<void> {
    console.log('Starting send payment flow...');

    try {
      this.page = 'input-ip';
      this.isAutoDiscovering = true;
      this.showIPInput = false;
      this.receiverDeviceIP = '';
      this.receiverUPI = '';
      this.amount = 0;
      this.description = '';
      this.message = '';
      this.encryptionProgress = '';

      this.cdr.detectChanges();
    }
    catch (error: any) {
      console.error('Error starting send: ', error);
      this.page = 'failed';
      this.showMessage('❌ Error: ' + error.message, 'error');
      this.isAutoDiscovering = false;
      this.cdr.detectChanges();
    }
  }

// ------ Method 2: Start Scanning (With Android Rear Camera Override) ------
  startQrScanning(): void {
    this.isScanning = true;
    this.receiverDeviceIP = ''; 
    
    // Give Angular 100ms to load the HTML div
    setTimeout(() => {
      if (this.myScanner) {
        this.myScanner.start();

        // Hardware hardware override for Android
        setTimeout(() => {
          const scanner: any = this.myScanner;
          if (scanner && scanner.devices && scanner.devices.value) {
            const devices = scanner.devices.value;
            const backCamera = devices.find((d: any) => 
              d.label.toLowerCase().includes('back') || 
              d.label.toLowerCase().includes('rear') ||
              d.label.toLowerCase().includes('environment')
            );
            
            if (backCamera && scanner.deviceIndexActive !== backCamera.deviceId) {
              scanner.playDevice(backCamera.deviceId);
            }
          }
        }, 500);
      }
    }, 100);
  }

// ------ Method 3: Handle the successful scan ------  
  onCodeResult(result: any): void {
    if (this.receiverDeviceIP || !this.isScanning) return;
    if (!result) return;

    let scannedUrl = '';

    if (typeof result === 'string') {
      scannedUrl = result;
    } else if (result.length > 0 && result[0].value) {
      scannedUrl = result[0].value;
    }

    if (!scannedUrl) return;

    console.log("✅ QR Code Scanned! Full URL is: ", scannedUrl);
    this.receiverUrl = scannedUrl;
    
    try {
      const parsedUrl = new URL(scannedUrl);
      this.receiverDeviceIP = parsedUrl.hostname;
      console.log("🎯 Extracted Target IP: ", this.receiverDeviceIP);

      this.isScanning = false;
    } 
    catch (error) {
      this.receiverDeviceIP = scannedUrl;
      console.error('❌ Invalid QR Code format:', error);
    }

    this.stopScanning();
    this.cdr.detectChanges();
  }

// ------ Method 4: Stop Scanning ------
  stopScanning(): void {
    this.isScanning = false;
    if (this.myScanner) {
      this.myScanner.stop();
    }
  }  

// ------ Method 5: Flip Camera (Fallback) ------
  flipCamera(): void {
    const scanner: any = this.myScanner; 
    if (scanner && scanner.devices && scanner.devices.value) {
      const devices = scanner.devices.value;
      if (devices.length > 1) {
        const currentIndex = scanner.deviceIndexActive || 0;
        const nextIndex = (currentIndex + 1) % devices.length; 
        scanner.playDevice(devices[nextIndex].deviceId);
      } else {
        this.showMessage('No other camera found on this device', 'info');
      }
    }
  }

// ------ Method 6 : Send Payment ------
  async sendPayment(): Promise<void> {
    console.log('🔘 Send Payment button clicked!');

    console.log('📝 Captured Note:', this.description);

    // 1. Validation BEFORE changing any UI screens
    if (!this.amount || this.amount <= 0) {
      console.warn('⚠️ Validation Failed: Amount is 0 or empty');
      this.showMessage('Please enter a valid amount first', 'error');
      return; 
    }

    if (!this.receiverDeviceIP) {
      console.warn('⚠️ Validation Failed: No Receiver IP');
      this.showMessage('Scan the receiver QR code first', 'error');
      return;
    }

    try {
      // 2. Now change the UI to the loading screen
      this.page = 'sending';
      this.isProcessing = true;
      this.encryptionProgress = 'Connecting to receiver...';
      this.isRequestingPublicKey = true;
      this.cdr.detectChanges();

      console.log(`📡 Reaching out to: http://${this.receiverDeviceIP}:5000/api/public-key`);
      await this.delay(1000);

      // Step 1: Request Receiver's Public Key & UPI from Node Server
      try {
        const response = await fetch(`http://${this.receiverDeviceIP}:5000/api/public-key`);
        
        if (!response.ok) throw new Error('Could not reach receiver device on the network');
        
        const data = await response.json();
        
        if (!data.publicKey || !data.upi) {
          throw new Error('Receiver did not provide complete details');
        }

        // Save the details fetched from the Node server
        this.receiverPublicKeyBase64 = data.publicKey;
        this.receiverUPI = data.upi; 
        
        console.log(`✅ Receiver details fetched! Target UPI: ${this.receiverUPI}`);
      }
      catch (error: any) {
        this.page = 'failed';
        this.showMessage('❌ Failed to connect: ' + error.message, 'error');
        this.isProcessing = false;
        this.isRequestingPublicKey = false;
        this.encryptionProgress = '';
        this.cdr.detectChanges();
        return;
      }

      this.isRequestingPublicKey = false;

      // check if they are trying to send money to their own account
      if (this.senderUPI === this.receiverUPI) {
        this.page = 'input-ip'; // Send them back to the input screen
        this.isProcessing = false;
        this.showMessage('You cannot send money to yourself', 'error');
        this.cdr.detectChanges();
        return;
      }

      // Step 2: Create transaction ID and nonce
      const transactionId = 'TXN_' + Date.now() + '_' + Math.random().toString(36).substr(2,9);
      const nonce = this.nonceService.generateNonce();

      const finalDescription = (this.description && this.description.trim() !== '') ? this.description : 'WiFi P2P Payment';

      // Step 3: Build plain payload
      this.encryptionProgress = 'Building secure payload...';
      this.cdr.detectChanges();

      const plainPayload = {
        transactionId: transactionId,
        senderUpiId: this.senderUPI,
        receiverUpiId: this.receiverUPI,
        amount: this.amount,
        description: finalDescription ,
        timestamp: Date.now(),
        nonce: nonce,
        payloadVersion: 2
      };

      // Step 4: Generate Signature
      this.encryptionProgress = 'Signing payment...';
      this.isSigning = true;
      this.cdr.detectChanges();
      await this.delay(1000);

      let signature: string;
      try {
        signature = await this.paymentBuilder.generateSignature(plainPayload as any);
      } 
      catch (error: any) {
        this.page = 'failed';
        this.showMessage('❌ Failed to sign: ' + error.message, 'error');
        this.isProcessing = false;
        this.isSigning = false;
        this.encryptionProgress = '';
        this.cdr.detectChanges();
        return;
      }
      this.isSigning = false;

      // Step 5: Encrypt Payload
      this.encryptionProgress = 'Encrypting data...';
      this.isEncrypting = true;
      this.cdr.detectChanges();
      await this.delay(1000);

      let encryptedData: string;
      try {
        encryptedData = await this.paymentBuilder.encryptPayloadForWIFI(
          plainPayload as any, this.receiverPublicKeyBase64);
      } 
      catch (error: any) {
        this.page = 'failed';
        this.showMessage('❌ Failed to encrypt: ' + error.message, 'error');
        this.isProcessing = false;
        this.isEncrypting = false;
        this.encryptionProgress = '';
        this.cdr.detectChanges();
        return;
      }
      this.isEncrypting = false;

      // Step 6: Create Final Payload
      this.encryptionProgress = 'Preparing transfer...';
      this.cdr.detectChanges();

      const finalPayload: RelayPayload = {
        transactionId: transactionId,
        encryptedData: encryptedData,
        signature: signature,
        nonce: nonce,
        timestamp: Date.now(),
        senderUPI: this.senderUPI,
        receiverUPI: this.receiverUPI,
        amount: this.amount,
        description: finalDescription,
        payloadVersion: 2 
      };

      // Step 7: Save to Local Storage First (Offline safety)
      this.encryptionProgress = 'Saving record locally...';
      this.cdr.detectChanges();

      try {
        await this.indexedDb.saveWIFISentPayment({
          ...finalPayload,
          status: 'SENT',
          createdAt: new Date().toISOString(),
          retryCount: 0
        } as any);
      } 
      catch (error: any) {
        console.warn('⚠️ Could not save locally, but proceeding with transfer');
      }

      // Step 8: Send to Receiver via Node Relay
      this.encryptionProgress = 'Transferring funds...';
      this.cdr.detectChanges();
      await this.delay(1000);

      let response: any;
      try {
        response = await this.wifiRelay.sendPaymentViaWiFi(this.receiverDeviceIP, finalPayload);
      } 
      catch (error: any) {
        this.page = 'failed';
        this.showMessage('❌ Transfer interrupted: ' + error.message, 'error');
        this.isProcessing = false;
        this.encryptionProgress = '';
        this.cdr.detectChanges();
        return;
      }

      // SUCCESS SCREEN
      if (response.success) {
        this.page = 'success';
        this.isProcessing = false;
        this.encryptionProgress = '';

        this.showMessage(`✅ Success! ₹${this.amount} sent to ${this.receiverUPI}`, 'success');
        this.cdr.detectChanges();

        // Reset the UI back to normal after 5 seconds
        setTimeout(() => {
          this.receiverUPI = '';
          this.amount = 0;
          this.description = '';
          this.receiverDeviceIP = '';
          this.receiverPublicKeyBase64 = '';
          this.page = 'home';
          this.cdr.detectChanges();
        }, 5000);
      } 
      else {
        this.page = 'failed';
        this.showMessage('Receiver rejected transfer: ' + response.message, 'error');
        this.isProcessing = false;
        this.encryptionProgress = '';
        this.cdr.detectChanges();
      }
    } 
    catch (error: any) {
      this.page = 'failed';
      this.isProcessing = false;
      this.isRequestingPublicKey = false;
      this.isEncrypting = false;
      this.isSigning = false;
      this.encryptionProgress = '';
      this.showMessage('❌ Fatal Error: ' + error.message, 'error');
      this.cdr.detectChanges();
    }
  }

// ------ Helper Methods ------  

  private showMessage(text: string, type: 'success' | 'error' | 'info'): void {
    this.message = text;
    this.messageType = type;
    this.cdr.detectChanges();

    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
    }

    this.messageTimeout = setTimeout(() => {
      this.message = '';
      this.cdr.detectChanges();
    }, 4000);
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}