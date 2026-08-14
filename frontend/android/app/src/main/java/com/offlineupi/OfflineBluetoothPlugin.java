package com.offlineupi;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothDevice;
import android.content.pm.PackageManager;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.offlineupi.ble.BluetoothConnectionManager;
import com.offlineupi.ble.BluetoothGattServerManager;

@CapacitorPlugin(name = "OfflineBluetooth")
public class OfflineBluetoothPlugin extends Plugin implements BluetoothConnectionManager.ConnectionEventListener{

  private static final String TAG = "OfflineBluetoothPlugin";

  private BluetoothConnectionManager connectionManager;
  private BluetoothGattServerManager gattServerManager;

  @Override
  public void load() {
    Log.d(TAG, "Loading OfflineBluetoothPlugin...");

    connectionManager = new BluetoothConnectionManager(getContext());
    connectionManager.setConnectionEventListener(this);

    gattServerManager = connectionManager.getGattServerManager();

    // Setup listeners for receiver mode
    setupReceiverListeners();

    Log.d(TAG, "OfflineBluetoothPlugin loaded");
  }

// ------ Setup Receiver Listeners ------
  private void setupReceiverListeners() {
    Log.d(TAG, "Setting up receiver listeners...");

    // Listen for payments
    gattServerManager.setPaymentReceivedListener((transactionId, senderUPI, receiverUPI, amount,
      encryptedPayload, signature, nonce, timestamp) -> {

      Log.d(TAG, "Payment received callback triggered");
      notifyPaymentReceived(transactionId, senderUPI, receiverUPI, amount, encryptedPayload,
        signature, nonce, timestamp);
    });

    // Listen for key exchanges
    gattServerManager.setKeyExchangeListener((deviceId, deviceName, publicKeyBase64) -> {

      Log.d(TAG, "Key exchange received callback triggered");
      notifyKeyExchangeReceived(deviceId, deviceName, publicKeyBase64);
    });

    // Listen for payment errors
    gattServerManager.setPaymentErrorListener((deviceId, errorMessage) -> {

      Log.d(TAG, "Payment error callback triggered: " + errorMessage);
      notifyPaymentError(deviceId, errorMessage);
    });

    Log.d(TAG, "Receiver listeners setup complete");
  }

// ======== RECEIVER MODE ========

// ------ Start Receiver ------
  @PluginMethod
  public void startReceiver(PluginCall call) {

    Log.d(TAG, "startReceiver() called");

    try {
      String serviceUUID = call.getString("serviceUUID");
      String characteristicUUID = call.getString("characteristicUUID");
      String receiverUPI = call.getString("receiverUPI");

      Log.d(TAG, "Starting receiver for UPI: " + receiverUPI);

      // Start receiver mode (GATT server + advertising)
      connectionManager.startReceiver();

      Log.d(TAG, "Receiver started successfully");

      JSObject result = new JSObject();
      result.put("success", true);
      result.put("message", "Receiver started successfully");
      result.put("advertisingStarted", true);

      call.resolve(result);
    }
    catch (Exception e) {
      String errorMessage = e.getMessage() != null ? e.getMessage() : "Unknown error";
      Log.e(TAG, "Error starting receiver: " + errorMessage);

      JSObject result = new JSObject();
      result.put("success", false);
      result.put("message", "Failed to start receiver: " + errorMessage);

      call.reject(errorMessage);
    }
  }

// ------ Stop Receiver ------
  @PluginMethod
  public void stopReceiver(PluginCall call) {

    Log.d(TAG, "stopReceiver() called");

    try {
      connectionManager.stopReceiver();

      Log.d(TAG, "Receiver stopped successfully");

      JSObject result = new JSObject();
      result.put("success", true);
      result.put("message", "Receiver stopped");
      result.put("advertisingStopped", true);

      call.resolve(result);
    }
    catch (Exception e) {
      String errorMessage = e.getMessage() != null ? e.getMessage() : "Unknown error";
      Log.e(TAG, "Error stopping receiver: " + errorMessage);

      call.reject(errorMessage);
    }
  }

// ======== SENDER MODE ========

// ------ Send Key exchange ------
  @PluginMethod
  public void sendKeyExchange(PluginCall call) {
    Log.d(TAG, "sendKeyExchange() called");

    try {
      String keyExchangePayload = call.getString("payload");

      if (keyExchangePayload == null) {
        call.reject("Key exchange payload is required");
        return;
      }

      Log.d(TAG, "Sending key exchange...");

      // Send key exchange via BluetoothClient
      boolean success = connectionManager.sendPayment(keyExchangePayload);

      if (success) {
        Log.d(TAG, "Key exchange sent");

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("message", "Key exchange sent");

        call.resolve(result);
      }
      else {
        Log.e(TAG, "Failed to send key exchange");
        call.reject("Failed to send key exchange");
      }
    }
    catch (Exception e) {
      String errorMessage = e.getMessage() != null ?e.getMessage() : "Unknown error";
      Log.e(TAG, "Error key exchange: " + errorMessage);

      call.reject(errorMessage);
    }
  }

// ------ Send Payment ------
  @PluginMethod
  public void sendPayment(PluginCall call) {

    Log.d(TAG, "sendPayment() called");

    try {
      String paymentPayload = call.getString("payment");

      if (paymentPayload == null) {
        call.reject("Payment payload is required");
        return;
      }

      Log.d(TAG, "Sending payment...");

      boolean success = connectionManager.sendPayment(paymentPayload);

      if (success) {
        Log.d(TAG, "Payment sent");

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("message", "Payment sent");

        call.resolve(result);
      } else {
        Log.e(TAG, "Failed to send payment");
        call.reject("Failed to send payment");
      }
    }
    catch (Exception e) {
      String errorMessage = e.getMessage() != null ? e.getMessage() : "Unknown error";
      Log.e(TAG, "Error sending payment: " + errorMessage);

      call.reject(errorMessage);
    }
  }

// ======== CONNECTION MANAGEMENT ========

// ------ Connect to Device ------
  @PluginMethod
  public void connect(PluginCall call) {
    Log.d(TAG, "connect() called");

    try {
      String deviceAddress = call.getString("deviceAddress");

      if (deviceAddress == null) {
        call.reject("Device address is required");
        return;
      }

      if (getContext().checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)
        != PackageManager.PERMISSION_GRANTED) {
        call.reject("Bluetooth permission not granted");
        return;
      }

      Log.d(TAG, "Connecting to device: " + deviceAddress);

      BluetoothDevice device = connectionManager.getBluetoothAdapter().getRemoteDevice(deviceAddress);
      connectionManager.connect(device);

      Log.d(TAG, "Connection initiated");

      JSObject result = new JSObject();
      result.put("success", true);
      result.put("message", "Connection initiated");

      call.resolve(result);
    }
    catch (Exception e) {
      String errorMessage = e.getMessage() != null ? e.getMessage() : "Unknown error";
      Log.e(TAG, "Error connecting: " + errorMessage);

      call.reject(errorMessage);
    }
  }

