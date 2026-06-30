import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface BluetoothDevice {
  id: string;
  name: string;
  rssi?: number;   // Signal strength
  connected: boolean;
  lastSeen?: Date;
}

export interface BLEPayload {
  type: 'PAYMENT_REQUEST' | 'PAYMENT_RESPONSE' | 'PAYMENT_ACK';
  data: string;  // Encrypted data
  timestamp: number;
  deviceId: string;
}

@Injectable({
  providedIn: 'root',
})
export class BluetoothService {

  // Properties:
  private device: BluetoothDevice | null = null;
  private gattServer: BluetoothRemoteGATTServer | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;

  // Observables:
  private deviceList$ = new BehaviorSubject<BluetoothDevice[]>([]);
  private connectedDevice$ = new BehaviorSubject<BluetoothDevice | null>(null);
  private isScanning$ = new BehaviorSubject<boolean>(false);
  private isConnected$ = new BehaviorSubject<boolean>(false);
  private receivedData$ = new BehaviorSubject<BLEPayload | null>(null);
  private connectionStatus$ = new BehaviorSubject<string>('disconnected');

  // BLE Configuration:
  private readonly SERVICE_UUID = '12345678-1234-1234-1234-123456789012'; // Custom Service
  private readonly CHARACTERISTIC_UUID = '87654321-4321-4321-4321-210987654321';   // Custom characteristics
  private readonly REQUEST_MTU = 512;   // Maximum Transmission Unit

  constructor() {
    this.checkBluetoothSupport();
  }

// ------ Method 1: Check if device supports Web Bluetooth API ------  
  private checkBluetoothSupport(): void {
    if (!navigator.bluetooth) {
      console.error('Web Bluetooth API not supported on this device');
      alert('Bluetooth not supported. Use Chrome/Edge on Android or macOS.');
    }
    else {
      console.log('Web Bluetooth API is available');
    }
  }


}
