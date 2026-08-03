package com.offlineupi.ble;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.content.Context;
import android.util.Log;

public class BluetoothConnectionManager {
  private static final String TAG = "BluetoothConnection";
  private final Context context;
  private final BluetoothAdapter bluetoothAdapter;
  private final BluetoothAdvertiser bluetoothAdvertiser;
  private final BluetoothGattServerManager gattServerManager;
  private final BluetoothClient bluetoothClient;

  // Constructor
  public BluetoothConnectionManager(Context context) {
    this.context = context;

    BluetoothManager bluetoothManager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);

    bluetoothAdapter = bluetoothManager.getAdapter();

    bluetoothAdvertiser = new BluetoothAdvertiser(bluetoothAdapter);

    gattServerManager = new BluetoothGattServerManager(context);

    bluetoothClient = new BluetoothClient(context);
  }

// ------ Start Receiver Mode ------
  public void startReceiver() {
    Log.d(TAG,"Starting Receiver...");

    gattServerManager.startServer();
    bluetoothAdvertiser.startAdvertising();
  }

// ------ Stop Receiver Mode ------
  public void stopReceiver() {
    Log.d(TAG, "Stopping Receiver...");

    bluetoothAdvertiser.stopAdvertising();
    gattServerManager.stopServer();
  }

// ------ Send ACK ------
  public void sendAcknowledgement(String message) {
    gattServerManager.sendAcknowledgement(message);
  }

// ------ Is Bluetooth Enabled ------
  public boolean isBluetoothEnabled() {
    return bluetoothAdapter != null && bluetoothAdapter.isEnabled();
  }

// ------ Get Bluetooth Adapter ------
  public BluetoothAdapter getBluetoothAdapter() {
    return bluetoothAdapter;
  }

// ------ Get GATT Server ------
  public BluetoothGattServerManager getGattServerManager() {
    return gattServerManager;
  }

// ------ Connect to Device ------
  public void connect(BluetoothDevice device) {
    bluetoothClient.connect(device);
  }

// ------ Send Payment ------
  public boolean sendPayment(String payment) {
    return bluetoothClient.sendPayment(payment);
  }

// ------ Disconnect Device ------
  public void disconnect() {
    bluetoothClient.disconnect();
  }  

// ------ Close Connection ------
  public void close() {
    bluetoothClient.close();
  }
}
