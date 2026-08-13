package com.offlineupi.ble;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public class BluetoothGattServerManager {
  private static final String TAG = "BluetoothGattServer";
  private final Context context;
  private BluetoothGattServer gattServer;

  // Characteristic
  private BluetoothGattCharacteristic paymentCharacteristic;
  private BluetoothGattCharacteristic keyExchangeCharacteristic;

  // Stores the currently connected device
  private BluetoothDevice connectedDevice;

  // Cache for peer's public keys (deviceId -> publicKey)
  private final Map<String, String> peerPublicKeys = new HashMap<>();

  // Registered listeners
  private PaymentReceivedListener paymentReceivedListener;
  private KeyExchangeListener keyExchangeListener;
  private PaymentErrorListener paymentErrorListener;

  // Callback interfaces
  public interface PaymentReceivedListener {
    void onPaymentReceived(String transactionId, String senderUPI, String receiverUPI,int amount,
                           String encryptedPayload, String signature, String nonce, long timestamp);
  }

  public interface KeyExchangeListener {
    void onKeyExchangeReceived(String deviceId, String deviceName, String publicKeyBase64);
  }

  public interface PaymentErrorListener {
    void onPaymentError(String deviceId, String errorMessage);
  }

  // Constructor
  public BluetoothGattServerManager(Context context) {
    this.context = context;
  }

// ------ Method 1: Start GATT Server ------
  @SuppressLint("MissingPermission")
  public void startServer() {
    BluetoothManager bluetoothManager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
    gattServer = bluetoothManager.openGattServer(context, gattServerCallback);

    if (gattServer == null) {
      Log.e(TAG,"Failed to create GATT Server");
      return;
    }

    // Create service with payment and key exchange characteristics
    createUpiService();

    Log.d(TAG, "GATT Server Started");
  }

// ------ Method 2: Stop GATT Server ------
  @SuppressLint("MissingPermission")
  public void stopServer() {
    if(gattServer != null) {
      gattServer.close();
      Log.d(TAG, "GATT Server Stopped");
    }
  }

// ------ Method 3: Create Offline UPI Service with Payment + Key Exchange ------
  private void createUpiService() {

    Log.d(TAG, "Creating UPI Service...");

    BluetoothGattService service = new BluetoothGattService(
      BluetoothConstants.SERVICE_UUID,
      BluetoothGattService.SERVICE_TYPE_PRIMARY
    );

    // Payment Characteristic
    paymentCharacteristic = new BluetoothGattCharacteristic(
      BluetoothConstants.PAYMENT_CHARACTERISTIC_UUID,
      BluetoothGattCharacteristic.PROPERTY_WRITE | BluetoothGattCharacteristic.PROPERTY_NOTIFY,
      BluetoothGattCharacteristic.PERMISSION_WRITE
    );

    // Client Characteristic Configuration Descriptor (CCCD) for notification
    BluetoothGattDescriptor paymentCCCD = new BluetoothGattDescriptor(
      BluetoothConstants.CLIENT_CHARACTERISTIC_CONFIG_UUID,
      BluetoothGattDescriptor.PERMISSION_READ |
        BluetoothGattDescriptor.PERMISSION_WRITE
    );

    paymentCharacteristic.addDescriptor(paymentCCCD);

    // === Key Exchange Characteristic ===
    // UUID for key exchange: use a different UUID
    java.util.UUID KEY_EXCHANGE_UUID = java.util.UUID.fromString("abcdef01-1234-5678-1234-56789abcdef0");

    keyExchangeCharacteristic = new BluetoothGattCharacteristic(
      KEY_EXCHANGE_UUID,
      BluetoothGattCharacteristic.PROPERTY_WRITE | BluetoothGattCharacteristic.PROPERTY_NOTIFY,
      BluetoothGattCharacteristic.PERMISSION_WRITE
    );

    BluetoothGattDescriptor keyExchangeCCCD = new BluetoothGattDescriptor(
      BluetoothConstants.CLIENT_CHARACTERISTIC_CONFIG_UUID,
      BluetoothGattDescriptor.PERMISSION_READ | BluetoothGattDescriptor.PERMISSION_WRITE
    );

    keyExchangeCharacteristic.addDescriptor(keyExchangeCCCD);

    // Add characteristics to service
    service.addCharacteristic(paymentCharacteristic);
    service.addCharacteristic(keyExchangeCharacteristic);

    // Add service to GATT server
    if (context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)
      != PackageManager.PERMISSION_GRANTED) {

      Log.e(TAG, "BLUETOOTH_CONNECT permission not granted");
      return;
    }
    gattServer.addService(service);

    Log.d(TAG, "Offline UPI Service Added with Payment + Key Exchange");
  }

