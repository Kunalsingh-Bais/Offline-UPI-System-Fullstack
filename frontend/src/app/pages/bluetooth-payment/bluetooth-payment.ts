import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BLEDevice, BLEPayload, BluetoothService } from '../../services/bluetooth';
import { Subject, takeUntil } from 'rxjs';
import { EncryptionService } from '../../services/encryption';
import { IndexedDbService } from '../../services/indexed-db';

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
}
