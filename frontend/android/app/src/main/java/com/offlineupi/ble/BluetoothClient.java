package com.offlineupi.ble;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.content.Context;
import android.content.pm.PackageManager;
import android.util.Log;

public class BluetoothClient {
  private static final String TAG = "BluetoothClient";
  private final Context context;
  private BluetoothGatt bluetoothGatt;
  private BluetoothGattCharacteristic paymentCharacteristic;

  public BluetoothClient(Context context) {
    this.context = context;
  }

// ------ Connect to Receiver ------
  @SuppressLint("MissingPermission")
  public void connect(BluetoothDevice device) {
    if (context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
      Log.e(TAG, "Bluetooth permission missing");
      return;
    }

    bluetoothGatt = device.connectGatt(context, false, gattCallback);

    Log.d(TAG, "Connecting to " + device.getName());
  }

// ------ Bluetooth GATT Callback ------
  private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {

    // Called when connection state changes
    @Override
    public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
      if (newState == BluetoothGatt.STATE_CONNECTED) {
        Log.d(TAG, "Connected to receiver");

        if (context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT ) != PackageManager.PERMISSION_GRANTED) {
          Log.e(TAG, "Bluetooth permission missing");
          return;
        }

        // Discover services on receiver
        gatt.discoverServices();
      }
      else if (newState == BluetoothGatt.STATE_DISCONNECTED) {
        Log.d(TAG, "Disconnected from receiver");
      }
    }

    // Called after services are discovered
    @Override
    public void onServicesDiscovered(BluetoothGatt gatt, int status) {
      if (status != BluetoothGatt.GATT_SUCCESS) {
        Log.e(TAG, "Service discovery failed");
        return;
      }

      Log.d(TAG, "Services discovered");

      // Find Offline UPI Service
      BluetoothGattService service = gatt.getService(BluetoothConstants.SERVICE_UUID);

      if (service == null) {
        Log.e(TAG, "Offline UPI Service not found");
        return;
      }

      Log.d(TAG, "Offline UPI Service found");

      // Find Payment characteristics
      paymentCharacteristic = service.getCharacteristic(BluetoothConstants.PAYMENT_CHARACTERISTIC_UUID);

      if (paymentCharacteristic == null) {
        Log.e(TAG, "Payment Characteristic not found");
        return;
      }

      Log.d(TAG, "Payment Characteristic found");
    }

    // Called when notification is received
    @Override
    public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value) {
      String ack = new String(value);
      Log.d(TAG, "ACK Received : " + ack);
    }
  };

// ------ Send Payment ------
  @SuppressLint("MissingPermission")
  public boolean sendPayment(String paymentJson) {
    if (bluetoothGatt == null) {
      Log.e(TAG, "BluetoothGatt is null");
      return false;
    }

    if (paymentCharacteristic == null) {
      Log.e(TAG, "Payment characteristic not available");
      return false;
    }

    if (context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
      Log.e(TAG, "Bluetooth permission missing");
      return false;
    }

    paymentCharacteristic.setValue(paymentJson);

    boolean result = bluetoothGatt.writeCharacteristic(paymentCharacteristic);

    Log.d(TAG, "Payment Sent : " + result);

    return result;
  }

// ------ Disconnect from Receiver ------
  @SuppressLint("MissingPermission")
  public void disconnect() {
    if (bluetoothGatt == null) {
      Log.d(TAG, "No active connection");
      return;
    }

    if (context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
      Log.e(TAG, "Bluetooth permission missing");
      return;
    }

    bluetoothGatt.disconnect();

    Log.d(TAG, "Disconnect requested");
  }

// ------ Close bluetooth resources ------
  @SuppressLint("MissingPermission")
  public void close() {
    if (bluetoothGatt == null) {
      return;
    }

    if (context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
      Log.e(TAG, "Bluetooth permission missing");
      return;
    }

    bluetoothGatt.close();
    bluetoothGatt = null;
    paymentCharacteristic = null;

    Log.d(TAG,"Bluetooth resources released");
  }

// ------ Is Connected ------
  public boolean isConnected() {
    return bluetoothGatt != null;
  }
}