// ------ Method 4: GATT Server Callback ------
  private final BluetoothGattServerCallback gattServerCallback = new BluetoothGattServerCallback() {

    @Override
    @SuppressLint("MissingPermission")
    public void onConnectionStateChange(BluetoothDevice device, int status, int newState ) {

      String deviceName = device.getName() != null ? device.getName() : "Unknown";
      String deviceId = device.getAddress();

      Log.d(TAG, "Connection state changed: " + deviceName + " (" + deviceId + ")");

      if (newState == BluetoothGatt.STATE_CONNECTED) {
        connectedDevice = device;
        Log.d(TAG, "Device Connected: " + device.getAddress());
      }
      else if (newState == BluetoothGatt.STATE_DISCONNECTED) {
        Log.d(TAG, "Device Disconnected: " + deviceName);
        connectedDevice = null;
        peerPublicKeys.remove(deviceId);
      }
    }
    @Override
    @SuppressLint("MissingPermission")
    public void onCharacteristicWriteRequest(
      BluetoothDevice device,
      int requestId,
      BluetoothGattCharacteristic characteristic,
      boolean preparedWrite,
      boolean responseNeeded,
      int offset,
      byte[] value ) {

      Log.d(TAG, "Characteristic write request from: " + device.getName());

      try {
        // Convert received bytes into String
        String receivedData = new String(value, StandardCharsets.UTF_8);
        Log.d(TAG, "Received Data: " + receivedData);

        // Step 1: Determine message type (key exchange or payment)
        boolean isKeyExchange = characteristic.getUuid().toString()
          .equals("abcdef01-1234-5678-1234-56789abcdef0");

        if (isKeyExchange) {
          Log.d(TAG, "Received key exchange request");
          handleKeyExchange(device, receivedData, requestId, responseNeeded);
        } else {
          Log.d(TAG, "Received payment data");
          handlePaymentWrite(device, receivedData, requestId, responseNeeded);
        }
      } catch (Exception e) {
        Log.e(TAG, "Error processing write request: " + e.getMessage());

        if (responseNeeded && context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED) {
          gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED, offset, null);
        }

        // Notify error listener
        if (paymentErrorListener != null) {
          paymentErrorListener.onPaymentError(device.getAddress(), "Error processing request: " + e.getMessage());
        }
      }
    }

    @SuppressLint("MissingPermission")
    public void onCharacteristicChanged (BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value){
      Log.d(TAG, "Characteristic changed: " + characteristic.getUuid());
    }
  };

// ------ Method 5: Handle Key Exchange Request ------
  @SuppressLint("MissingPermission")
  private void handleKeyExchange(BluetoothDevice device, String payloadJSON, int requestId, boolean responseNeeded) {
    Log.d(TAG, "Processing key exchange...");

    try {
      // Parse key exchange payload
      JSONObject payload = new JSONObject(payloadJSON);

      String deviceId = device.getAddress();
      String deviceName = device.getName() != null ? device.getName() : "Unknown";
      String publicKeyBase64 = payload.getString("publicKey");

      // Store peer's public key
      peerPublicKeys.put(deviceId, publicKeyBase64);

      Log.d(TAG, "Peer public key stored for " + deviceName);

      // Notify listener
      if (keyExchangeListener != null) {
        keyExchangeListener.onKeyExchangeReceived(deviceId, deviceName, publicKeyBase64);
      }

      // Send success response
      if (responseNeeded && context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED) {
        gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null);
      }
    }
    catch (JSONException e) {
      Log.e(TAG, "Error parsing key exchange: " + e.getMessage());

      if (responseNeeded && context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED) {
        gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED, 0, null);
      }

      if (paymentErrorListener != null) {
        paymentErrorListener.onPaymentError(device.getAddress(), "Invalid key exchange format");
      }
    }
  }