// ------ Disconnect Device ------
  @PluginMethod
  public void disconnect(PluginCall call) {

    Log.d(TAG, "disconnect() called");

    try {
      connectionManager.disconnect();

      Log.d(TAG, "Disconnected");

      JSObject result = new JSObject();
      result.put("success", true);

      call.resolve(result);
    }
    catch (Exception e) {
      String errorMessage = e.getMessage() != null ? e.getMessage() : "Unknown error";
      Log.e(TAG, "Error disconnecting: " + errorMessage);

      call.reject(errorMessage);
    }
  }

// ------ Check Bluetooth status ------
  @PluginMethod
  public void isBluetoothEnabled(PluginCall call) {
    Log.d(TAG, "isBluetoothEnabled() called");

    boolean enabled = connectionManager.isBluetoothEnabled();

    JSObject result = new JSObject();
    result.put("enabled", connectionManager.isBluetoothEnabled());

    call.resolve(result);
  }

// ======== CONNECTION EVENTS (from ConnectionEventListener) ========

// ------ Device Connected ------
  @Override
  @SuppressLint("MissingPermission")
  public void onConnected(BluetoothDevice device) {

    String deviceName = device.getName() != null ? device.getName() : "Unknown";
    String deviceAddress = device.getAddress();

    Log.d(TAG, "Device connected: " + deviceName + " (" + deviceAddress + ")");

    notifyDeviceConnected(deviceAddress, deviceName);
  }

