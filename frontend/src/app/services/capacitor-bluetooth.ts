import { Injectable } from '@angular/core';
import { BleClient, ScanResult } from '@capacitor-community/bluetooth-le';
import { BehaviorSubject, throwError } from 'rxjs';

// Represents a discovered BLE device
export interface NativeBLEDevice {
  id: string;
  name: string;
  rssi: number;
}

@Injectable({
  providedIn: 'root',
})
export class CapacitorBluetoothService {

  // List of nearby BLE devices
  public devices$ = new BehaviorSubject<NativeBLEDevice[]>([]);

  // Prevent duplicate devices
  private scannedDevices = new Map<string, NativeBLEDevice>();

  // Connected BLE device
  private connectedDeviceId: string | null = null;

  // Connection status observable
  public connected$ = new BehaviorSubject<boolean>(false);

  constructor() {}

// ------ Initialize BLE ------
  async initialize(): Promise<void> {
    await BleClient.initialize();
    console.log("Native BLE initialized");
  }

// ------ Starts native BLE scanning ------  
  async scan(): Promise<void> {

    // Clear old list
    this.scannedDevices.clear();
    this.devices$.next([]);

    await BleClient.requestLEScan(
      {
        allowDuplicates: false
      },
      (result: ScanResult) => {
        const device = result.device;

        if(!this.scannedDevices.has(device.deviceId)) {
          this.scannedDevices.set(device.deviceId, {
            id: device.deviceId,
            name: device.name ?? "Unknown Device",
            rssi: result.rssi ?? -100
          });

          this.devices$.next(
            Array.from(this.scannedDevices.values())
          );

          console.log("Found: ", device.name);
        }
      }
    );
  }

// ------ Stop Scan ------  
  async stopScan(): Promise<void> {
    await BleClient.stopLEScan();
    console.log("Scan stopped");
  }

// ------ Connect to selected BLE device ------
  async connect(deviceId: string): Promise<void> {
    try {
      await BleClient.connect(deviceId);

      this.connectedDeviceId = deviceId;
      this.connected$.next(true);

      console.log("Connected: ", deviceId);
    }
    catch (error) {
      console.error("Connection failed: ", error);
      throw error;
    }
  }  

  async disconnect(): Promise<void> {
    try {
      if (this.connectedDeviceId) {
        await BleClient.disconnect(this.connectedDeviceId);

        console.log("Disconnected: ", this.connectedDeviceId);

        this.connectedDeviceId = null;
        this.connected$.next(false);
      }
    }
    catch (error) {
        console.error("Disconnect failed: ", error);
        throw error;
      }
  }
}
