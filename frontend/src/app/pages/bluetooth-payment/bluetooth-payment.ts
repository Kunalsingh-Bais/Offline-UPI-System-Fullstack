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

  
}