// Device Disconnected
  @Override
  public void onDisconnected() {
    Log.d(TAG, "Device disconnected");

    notifyDeviceDisconnected();
  }

// ACK Received
  @Override
  public void onAcknowledgement(String acknowledgement) {
    Log.d(TAG, "ACK received: " + acknowledgement);

    notifyACKReceived(acknowledgement);
  }

// ======== EVENT NOTIFICATIONS (to Angular) ========

// ------ Notify: Device found ------
  public void notifyDeviceFound(String id, String name, int rssi) {
    JSObject data = new JSObject();

    data.put("id", id);
    data.put("name", name);
    data.put("rssi", rssi);

    notifyListeners("deviceFound", data);
  }

// ------ Notify: Payment Received ------
  private void notifyPaymentReceived(String transactionId, String senderUPI, String receiverUPI,
                                     int amount, String encryptedPayload, String signature,
                                     String nonce, long timestamp) {

    Log.d(TAG, "Notifying Angular: Payment received from " + senderUPI);

    JSObject data = new JSObject();
    data.put("transactionId", transactionId);
    data.put("senderUPI", senderUPI);
    data.put("receiverUPI", receiverUPI);
    data.put("amount",amount);
    data.put("encryptedPayload", encryptedPayload);
    data.put("signature", signature);
    data.put("nonce", nonce);
    data.put("timestamp", timestamp);

    notifyListeners("paymentReceived", data);
  }

// ------ Notify: Key Exchange Received ------
  private void notifyKeyExchangeReceived(String deviceId, String deviceName, String publicKeyBase64) {
    Log.d(TAG, "Notifying Angular: Key exchange received from " + deviceName);

    JSObject data = new JSObject();
    data.put("deviceId", deviceId);
    data.put("deviceName", deviceName);
    data.put("publicKey", publicKeyBase64);
    data.put("timestamp", System.currentTimeMillis());

    notifyListeners("keyExchangeReceived", data);
  }

// ------ Notify: Payment Error ------
  private void notifyPaymentError(String deviceId, String errorMessage) {
    Log.e(TAG, "Notifying Angular: Payment error from " + deviceId + " - " + errorMessage);

    JSObject data = new JSObject();
    data.put("deviceId", deviceId);
    data.put("message", errorMessage);
    data.put("timestamp", System.currentTimeMillis());

    notifyListeners("receiverError", data);
  }

// ------ Notify: Device Connected ------
  private void notifyDeviceConnected(String deviceAddress, String deviceName) {
    Log.d(TAG, "Notifying Angular: Device connected");

    JSObject data = new JSObject();
    data.put("deviceAddress", deviceAddress);
    data.put("deviceName", deviceName);

    notifyListeners("deviceConnected", data);
  }

// ------ Notify: Device Disconnected ------
  private void notifyDeviceDisconnected() {
    Log.d(TAG, "Notifying Angular: Device disconnected");

    notifyListeners("deviceDisconnected", new JSObject());
  }

// ------ Notify: ACK Received ------
  private void notifyACKReceived(String acknowledgement) {
    Log.d(TAG, "Notifying Angular: ACK received");

    JSObject data = new JSObject();
    data.put("ack", acknowledgement);

    notifyListeners("ackReceived", data);
  }
}