// ------ Method 6: Handle Payment Write Request ------
  private void handlePaymentWrite(BluetoothDevice device, String payloadJSON, int requestId, boolean responseNeeded) {
    Log.d(TAG, "Processing payment...");

    try {
      String deviceId = device.getAddress();

      // Step 1: Validate encrypted payload using BLEPayloadHandler
      BLEPayloadHandler.ValidationResult validation = BLEPayloadHandler.validateEncryptedPayload(payloadJSON);

      if (!validation.valid) {
        Log.w(TAG, "Payload validation failed: " + validation.message);

        if (responseNeeded && context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED) {
          gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED, 0, null);
        }

        if (paymentErrorListener != null) {
          paymentErrorListener.onPaymentError(deviceId, validation.message);
        }

        return;
      }

      Log.d(TAG, "Payload validation passed");

      // Step 2: Extract payment details
      JSONObject payload = validation.payload;

      String transactionId = "BLE_" + payload.getString("nonce");
      String senderUPI = payload.getString("senderUPI");
      String receiverUPI = payload.getString("receiverUPI");
      String encryptedData = payload.getString("encryptedData");
      String signature = payload.getString("signature");
      String nonce = payload.getString("nonce");
      long timestamp = payload.getLong("timestamp");

      // Step 3: Check if we have sender's public key
      String senderPublicKey = peerPublicKeys.get(deviceId);
      if (senderPublicKey == null) {
        Log.w(TAG, "Sender public key not cached. Key exchange may not have completed.");
      }
      else {
        Log.d(TAG, "Sender public key found in cache");
      }

      // Step 4: Notify payment received listener
      if (paymentReceivedListener != null) {
        paymentReceivedListener.onPaymentReceived(
          transactionId,
          senderUPI,
          receiverUPI,
          0,  // Amount will be decrypted by Angular layer
          encryptedData,
          signature,
          nonce,
          timestamp
        );
      }

      // Step 5: Send ACK back to sender
      sendPaymentACK(device, "SUCCESS", nonce);

      // Step 6: Send success response to characteristic write
      if (responseNeeded && context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED) {
        gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null);
      }

      Log.d(TAG, "Payment processed successfully");
    }
    catch (JSONException e) {
      Log.e(TAG, "Error parsing payment: " + e.getMessage());

      if (responseNeeded && context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED) {
        gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED, 0, null);
      }

      if (paymentErrorListener != null) {
        paymentErrorListener.onPaymentError(device.getAddress(), "Invalid payment format");
      }
    }
  }

// ------ Method 7: Send Ack to sender ------
  @SuppressLint("MissingPermission")
  public void sendPaymentACK(BluetoothDevice device, String status, String nonce) {
    if (connectedDevice == null) {
      Log.e(TAG, "No connected device for ACK");
      return;
    }

    if (paymentCharacteristic == null) {
      Log.e(TAG, "Payment characteristic not available");
      return;
    }

    if (context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
      Log.e(TAG, "Bluetooth permission missing");
      return;
    }

    try {
      // Create ACK payload
      JSONObject ackPayload = new JSONObject();
      ackPayload.put("success", status.equals("SUCCESS"));
      ackPayload.put("nonce", nonce);
      ackPayload.put("timestamp", System.currentTimeMillis());

      // update characteristic value
      paymentCharacteristic.setValue(ackPayload.toString().getBytes(StandardCharsets.UTF_8));

      // Notify sender
      gattServer.notifyCharacteristicChanged(device, paymentCharacteristic, false);

      Log.d(TAG, "ACK Sent : " + ackPayload);
    } catch (JSONException e) {
      Log.e(TAG, "Error sending ACK: " + e.getMessage());
    }
  }

// ------ Method 8: Send key exchange ACK ------
  @SuppressLint("MissingPermission")
  public void sendKeyExchangeACK(BluetoothDevice device) {
    if (keyExchangeCharacteristic == null) {
      Log.e(TAG, "Kay exchange characteristic not available");
      return;
    }

    if (context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
      Log.e(TAG, "Bluetooth permission missing");
      return;
    }

    try {
      JSONObject ackPayload = new JSONObject();
      ackPayload.put("success", true);
      ackPayload.put("timestamp", System.currentTimeMillis());

      keyExchangeCharacteristic.setValue(ackPayload.toString().getBytes(StandardCharsets.UTF_8));
      gattServer.notifyCharacteristicChanged(device, keyExchangeCharacteristic, false);

      Log.d(TAG, "Key exchange ACK sent");
    }
    catch (JSONException e) {
      Log.e(TAG, "Error sending key exchange ACK: " + e.getMessage());
    }
  }

// ------ Helper Methods -------
// Get peer public key
  public String getPeerPublicKey(String deviceId) {
    return peerPublicKeys.get(deviceId);
  }

// Register payment listener
  public void setPaymentReceivedListener(PaymentReceivedListener listener) {
    this.paymentReceivedListener = listener;
  }

  public void setKeyExchangeListener(KeyExchangeListener listener) {
    this.keyExchangeListener = listener;
  }

  public void setPaymentErrorListener(PaymentErrorListener listener) {
    this.paymentErrorListener = listener;
  }
}
