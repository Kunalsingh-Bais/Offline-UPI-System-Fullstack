package com.offlineupi.ble;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.os.ParcelUuid;
import android.util.Log;

public class BluetoothAdvertiser {
  private static final String TAG = "BluetoothAdvertiser";

  // Android BLE Advertiser
  private final BluetoothLeAdvertiser advertiser;

  // Constructor
  public BluetoothAdvertiser(BluetoothAdapter bluetoothAdapter) {
    advertiser = bluetoothAdapter.getBluetoothLeAdvertiser();
  }

// ------ Start Advertising ------
  @SuppressLint("MissingPermission")
  public void startAdvertising() {
    if (advertiser == null) {
      Log.e(TAG, "BLE Advertising not supported on this device");
      return;
    }

    // Configure advertising behaviour
    AdvertiseSettings settings = new AdvertiseSettings.Builder()
      .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY) // Fast advertising
      .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)  // High transmit power
      .setConnectable(true)  // Keep advertising until stopped
      .build();

    // Data sent in advertisement
    AdvertiseData advertiseData = new AdvertiseData.Builder()
      .addServiceUuid(new ParcelUuid(BluetoothConstants.SERVICE_UUID)) // Include Service UUID
      .setIncludeDeviceName(true) // Include phone name
      .build();

    advertiser.startAdvertising(settings, advertiseData, advertiseCallback);

    Log.d(TAG, "BLE Advertising Started");
  }

// ------ Stop Advertising ------
  @SuppressLint("MissingPermission")
  public void stopAdvertising() {
    if (advertiser != null) {
      advertiser.stopAdvertising(advertiseCallback);

      Log.d(TAG, "BLE Advertising stopped");
    }
  }

// ------ Advertising Callback ------
  private final AdvertiseCallback advertiseCallback = new AdvertiseCallback() {

    @Override
    public void onStartSuccess(AdvertiseSettings settingsInEffect) {
      Log.d(TAG, "Advertising Started Successfully");
    }

    @Override
    public void onStartFailure(int errorCode) {
      Log.e(TAG, "Advertising Failed : " + errorCode);
    }
  };
}
