import { Injectable } from '@angular/core';
import { BleClient, ScanResult } from '@capacitor-community/bluetooth-le';
import { registerPlugin } from '@capacitor/core';
import { BehaviorSubject } from 'rxjs';

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
}
