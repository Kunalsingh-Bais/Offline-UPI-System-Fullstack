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

// ------ Method 3: Connect to Bluetooth device ------
  async connectToDevice(deviceId: string): Promise<void> {
    try {
      console.log('Connecting to device: ', deviceId);
      this.connectionStatus$.next('connecting');

      // Get the BluetoothDevice object
      const devices = this.deviceList$.value;
      const selectedDevice = devices.find(d => d.id === deviceId);

      if (!selectedDevice) {
        throw new Error('Device not found in list');
      }

      // Connect to GATT server
      const device = await navigator.bluetooth?.getDevice(deviceId);

      if (!device) {
        throw new Error('Cannot access device');
      }

      // Request connection to GATT server
      this.gattServer = await device.gatt?.connect();

      if(!this.gattServer) {
        throw new Error('Failed to get GATT server');
      }

      console.log('Connected to GATT server');

      // Get our custom service
      const service = await this.gattServer.getPrimaryService(this.SERVICE_UUID);
      console.log('Found UPI service');

      // Get data characteristic
      this.characteristic = await service.getCharacteristic(this.CHARACTERISTIC_UUID);
      console.log('Found data characteristic');

      // Setup Notifications (receive data)
      if(this.characteristic.properties.notify) {
        await this.characteristic.startNotifications();
        console.log('Started listening for notification');

        // Listen for incoming data
        this.characteristic.addEventListener('characteristicvaluechanged', (event: any) => this.onDataReceived(event)
        );
      }

      // Update state
      selectedDevice.connected = true;
      this.device = selectedDevice;
      this.connectedDevice$.next(selectedDevice);
      this.isConnected$.next(true);
      this.connectionStatus$.next('connected');

      console.log('Successfully connected to: ', selectedDevice.name);
    }
    catch (error: any) {
      console.error('Connection error: ', error);
      this.connectionStatus$.next('error');
      throw new Error(`Connection failed: ${error.message}`);
    }
  }

// ------ Method 4: Disconnect from device ------
  async disconnectDevice(): Promise<void> {
    try {
      console.log('Disconnecting from device...');

      if (this.characteristic?.properties.notify) {
        await this.characteristic.stopNotifications();
        console.log('Stopped notifications');
      }

      if (this.gattServer?.connected) {
        this.gattServer.disconnect();
        console.log('GATT server disconnected');
      }

      if (this.device) {
        this.device.connected = false;
      }

      this.connectedDevice$.next(null);
      this.isConnected$.next(false);
      this.connectionStatus$.next('disconnected');

      console.log('Disconnected successfully');
    }
    catch (error: any) {
      console.log('Disconnect error:', error);
    }
  }  
}
