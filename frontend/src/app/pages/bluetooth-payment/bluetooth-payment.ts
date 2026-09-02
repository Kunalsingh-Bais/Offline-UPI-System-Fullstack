import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BLEDevice, BLEPayload, BluetoothService } from '../../services/bluetooth';
import { UserService } from '../../services/user';
import { IndexedDbService } from '../../services/indexed-db';
import { BluetoothKeyExchangeService } from '../../services/bluetooth-key-exchange';
import { BluetoothPaymentBuilderService } from '../../services/bluetooth-payment-builder';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WifiRelayService } from '../../services/wifi-relay';

interface RelayPayload {
  encryptedData: any;
  signature: string;
  nonce: string;
  timestamp: number;
  amount: number;
  senderUPI: string;
  receiverUPI: string;
  transactionId: string;
  payloadVersion: number;
}

@Component({
  selector: 'app-ble-sender',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bluetooth-payment.html',
  styleUrls: ['./bluetooth-payment.css']
})
export class BluetoothPaymentComponent implements OnInit, OnDestroy {

  page: 'home' | 'scan' | 'connect' |'input-ip' | 'sending' | 'success' | 'failed' = 'home';
  
  devices: BLEDevice[] = [];
  isScanning = false;
  isProcessing = false;
  receiverDeviceIP: string = '';
  showIPInput: boolean = true;
  isAutoDiscovering: boolean = false;
  discoveredIP: string | null = null;
  
  connectedDevice: BLEDevice | null = null;
  senderUPI: string = '';
  senderIP: string = '';
  receiverUPI: string = '';
  amount: number = 0;
  
  message: string = '';
  messageType: 'success' | 'error' | 'info' = 'info';

  private destroy$ = new Subject<void>();

  constructor(
    private bluetooth: BluetoothService,
    private userService: UserService,
    private indexedDb: IndexedDbService,
    private keyExchange: BluetoothKeyExchangeService,
    private paymentBuilder: BluetoothPaymentBuilderService,
    private router: Router,
    private wifiRelay: WifiRelayService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    console.log('BleSenderComponent initialized');
    this.senderUPI = this.userService.getUpiIdFromStorage() || '';
    this.detectSenderIP();
  }

