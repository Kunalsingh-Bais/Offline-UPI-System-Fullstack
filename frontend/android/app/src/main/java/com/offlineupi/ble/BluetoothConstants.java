package com.offlineupi.ble;

import java.util.UUID;

// Stores all UUIDs used by the Offline UPI BLE communication
public final class BluetoothConstants {

  private BluetoothConstants() {
    // Prevent object creation
  }

  // Offline UPI BLE Service UUID
  public static final UUID SERVICE_UUID = UUID.fromString("12345678-1234-1234-1234-123456789012");

  // Characteristic used to transfer encrypted payment data
  public static final UUID PAYMENT_CHARACTERISTIC_UUID = UUID.fromString("87654321-4321-4321-4321-210987654321");
}
