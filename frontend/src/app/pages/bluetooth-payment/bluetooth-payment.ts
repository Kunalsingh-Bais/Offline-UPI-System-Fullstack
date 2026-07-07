import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BLEDevice, BLEPayload, BluetoothService } from '../../services/bluetooth';
import { Subject, takeUntil, timestamp } from 'rxjs';
import { EncryptionService } from '../../services/encryption';
import { IndexedDbService, PendingTransaction } from '../../services/indexed-db';

export interface BLETransaction {
  id?: string;
  role: 'sender' | 'receiver';
  remoteDeviceId: string;
  remoteDeviceName: string;
  amount: number;
  description: string;
  encryptedData: string;
  status: 'pending' | 'sent' | 'received' | 'confirmed' | 'failed';
  transactionHash: string;
  createdAt: string;
  direction: 'outgoing' | 'incoming';
}

@Component({
  selector: 'app-bluetooth-payment',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bluetooth-payment.html',
  styleUrl: './bluetooth-payment.css',
})
export class BluetoothPaymentComponent implements OnInit, OnDestroy {

  // State properties
  currentPage: 'home' | 'scan' | 'send-payment' | 'receive-payment' | 'transaction' = 'home';

  // Device management
  deviceList: BLEDevice[] = [];
  connectedDevice: BLEDevice | null = null;
  isScanning = false;
  isConnected = false;
  connectionStatus = 'disconnected';

  // Payment form
  paymentAmount = 0;
  paymentDescription = '';
  pairingPin = '';

  // Transaction state
  currentTransaction: BLETransaction | null = null;
  receivedPaymentRequest: BLEPayload | null = null;
  isProcessing = false;
  notification: { type: 'success' | 'error' | 'info'; message: string } | null = null;

  // Device pairing
  requiresPairing = true;
  enteredPin = '';
  pairingAttempts = 0;

  private destroy$ = new Subject<void>();
  private notificationTimeout: any;

  constructor(private bluetoothService: BluetoothService, private encryptionService: EncryptionService, private indexedDbService: IndexedDbService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.setupSubscriptions();
  }

// ------ SETUP Observables ------  
  private setupSubscriptions(): void {
    // Listen to device list changes
    this.bluetoothService.getDeviceList()
      .pipe(takeUntil(this.destroy$))
      .subscribe(devices => {
        this.deviceList = devices;
        this.cdr.detectChanges();
        console.log('Device list updated: ', devices.length);
      });

    // Listen to connected device  
    this.bluetoothService.getConnectedDevice()
      .pipe(takeUntil(this.destroy$))  
      .subscribe(device => {
        this.connectedDevice = device;
        this.cdr.detectChanges();
        console.log('Connected device: ', device?.name);
      });

    // Listen to scanning status  
    this.bluetoothService.getIsScanning()
      .pipe(takeUntil(this.destroy$))
      .subscribe(scanning => {
        this.isScanning = scanning;
        this.cdr.detectChanges();
      });
      
    // Listen to connection status  
    this.bluetoothService.getIsConnected()
      .pipe(takeUntil(this.destroy$))
      .subscribe(connected => {
        this.isConnected = connected;
        this.cdr.detectChanges();
      });
      
    // Listen to connection status message  
    this.bluetoothService.getConnectionStatus()
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        this.connectionStatus = status;
        this.cdr.detectChanges();
      });
      
    // Listen to incoming payment requests  
    this.bluetoothService.getReceivedData()
      .pipe(takeUntil(this.destroy$))
      .subscribe(payload => {
        if (payload?.type === 'PAYMENT_REQUEST') {
          console.log('Received payment request!');
          this.handleIncomingPayment(payload);
        }
        else if (payload?.type === 'PAYMENT_ACK') {
          console.log('Received acknowledgment');
          this.handleAcknowledgment(payload);
        }
      });  
  }

// ------ Page 1: Home/Menu ------
  goToHome(): void {
    this.currentPage = 'home';
    this.resetForm();
    this.cdr.detectChanges();
  }  