  private detectSenderIP(): void {
    try {
      this.senderIP = (window && window.location && window.location.hostname) || '127.0.0.1';
      console.log('Sender IP detected: ' + this.senderIP);
    } catch {
      this.senderIP = '127.0.0.1';
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

// ------ Method 1: Start Scan ------
  async startScan(): Promise<void> {
    
    console.log('Starting BLE scan...');
    
    try {
      this.isScanning = true;
      this.page = 'scan';

      // Initialize BLE
      await this.bluetooth.initializeBLE();
      console.log('✅ BLE initialized');

      // Scan for devices
      this.devices = await this.bluetooth.scanForDevices();
      console.log('✅ Scan complete. Found: ' + this.devices.length + ' devices');

      if (this.devices.length === 0) {
        this.showMessage('❌ No devices found. Make sure receiver is on Bluetooth', 'error');
        this.page = 'home';
      }

    } catch (error: any) {
      console.error('Scan error: ', error);
      this.showMessage('❌ Scan failed: ' + error.message, 'error');
      this.page = 'home';
    } finally {
      this.isScanning = false;
    }
  }

// ------ Method 2: Select Device ------
  async selectDevice(device: BLEDevice): Promise<void> {
    
    console.log('Selecting device: ' + device.name);
    
    try {
      this.isProcessing = true;
      this.page = 'connect';

      // Connect
      await this.bluetooth.connectToDevice(device.id);
      console.log('✅ Connected to ' + device.name);

      this.connectedDevice = device;
      this.showMessage('✅ Connected to ' + device.name, 'success');

      // Step 1: Generate local key pair
      console.log('Step 1: Generating key pair...');
      await this.keyExchange.generateLocalKeyPair();
      console.log('✅ Key pair generated');

      // Step 2: Exchange keys with receiver
      console.log('Step 2: Exchanging keys...');
      await this.exchangeKeys();
      console.log('✅ Keys exchanged');

      // Move to send page
      this.page = 'sending';
      this.showMessage('✅ Ready to send payment', 'success');

    } catch (error: any) {
      console.error('Selection error: ', error);
      this.showMessage('❌ Connection failed: ' + error.message, 'error');
      this.page = 'scan';
    } finally {
      this.isProcessing = false;
    }
  }

// ------ Method 3: Exchange Keys ------
  private async exchangeKeys(): Promise<void> {
    
    console.log('Exchanging encryption keys...');
    
    try {
      // Get our public key
      const ourPublicKey = this.keyExchange.getLocalPublicKey();
      console.log('Our public key: ' + ourPublicKey.substring(0, 50) + '...');

      // Send to receiver
      const keyExchangePayload = JSON.stringify({
        version: 1,
        algorithm: 'RSA-OAEP',
        keySize: 4096,
        publicKey: ourPublicKey,
        timestamp: Date.now()
      });

      await this.bluetooth.sendKeyExchange(ourPublicKey);
      console.log('✅ Sent our public key');

      // Wait for receiver's key (simulate - in real scenario, listen to notifications)
      // For now, we assume receiver will send back their key
      await this.waitForReceiverKey();

    } catch (error: any) {
      console.error('Key exchange error: ', error);
      throw error;
    }
  }

  // Wait for receiver's key
  private waitForReceiverKey(): Promise<void> {
    return new Promise((resolve) => {
      console.log('Waiting for receiver key exchange...');

      // Listen for key exchange from receiver
      this.bluetooth.getReceivedData()
        .pipe(takeUntil(this.destroy$))
        .subscribe((payload: BLEPayload | null) => {
          if (payload && payload.type === 'KEY_EXCHANGE') {
            console.log('✅ Received receiver public key');
            
            // Store receiver's public key
            if (this.connectedDevice) {
              this.keyExchange.storePeerPublicKey(
                this.connectedDevice.id,
                this.connectedDevice.name,
                payload.data
              );
            }

            resolve();
          }
        });

      // Timeout after 30 seconds
      setTimeout(() => {
        console.warn('⚠️ Key exchange timeout - proceeding anyway');
        resolve();
      }, 30000);
    });
  }

// ------ Method 4: Start Payment ------
  async startSendPayment(): Promise<void> {
    console.log('Starting send payment flow...');

    try {
      this.page = 'input-ip';

      // Try auto-discovery first
      console.log('Attempting auto-discovery...');
      this.isAutoDiscovering = true;

      this.showIPInput = false;
      this.receiverDeviceIP = '';
      this.receiverUPI = '';
      this.amount = 0;
      this.message = '';

      this.cdr.detectChanges();

      this.discoveredIP = await this.wifiRelay.discoverDeviceOnNetwork();

      if (this.discoveredIP) {
        console.log('Device found at: ' + this.discoveredIP);
        this.receiverDeviceIP = this.discoveredIP;
        this.showIPInput = false;
        console.log('Device IP set, waiting for user input...');
      }
      else {
        console.log('Auto-discovery failed, showing manual IP input');
        this.showIPInput = true;
        this.receiverDeviceIP = '';
        this.discoveredIP = null;
        this.showMessage('Receiver is not active. Enter the receiver IP manually.', 'info');
      }

      this.isAutoDiscovering = false;
      this.cdr.detectChanges();
    }
    catch (error: any) {
      console.error('Error starting send: ', error);
      this.page = 'failed';
      this.showMessage('Error: ' + error.message, 'error');
      this.isAutoDiscovering = false;
    }
  }

// ------ Method 5 : Send Payment ------
  async sendPayment(): Promise<void> {
    
    console.log('Sending payment via Wifi relay...');
    
    try {
      this.page = 'sending';

      // Validation
      if (!this.receiverUPI || this.receiverUPI.trim() === '') {
        this.showMessage('Enter receiver UPI', 'error');
        return;
      }

      if (!this.amount || this.amount <= 0) {
        this.showMessage('Enter valid amount', 'error');
        return;
      }

      if (this.senderUPI === this.receiverUPI) {
        this.showMessage('Cannot send to yourself', 'error');
        return;
      }

      if (!this.receiverDeviceIP) {
        this.showMessage('Enter or discover receiver device IP', 'error');
        return;
      }

      this.isProcessing = true;
      this.cdr.detectChanges();

      console.log('✅ Validation passed');
      console.log('IP:', this.receiverDeviceIP);
      console.log('To:', this.receiverUPI);
      console.log('Amount:', this.amount);

      // Step 1: Create payment
      const transactionId = 'TXN_' + Date.now() + '_' + Math.random().toString(36).substr(2,9);

      // Generate nonce (for replay attack prevention)
      const nonce = this.generateNonce();

      const paymentData = {
        transactionId: transactionId,
        senderUpiId: this.senderUPI,
        receiverUpiId: this.receiverUPI,
        amount: this.amount,
        timestamp: Date.now(),
        nonce: nonce,
        status: 'CREATED'
      };

      // Step 2: Encrypt
      const encrypted: any = await this.paymentBuilder.encryptPayloadForBLE(
          paymentData as any,
          'relay-device'
        );

      // Step 3: Generate signature
      const signature = await this.paymentBuilder.generateSignature(paymentData as any);
      console.log('Signature: ' + signature.substring(0, 32) + '...');

      // Step 4: Create relay payload
      const relayPayload: RelayPayload = { 
        encryptedData: encrypted,
        signature: signature,
        amount: this.amount,
        nonce: nonce,
        timestamp: Date.now(),
        senderUPI: this.senderUPI,
        receiverUPI: this.receiverUPI,
        transactionId: transactionId,
        payloadVersion: 1 
      };

      // Step 5: Save locally first (backup)
      await this.indexedDb.saveBLESentPayment(paymentData as any);

      // Step 6: Send via wifi relay
      const response = await this.wifiRelay.sendPaymentViaWiFi(this.receiverDeviceIP, relayPayload);

      console.log('Response: ', response);

      if (response.success) {
        console.log('SUCCESS! Setting page to success');
        this.page = 'success';
        this.showMessage(`✅ Payment Sent!\n\nTo: ${this.receiverUPI}\nAmount: ₹${this.amount}\n\nStored on recevier device`, 'success');

        setTimeout(() => {
          this.receiverUPI = '';
          this.amount = 0;
          this.page = 'home';
        }, 3000);

        this.cdr.detectChanges();
      }
      else {
        this.page = 'failed';
        this.showMessage('Send failed: ' + response.message, 'error');
      }
    }
    catch (error: any) {
      console.error('Send error: ', error);
      this.page = 'failed';
      this.showMessage('❌ Send failed: ' + error.message, 'error');
    }
  }

// ------ Helper Method ------  

  private generateNonce(): string {
    return Math.random().toString(36).substr(2, 16);
  }

  private showMessage(text: string, type: 'success' | 'error' | 'info'): void {
    this.message = text;
    this.messageType = type;
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  async disconnectDevice(): Promise<void> {
    try {
      await this.bluetooth.disconnectDevice();
    }
    catch (err) {
      console.warn('Error during disconnect', err);
    }

    if (this.connectedDevice) {
      this.connectedDevice.connected = false;
      this.connectedDevice = null;
    }

    this.page = 'home';
  }
}