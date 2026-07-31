import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable} from 'rxjs';
import { __await } from 'tslib';
import { CapacitorBluetoothService } from './capacitor-bluetooth';
import { Capacitor } from '@capacitor/core';

export interface BLEDevice {
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
  private device: BLEDevice | null = null;
  private gattServer: BluetoothRemoteGATTServer | null | undefined = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;

  // Observables:
  private deviceList$ = new BehaviorSubject<BLEDevice[]>([]);
  private connectedDevice$ = new BehaviorSubject<BLEDevice | null>(null);
  private isScanning$ = new BehaviorSubject<boolean>(false);
  private isConnected$ = new BehaviorSubject<boolean>(false);
  private receivedData$ = new BehaviorSubject<BLEPayload | null>(null);
  private connectionStatus$ = new BehaviorSubject<string>('disconnected');

  // BLE Configuration:
  private readonly SERVICE_UUID = '12345678-1234-1234-1234-123456789012'; // Custom Service
  private readonly CHARACTERISTIC_UUID = '87654321-4321-4321-4321-210987654321';   // Custom characteristics
  private readonly REQUEST_MTU = 512;   // Maximum Transmission Unit

  constructor(private nativeBluetooth: CapacitorBluetoothService) {

  // Browser → Web Bluetooth
  if (!Capacitor.isNativePlatform()) {
    this.checkBluetoothSupport();
  }

  // Native Android → Capacitor BLE
  this.nativeBluetooth.devices$.subscribe(devices => {

    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const bleDevices: BLEDevice[] = devices.map(device => ({
      id: device.id,
      name: device.name,
      rssi: device.rssi,
      connected: false,
      lastSeen: new Date()
    }));

    this.deviceList$.next(bleDevices);

    console.log("Native devices updated:", bleDevices.length);
  });
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
  async scanForDevices(): Promise<BLEDevice[]> {

    // Android
    if (Capacitor.isNativePlatform()) {
      await this.nativeBluetooth.initialize();
      await this.nativeBluetooth.scan();

      return new Promise(resolve => {
        const sub = this.deviceList$.subscribe(devices => {
          if (devices.length > 0) {
            resolve(devices);
            sub.unsubscribe();
          }
        });

        // Stop scan after 10 seconds
        setTimeout(async () => {
          await this.nativeBluetooth.stopScan();

          resolve(this.deviceList$.value);
          sub.unsubscribe();
        }, 10000);
      });
    }
    return [];
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
      const BluetoothDevices = await navigator.bluetooth?.getDevices();
      const device = BluetoothDevices.find(d => d.id === deviceId);

      if (!device) {
        throw new Error('Cannot access device');
      }

      if (!device.gatt) {
        throw new Error('GATT not supported on this device');
      }
      
      // Request connection to GATT server
      this.gattServer = await device.gatt.connect();

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

      // Stop listening for notifications
      if (this.characteristic?.properties.notify) {
        await this.characteristic.stopNotifications();
        console.log('Stopped notifications');
      }

      // Disconnect GATT
      if (this.gattServer?.connected) {
        this.gattServer.disconnect();
        console.log('GATT server disconnected');
      }

      // Update state
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

// ------ Method 5: Send Encrypted Payment Data Via BLE ------
  async sendPaymentData(encryptedData: string): Promise<void> {
    if (!this.characteristic) {
      throw new Error('Not connected to device');
    }

    try {
      console.log('Sending encrypted payment data...');

      // Step 1: Create BLE Payload
      const payload: BLEPayload = {
        type: 'PAYMENT_REQUEST',
        data: encryptedData,   // Already encrypted by encryption service
        timestamp: Date.now(),
        deviceId: this.device?.id || 'unknown'
      };
 
      // Step 2: Convert to JSON
      const jsonPayload = JSON.stringify(payload);
      console.log('Payload size: ', jsonPayload.length, 'bytes');

      // Step 3: Handle large payloads (chuck if needed)
      if (jsonPayload.length > this.REQUEST_MTU) {
        console.warn('Payload too large, chunking into parts');
        await this.sendChunkedData(jsonPayload);
      }
      else {
        // Step 4: Convert string to Uint8Array
        const encoder = new TextEncoder();
        const data = encoder.encode(jsonPayload);

        // Step 5: Send via characteristic
        if (this.characteristic.properties.write) {
          await this.characteristic.writeValue(data);
          console.log('Payment data sent successfully');
        }
        else if (this.characteristic.properties.writeWithoutResponse) {
          await this.characteristic.writeValueWithoutResponse(data);
          console.log('Payment data sent (no response)');
        }
        else {
          throw new Error('Characteristic does not support write');
        }
      }
    }
    catch(error: any) {
      console.error('Send error:', error);
      throw new Error(`Failed to send data: ${error.message}`);
    }
  }

// ------ Method 6: Handle Chunked Data ------
  // Split data into chunks and send sequentially
  private async sendChunkedData(data: string): Promise<void> {
    const chunkSize = 450;  // Leave room for metaData
    const chunks = [];

    for (let i=0;i<data.length; i+= chunkSize) {
      chunks.push(data.substring(i, i + chunkSize));
    }

    console.log(`Sending ${chunks.length} chunks...`);

    for (let i=0; i<chunks.length; i++){
      const chunk = chunks[i];
      const encoder = new TextEncoder();
      const chunkData = encoder.encode(chunk);

      if(this.characteristic?.properties.write) {
        await this.characteristic.writeValue(chunkData);
      }
      else {
        await this.characteristic?.writeValueWithoutResponse(chunkData);
      }

      console.log(`Chunk ${i+1}/ ${chunks.length} sent`);

      // Small delay between chunks to prevent buffer overflow
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log('All chunks sent');
  }  

// ------ Method 7: Receive Data via BLE notifications ------
  private onDataReceived(event: any): void {
    try {
      console.log('Data received from device');

      // Step 1: Get the value
      const value = event.target.value;

      // Step 2: Convert Uint8Array to string
      const decoder = new TextDecoder('utf-8');
      const jsonString = decoder.decode(value);

      // Step 3: Parse JSON
      const payload: BLEPayload = JSON.parse(jsonString);

      console.log('Received: ', payload.type);
      console.log('Data length: ', payload.data.length);

      // Update observable so component can react
      this.receivedData$.next(payload);
    }
    catch(error: any) {
      console.error('Error processing received data:', error);
    }
  }

// ------ Method 8: Send payment Acknowledgment ------
  // After receiving payment, send ACK back to sender
  async sendAcknowledgment(success: boolean, message: string): Promise<void> {
    if (!this.characteristic) {
      throw new Error('Not connected');
    }
    
    try {
      const payload: BLEPayload = {
        type: 'PAYMENT_ACK',
        data: JSON.stringify({
          success,
          message,
          timestamp: Date.now()
        }),
        timestamp: Date.now(),
        deviceId: this.device?.id || 'unknown'
      };

      const jsonPayload = JSON.stringify(payload);
      const encoder = new TextEncoder();
      const data = encoder.encode(jsonPayload);

      if(this.characteristic.properties.write) {
        await this.characteristic.writeValue(data);
      }
      else {
        await this.characteristic.writeValueWithoutResponse(data);
      }

      console.log('Acknowledgment sent');
    }
    catch(error: any) {
      console.error('Ack error: ', error);
    }
  }  


// ------ OBSERVABLES for components ------
  getDeviceList(): Observable<BLEDevice[]> {
    return this.deviceList$.asObservable();
  }  

  getConnectedDevice(): Observable<BLEDevice | null> {
    return this.connectedDevice$.asObservable();
  }

  getIsScanning(): Observable<boolean> {
    return this.isScanning$.asObservable();
  }

  getIsConnected(): Observable<boolean> {
    return this.isConnected$.asObservable();
  }

  getReceivedData(): Observable<BLEPayload | null> {
    return this.receivedData$.asObservable();
  }

  getConnectionStatus(): Observable<string> {
    return this.connectionStatus$.asObservable();
  }

  getDeviceListValue(): BLEDevice[] {
    return this.deviceList$.value;
  }

  getConnectDeviceValue(): BLEDevice | null {
    return this.connectedDevice$.value;
  }

  getIsConnectedValue(): boolean {
    return this.isConnected$.value;
  }
}
