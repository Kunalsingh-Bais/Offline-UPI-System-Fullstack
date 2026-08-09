import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BLEDevice, BLEPayload, BluetoothService } from '../../services/bluetooth';
import { scan, Subject, takeUntil, timestamp } from 'rxjs';
import { EncryptionService } from '../../services/encryption';
import { IndexedDbService, PendingTransaction } from '../../services/indexed-db';
import { Router } from '@angular/router';
import { BluetoothPaymentBuilderService, EncryptedBLEPayload } from '../../services/bluetooth-payment-builder';
import { BluetoothPayloadValidatorService } from '../../services/bluetooth-payload-validator';
import { UserService } from '../../services/user';

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

  constructor(private bluetoothService: BluetoothService, private encryptionService: EncryptionService, private indexedDbService: IndexedDbService, private cdr: ChangeDetectorRef, private router: Router,
  private paymentBuilder: BluetoothPaymentBuilderService, private payloadValidator: BluetoothPayloadValidatorService, private userService: UserService) {}

  ngOnInit(): void {
    // Show role selection screen on component load (Sender or Receiver)
    this.currentPage = 'home';
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

// ------ Method 1: Connect to selected device ------  
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
  
// ------ Method 2: Device pairing with PIN ------
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

// ------ Method 3: Send payment VIA bluetooth ------
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

      // Step 1: Get sender UPI from localStorage
      const senderUPI = this.userService.getUpiIdFromStorage();

      if (!senderUPI) {
        this.showNotification('error', '❌ Sender UPI not found. Please login again.');
        return;
      }

      // Step 2: Build plain payload (unsigned, with nonce)
      const plainPayload = this.paymentBuilder.buildPayloadPlain(
        senderUPI, 
        'receiver-upi@bank',    // TODO: Get from device handshake
        this.paymentAmount
      );

      // Step 3: Validate plain payload
      const plainValidation = this.payloadValidator.validatePlainPayload(plainPayload);

      if (!plainValidation.valid) {
        this.payloadValidator.logValidationResults(plainValidation, 'Plain Payload');
        const errorMsg = this.payloadValidator.getErrorMessage(plainValidation);
        this.showNotification('error', `❌ Validation failed: ${errorMsg}`);
        return;
      }

      // Step 4: Encrypt payload (includes signature generation)
      const encryptedPayload = await this.paymentBuilder.encryptPayloadForBLE( 
        plainPayload, 
        'receiver-public-key-base64'   // TODO: Get from device handshake
      );

      // Step 5: Validate encrypted payload
      const encryptedValidation = this.payloadValidator.validateEncryptedPayload(encryptedPayload);

      if (!encryptedValidation.valid) {
        this.payloadValidator.logValidationResults(encryptedValidation, 'Encrypted Payload');
        const errorMsg = this.payloadValidator.getErrorMessage(encryptedValidation);
        this.showNotification('error', `❌ Encryption validation failed: ${errorMsg}`);

        return;
      }

      // Step 6: Format payload for BLE transmission
      const formattedPayload = this.paymentBuilder.formatPayloadForBLE(encryptedPayload);

      // Step 7: Check if payload needs chunking
      let chunks = [formattedPayload];
      if (formattedPayload.length > 450) {
        console.warn('Payload exceeds 450 bytes, chunking...');
        chunks = this.paymentBuilder.chunkPayload(formattedPayload);
        this.showNotification('info', `⏳ Sending ${chunks.length} chunks...`);
      }

      // Step 8: Send via Bluetooth
      await this.bluetoothService.sendPaymentData(formattedPayload);
      console.log('Payment sent via Bluetooth');

      // Step 9: Store as pending transaction in IndexedDB
      const pendingTransaction: PendingTransaction = {
        transactionId: `BLE_${plainPayload.nonce}`,
        senderUpiId: plainPayload.senderUPI,
        receiverUpiId: plainPayload.receiverUPI,
        amount: plainPayload.amount,
        description: `Ble Payment via ${this.connectedDevice.name}`,
        encryptedData: formattedPayload, 
        type: 'BLE',
        status: 'PENDING',  // Will be SYNCING once ACK received
        createdAt: new Date().toISOString(),
        retryCount: 0,
        nonce: plainPayload.nonce,
        signature: encryptedPayload.signature,
        payloadVersion: encryptedPayload.payloadVersion,
        source: 'SENT',
        isOffline: true
      };

      await this.indexedDbService.saveBLESentPayment(pendingTransaction);
      console.log('Saved to IndexedDB');

      // Step 10: Update UI
      const bleTransaction: BLETransaction = {
        role: 'sender',
        remoteDeviceId: this.connectedDevice.id,
        remoteDeviceName: this.connectedDevice.name,
        amount: this.paymentAmount,
        description: this.paymentDescription,
        encryptedData: formattedPayload,
        status: 'sent',
        transactionHash: plainPayload.nonce,
        createdAt: new Date().toISOString(),
        direction: 'outgoing'
      };

      this.currentTransaction = bleTransaction;
      this.currentPage = 'transaction';
      this.showNotification('success', `✅ Payment Sent!\n\nAmount: ₹${this.paymentAmount}\nTo: ${this.connectedDevice.name}\n\nWaiting for confirmation...`);

      // Step 11: Wait for ACK
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

// ------ Method 4: Wait for payment acknowledgment ------
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

// ------ Method 5: Handle incoming payment ------ 
  // Receiver receives payment request
  private async handleIncomingPayment(payload: BLEPayload): Promise<void> {
    try {
      console.log('Processing incoming payment...');

      // Step 1: Parse encrypted payload
      let encryptedPayload: EncryptedBLEPayload;

      try {
        encryptedPayload = JSON.parse(payload.data);
      }
      catch (error) {
        console.error('Failed to parse payload: ', error);
        this.showNotification('error', '❌ Invalid payload format');
        return;
      }

      // Step 2: Validate encrypted payload structure
      const validation = this.payloadValidator.validateEncryptedPayload(encryptedPayload);

      if (!validation.valid) {
        this.payloadValidator.logValidationResults(validation, 'Received Payload');
        const errorMsg = this.payloadValidator.getErrorMessage(validation);
        this.showNotification('error', `❌ Invalid payload: ${errorMsg}`);

        // Send rejection ACK
        await this.bluetoothService.sendAcknowledgment(false, errorMsg);
        return;
      }
 
      // Step 3: Decrypt and validate payload (checks nonce, signature, timestamp)
      const decryptedPayload = await this.paymentBuilder. decryptAndValidatePayload(
        encryptedPayload,
        'sender-public-key-base64'  // TODO: Get from device handshake
      );

      // Step 4: Store encrypted data
        // (IndexedDB stores encrypted, backend will decrypt on sync)
      const receiverUPI = this.userService.getUpiIdFromStorage();

      if (!receiverUPI) {
        this.showNotification('error', 'Receiver UPI not found');
        await this.bluetoothService.sendAcknowledgment(false, 'Receiver UPI not configured');
        return;
      }

      const pendingTransaction: PendingTransaction = {
        transactionId: `BLE_RCV_${decryptedPayload.nonce}`,
        senderUpiId: decryptedPayload.senderUPI,
        receiverUpiId: receiverUPI,
        amount: decryptedPayload.amount,
        description: `BLE Payment from ${this.connectedDevice?.name}`,
        encryptedData: payload.data,  // Store encrypted data
        type: 'BLE',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        retryCount: 0,
        nonce: decryptedPayload.nonce,
        signature: encryptedPayload.signature,
        payloadVersion: encryptedPayload.payloadVersion,
        receivedAt: Date.now(),
        source: 'RECEIVED',
        isOffline: true
      };

      await this.indexedDbService.saveBLEReceivedPayment(pendingTransaction);
      console.log('Saved received payment to IndexedDB');

      // Step 5: Update UI
      this.currentPage = 'receive-payment';
      this.receivedPaymentRequest = payload;

      // Show generic message
      this.showNotification('info', `💰 Payment Request Received\n\nFrom: ${decryptedPayload.senderUPI}\nAmount: ₹${decryptedPayload.amount}\n\nConfirm to accept`);

      this.cdr.detectChanges();
    }
    catch (error: any) {
      console.error('Error processing payment: ', error);
      this.showNotification('error', '❌ Failed to process payment');

      // Send rejection ACK with error details
      try {
        await this.bluetoothService.sendAcknowledgment(false, error.message);
      }
      catch (ackError) {
        console.error('Failed to send rejection ACK: ', ackError);
      }
    }
  }  

// ----- Method 6: Receiver Confirms payment ------
  async confirmReceivedPayment(accept: boolean): Promise<void> {
    if (!this.receivedPaymentRequest) return;

    try {
      this.isProcessing = true;

      if(accept) {
        console.log('Receiver accepting payment');

        // Parse the received encrypted payload
        const encryptedPayload: EncryptedBLEPayload = JSON.parse(this.receivedPaymentRequest.data);

        // Send ACK back to sender (with nonce for matching)
        await this.bluetoothService.sendAcknowledgment(true, 'Payment received and saved');
        console.log('Sent ACK to sender');

        // Show generic success message
        this.showNotification('success', `✅ Payment Received!\n\nFrom: ${encryptedPayload.senderUPI}\nAmount: ₹\n\nPayment saved locally.\n Will sync to backend when online.`);

        if(this.currentTransaction) {
          this.currentTransaction.status = 'confirmed';
        }
      }
      else {
        console.log('Receiver rejecting payment');

        await this.bluetoothService.sendAcknowledgment(false, 'Payment rejected by receiver');

        this.showNotification('error', '❌ Payment rejected');
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

// ------ Method 7: Handle Acknowledgment ------
  private handleAcknowledgment(payload: BLEPayload): void {
    try {
      const ackData = JSON.parse(payload.data);

      if(ackData.success) {
        console.log('Payment acknowledged by receiver');

        if (this.currentTransaction) {
          this.currentTransaction.status = 'confirmed';
        }

        this.showNotification('success', '✅ Payment confirmed by receiver!');
      }
      else {
        console.log('Payment rejected');

        if (this.currentTransaction) {
          this.currentTransaction.status = 'failed';
        }

        this.showNotification('error', `❌ ${ackData.message}`);
      }
      this.cdr.detectChanges();
    }
    catch (error) {
      console.error('Error handling ACK: ', error);
    }
  } 

// ------ Method 8: Disconnect from device ------
  async disconnectDevice(): Promise<void> {
    try {
      await this.bluetoothService.disconnectDevice();
      this.connectedDevice = null;
      this.goToHome();
      this.showNotification('info', 'Disconnect from device');
    }
    catch (error: any) {
      console.error('Disconnect error: ', error);
    }
  }  

// ------ HELPER METHODS ------
  
  // ------ Generate unique transaction hash ------
  private generateTransactionHash(): string {
    return `BLE_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  // ------ Show notification message ------
  private showNotification(type: 'success' | 'error' | 'info', message: string): void {
    this.notification = {type, message};
    this.cdr.detectChanges();

    // Auto-hide after 4 seconds
    if(this.notificationTimeout) {
      clearTimeout(this.notificationTimeout);
    }

    this.notificationTimeout = setTimeout(() => {
      this.notification = null;
      this.cdr.detectChanges();
    }, 4000);
  }

  // ------ Reset form fields ------
  private resetForm(): void {
    this.paymentAmount = 0;
    this.paymentDescription = '';
    this.enteredPin = '';
    this.requiresPairing = false;
    this.currentTransaction = null;
    this.receivedPaymentRequest = null;
  }

  // ------ Destroy method ------
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout);
    }

    // Disconnect on component destroy
    if (this.isConnected) {
      this.bluetoothService.disconnectDevice().catch(console.error);
    }
  }
}
