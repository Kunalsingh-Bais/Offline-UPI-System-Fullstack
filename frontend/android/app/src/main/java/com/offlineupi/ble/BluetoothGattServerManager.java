package com.offlineupi.ble;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.util.Log;

public class BluetoothGattServerManager {
  private static final String TAG = "BluetoothGattServer";
  private final Context context;
  private BluetoothGattServer gattServer;

  // Payment characteristic
  private BluetoothGattCharacteristic paymentCharacteristic;

  // Stores the currently connected device
  private BluetoothDevice connectedDevice;

  // Registered payment listener
  private PaymentReceivedListener paymentReceivedListener;

  // Callback interface for received payments
  public interface PaymentReceivedListener {
    void onPaymentReceived(String paymentData);
  }

  public BluetoothGattServerManager(Context context) {
    this.context = context;
  }

// ------ Start GATT Server ------
  @SuppressLint("MissingPermission")
  public void startServer() {
    BluetoothManager bluetoothManager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
    gattServer = bluetoothManager.openGattServer(context, gattServerCallback);

    if (gattServer == null) {
      Log.e(TAG,"Failed to create GATT Server");
      return;
    }

    createUpiService();

    Log.d(TAG, "GATT Server Started");
  }

// ------ Stop GATT Server ------
  @SuppressLint("MissingPermission")
  public void stopServer() {
    if(gattServer != null) {
      gattServer.close();
      Log.d(TAG, "GATT Server Stopped");
    }
  }

// ------ Create Offline UPI Service ------
  private void createUpiService() {

    BluetoothGattService service = new BluetoothGattService(
      BluetoothConstants.SERVICE_UUID,
      BluetoothGattService.SERVICE_TYPE_PRIMARY
    );

    paymentCharacteristic = new BluetoothGattCharacteristic(
      BluetoothConstants.PAYMENT_CHARACTERISTIC_UUID,
      BluetoothGattCharacteristic.PROPERTY_WRITE | BluetoothGattCharacteristic.PROPERTY_NOTIFY,
      BluetoothGattCharacteristic.PERMISSION_WRITE
    );

    service.addCharacteristic(paymentCharacteristic);

    if (context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)
      != PackageManager.PERMISSION_GRANTED) {

      Log.e(TAG, "BLUETOOTH_CONNECT permission not granted");

      return;
    }
    gattServer.addService(service);

    Log.d(TAG, "Offline UPI Service Added");
  }

// ------ GATT Callback ------
  private final BluetoothGattServerCallback gattServerCallback = new BluetoothGattServerCallback() {

    @Override
    public void onConnectionStateChange(BluetoothDevice device, int status, int newState ) {
      connectedDevice = device;
      Log.d(TAG, "Device Connected: " + device.getAddress());
    }

    @Override
    public void onCharacteristicWriteRequest(
      BluetoothDevice device,
      int requestId,
      BluetoothGattCharacteristic characteristic,
      boolean preparedWrite,
      boolean responseNeeded,
      int offset,
      byte[] value ) {

      Log.d(TAG, "Payment received from: " + device.getAddress());

      // Convert received bytes into String
      String receivedData = new String(value);
      Log.d(TAG, "Received Data: " + receivedData);

      // Notify plugin that payment was received
      if (paymentReceivedListener != null) {
        paymentReceivedListener.onPaymentReceived(receivedData);
      }

      // Send acknowledgement to sender
      sendAcknowledgement("SUCCESS");

      // Send success response back to sender
      if (responseNeeded) {
        if (context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
          Log.e(TAG, "Bluetooth permission not granted");
          return;
        }

        gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset , null);
      }
    }
  };

// ------ Send Ack to sender ------
  @SuppressLint("MissingPermission")
  public void sendAcknowledgement(String message) {
    if (connectedDevice == null) {
      Log.e(TAG, "No connected device");
      return;
    }

    if (paymentCharacteristic == null) {
      Log.e(TAG, "Characteristic not available");
      return;
    }

    if (context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
      Log.e(TAG, "Bluetooth permission missing");
      return;
    }

    // update characteristic value
    paymentCharacteristic.setValue(message.getBytes());

    // Notify sender
    gattServer.notifyCharacteristicChanged(connectedDevice, paymentCharacteristic, false);

    Log.d(TAG,"ACK Sent : " + message);
  }

// Register payment listener
  public void setPaymentReceivedListener(PaymentReceivedListener listener) {
    this.paymentReceivedListener = listener;
  }
}