// ------ Page 2: Scan for devices ------
  async startDeviceScan(): Promise<void> {
    try {
      this.isProcessing = true;
      this.showNotification('info', '🔍 Scanning for nearby devices...');

      const devices = await this.bluetoothService.scanForDevices();

      if (devices.length === 0) {
        this.showNotification('error', '❌ No devices found. Make sure Bluetooth is on.');
        return;
      }

      this.currentPage = 'scan';
      this.showNotification('success', `✅ Found ${devices.length} device(s)`);
    }
    catch (error: any) {
      console.error('Scan error: ', error);
      this.showNotification('error', `❌ Scan failed: ${error.message}`);
    }
    finally {
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }  

// ------ Connect to selected device ------  
  async connectToDevice(device: BLEDevice): Promise<void> {
    try {
      this.isProcessing = true;
      this.showNotification('info', `Connecting to ${device.name}...`);

      await this.bluetoothService.connectToDevice(device.id);

      this.showNotification('success', `✅ Connected to ${device.name}`);
      this.connectedDevice = device;

      // Move to pairing step
      this.requiresPairing = true;
      this.enteredPin = '';
      this.pairingAttempts = 0;
    }
    catch (error: any) {
      console.error('Connection error: ', error);
      this.showNotification('error', `❌ Connection failed: ${error.message}`);
    }
    finally {
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }
  
// ------ Device pairing with PIN ------
  async confirmPairingPin(): Promise<void> {
    const VALID_PIN = '1234';  // TODO: Generate and exchange securely

    if (this.enteredPin !== VALID_PIN) {
      this.pairingAttempts++;
      this.showNotification('error', `❌ Invalid PIN (${this.pairingAttempts}/3)`);

      if (this.pairingAttempts >= 3) {
        this.showNotification('error', '❌ Too many attempts. Disconnecting...');
        await this.bluetoothService.disconnectDevice();
        this.goToHome();
      }

      this.enteredPin = '';
      return;
    }

    // PIN correct
    this.requiresPairing = false;
    this.showNotification('success', '✅ Device paired successfully');
    console.log('Device pairing confirmed');
    this.cdr.detectChanges();
  } 

// ------ Page 3: Send payment ------
  // Sender initiates payment
  async goToSendPayment(): Promise<void> {
    if (!this.connectedDevice) {
      this.showNotification('error', '❌ Not connected to any device');
      return;
    }

    this.currentPage = 'send-payment';
    this.paymentAmount = 0;
    this.paymentDescription = '';
    this.cdr.detectChanges();
  }  

// ------ Send payment VIA bluetooth ------
  async sendPaymentViaBluetooth(): Promise<void> {
    if (!this.connectedDevice) {
      this.showNotification('error', '❌ Device disconnected');
      return;
    }

    if (!this.paymentAmount || this.paymentAmount <=0) {
      this.showNotification('error', '❌ Enter valid amount');
      return;
    }

    try {
      this.isProcessing = true;
      this.showNotification('info', `⏳ Processing ₹${this.paymentAmount}...`);

      // Step 1: Create payment data
      const paymentData = {
        senderUPI: 'current-user-upi@upi',  // TODO: Get from auth service
        receiverUPI: 'receiver-upi@upi', // Will be exchanged during pairing
        amount: this.paymentAmount,
        description: this.paymentDescription,
        timestamp: Date.now(),
        transactionHash: this.generateTransactionHash()
      };

      console.log('Payment data: ', paymentData);

      // Step 2: Generate AES key
      const aesKey = await this.encryptionService.generateAESKey();

      // Step 3: Encrypt payment data
      const encryptedData = await this.encryptionService.encryptData(aesKey,paymentData);

      console.log('Payment encrypted');

      // Step 4: Send via Bluetooth
      await this.bluetoothService.sendPaymentData(encryptedData);
      console.log('Payment sent');

      // Step 5: Store as pending transaction
      const bleTransaction: BLETransaction = {
        role: 'sender',
        remoteDeviceId: this.connectedDevice.id,
        remoteDeviceName: this.connectedDevice.name,
        amount: this.paymentAmount,
        description: this.paymentDescription,
        encryptedData: encryptedData,
        status: 'sent',
        transactionHash: paymentData.transactionHash,
        createdAt: new Date().toISOString(),
        direction: 'outgoing'
      };

      // Save to IndexedDB (with BLE prefix to differentiate)
      const PendingTransaction: PendingTransaction = {
        transactionId: `BLE_${paymentData.transactionHash}`,
        senderUpiId: paymentData.senderUPI,
        receiverUpiId: paymentData.receiverUPI,
        amount: paymentData.amount,
        description: `BLE Payment via ${this.connectedDevice.name}`,
        encryptedData: encryptedData,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        retryCount: 0
      };

      await this.indexedDbService.savePendingTransaction(PendingTransaction);
      console.log('Saved to IndexedDB');

      // Show success
      this.currentTransaction = bleTransaction;
      this.currentPage = 'transaction';
      this.showNotification('success', `✅ Payment Sent!\n\nAmount: ₹${this.paymentAmount}\nTo: ${this.connectedDevice.name}\n\n Waiting for confirmation...`);

      // Wait for ACK from receiver
      this.waitForAcknowledgment();
    }
    catch(error: any) {
      console.error('Send payment error: ', error);
      this.showNotification('error', `❌ Failed to send: ${error.message}`);
    }
    finally {
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }  

// ------ Wait for payment acknowledgment ------
  private waitForAcknowledgment(maxWait = 30000): void {
    const startTime = Date.now();

    const checkAck = setInterval(() => {
      const elapsed = Date.now() - startTime;
      
      // Check if we received ACK
      if (this.currentTransaction?.status === 'confirmed') {
        clearInterval(checkAck);
        console.log('Payment confirmed by receiver');
        return;
      }

      // Timeout after 30 seconds
      if (elapsed > maxWait) {
        clearInterval(checkAck);
        this.showNotification('error', '⏱️ No response from receiver. Payment pending.');
        console.log('⏱️ ACK timeout');
      }
    }, 500);
  }

// ------ Handle incoming payment ------ 
  // Receiver receives payment request
  private async handleIncomingPayment(payload: BLEPayload): Promise<void> {
    try {
      console.log('Processing incoming payment...');

      // Store Encrypted data as it is 
      // Backend will decrypt when syncing

      this.currentPage = 'receive-payment';
      this.receivedPaymentRequest = payload;

      // Show generic message
      this.showNotification('info', `💰 Payment Request Received\n\nFrom: ${this.connectedDevice?.name}\n\nConfirm to accept and save`);

      this.cdr.detectChanges();
    }
    catch (error: any) {
      console.error('Error processing payment: ', error);
      this.showNotification('error', '❌ Failed to process payment');
    }
  }  

// ----- Receiver Confirms payment ------
  async confirmReceivedPayment(accept: boolean): Promise<void> {
    if (!this.receivedPaymentRequest) return;

    try {
      this.isProcessing = true;

      if(accept) {
        console.log('Receiver accepting payment');

        // Just store encrypted data (Don't decrypt)
        const PendingTransaction: PendingTransaction = {
          transactionId: `BLE_RCV_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          senderUpiId: 'pending-verification', // Will be filled by backend
          receiverUpiId: 'current-user@upi', // TODO: Get from auth service
          amount: 0,
          description: `BLE Received from ${this.connectedDevice?.name}`,
          encryptedData: this.receivedPaymentRequest.data, // Store encrypted as it is
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          retryCount: 0
        };

        await this.indexedDbService.savePendingTransaction(PendingTransaction);
        console.log('Saved received payment (encrypted) to IndexedDB');

        // Send ACK back to sender
        await this.bluetoothService.sendAcknowledgment(true, 'Payment received and saved');

        console.log('Sent confirmation to sender');

        // Show generic success message
        this.showNotification('success', `Payment Received!\n\nFrom: ${this.connectedDevice?.name}\n\nPayment saved locally.\n Will sync to backend when online. \nCheck dashboard for details.`);

        if(this.currentTransaction) {
          this.currentTransaction.status = 'confirmed';
        }
      }
      else {
        console.log('Receiver rejecting payment');

        await this.bluetoothService.sendAcknowledgment(false, 'Payment rejected by receiver');

        this.showNotification('error', 'Payment rejected');
      }

      // Return to home after 3 seconds
      setTimeout(() => {
        this.goToHome();
      }, 3000);
    }
    catch (error: any) {
      console.error('Confirmation error: ', error);
      this.showNotification('error', `❌ Error: ${error.message}`);
    }
    finally {
      this.isProcessing = false;
      this.cdr.detectChanges();
    }
  }  
}
