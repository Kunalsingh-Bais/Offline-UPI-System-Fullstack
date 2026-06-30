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

// ------ Method 2: Scan for nearby Bluetooth devices ------
  async scanForDevices(): Promise<BluetoothDevice[]> {
    if (!navigator.bluetooth) {
      throw new Error('Bluetooth not supported');
    }

    try {
      this.isScanning$.next(true);
      console.log('Starting device scan...');

      // Request device from user
      const device = await navigator.bluetooth.requestDevice({
        // Filter by our custom service UUID
        filters: [
          {
            services: [this.SERVICE_UUID]
          }
        ],
        // Allow user to see all devices (optional)
        optionalServices: [this.SERVICE_UUID]
      });

      console.log('Device selected: ', device.name);

      // Create Device object
      const bluetoothDevice: BluetoothDevice = {
        id: device.id,
        name: device.name || 'Unknown Device',
        connected: false,
        lastSeen: new Date()
      };

      // Update device list
      const devices = this.deviceList$.value;
      const existingIndex = devices.findIndex(d => d.id === bluetoothDevice.id);

      if(existingIndex > -1) {
        devices[existingIndex] = bluetoothDevice;
      }
      else {
        devices.push(bluetoothDevice);
      }

      this.deviceList$.next(devices);
      console.log('Total devices found: ', device.length);

      return devices;
    }
    catch(error: any) {
      console.error('Scan error: ', error);

      // User cancelled or error occurred
      if(error.name === 'NotFoundError') {
        console.warn('No compatible device found');
      }
      else if(error.name === 'NotAllowedError') {
        console.warn('User cancelled device selection');
      }
      else {
        throw error;
      }

      return [];
    }
    finally {
      this.isScanning$.next(false);
    }
  }
  
}
