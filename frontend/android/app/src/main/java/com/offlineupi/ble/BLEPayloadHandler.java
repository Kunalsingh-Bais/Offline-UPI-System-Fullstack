package com.offlineupi.ble;

import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

public class BLEPayloadHandler {
  private static final String TAG = "BLEPayloadHandler";

  // Store seen nonces (prevent replay attacks)
  private static final Set<String> seenNonces = new HashSet<>();

  // Validation result
  public static class ValidationResult {
    public boolean valid;
    public String message;
    public JSONObject payload;

    public ValidationResult(boolean valid, String message, JSONObject payload) {
      this.valid = valid;
      this.message = message;
      this.payload = payload;
    }
  }

  public static ValidationResult validateEncryptedPayload(String payloadJSON) {
    Log.d(TAG, "Validating encrypted payload...");

    try {
      // Step 1: Parse JSON
      JSONObject payload = new JSONObject(payloadJSON);

      // Step 2: Check required fields
      if (!payload.has("encryptedData")) {
        return new ValidationResult(false, "Missing encryptedData", null);
      }
      if (!payload.has("signature")) {
        return new ValidationResult(false, "Missing signature", null);
      }
      if (!payload.has("nonce")) {
        return new ValidationResult(false, "Missing nonce", null);
      }
      if (!payload.has("timestamp")) {
        return new ValidationResult(false, "Missing timestamp", null);
      }
      if (!payload.has("senderUPI")) {
        return new ValidationResult(false, "Missing senderUPI", null);
      }
      if (!payload.has("receiverUPI")) {
        return new ValidationResult(false, "Missing receiverUPI", null);
      }

      // Step 3: Validate fields types
      String encryptedData = payload.getString("encryptedData");
      String signature = payload.getString("signature");
      String nonce = payload.getString("nonce");
      long timestamp = payload.getLong("timestamp");
      String senderUPI = payload.getString("senderUPI");
      String receiverUPI = payload.getString("receiverUPI");

      if (encryptedData.isEmpty()) {
        return new ValidationResult(false, "encryptedData is empty", null);
      }
      if (signature.isEmpty()) {
        return new ValidationResult(false, "signature is empty", null);
      }
      if (nonce.isEmpty()) {
        return new ValidationResult(false, "nonce is empty", null);
      }

      // Step 4: Validate signature format (hex string)
      if (!isHexString(signature)) {
        return new ValidationResult(false, "signature must be hex string", null);
      }
      if (signature.length() < 32) {
        return new ValidationResult(false, "signature too short", null);
      }

      // Step 5: Check for replay attack (nonce)
      if (seenNonces.contains(nonce)) {
        Log.e(TAG, "REPLAY ATTACK DETECTED: Nonce already seen");
        return new ValidationResult(false, "Replay attack detected: Nonce already used", null);
      }

      // Step 6: Validate timestamp (not too old)
      long ageMs = System.currentTimeMillis() - timestamp;
      long MAX_AGE_MS = 5 * 60 * 1000;  // 5 minutes

      if (ageMs > MAX_AGE_MS) {
        return new ValidationResult(false,
          "Payment is too old: " + ageMs + "ms > " + MAX_AGE_MS + "ms", null);
      }
      if (ageMs < 0) {
        Log.w(TAG, "Payment timestamp is in future (clock skew detected)");
      }

      // Step 7: Validate UPI format
      if (!isValidUPI(senderUPI)) {
        return new ValidationResult(false, "Invalid senderUPI format", null);
      }
      if (!isValidUPI(receiverUPI)) {
        return new ValidationResult(false, "Invalid receiverUPI format", null);
      }

      // Step 8: Check not self-transfer
      if (senderUPI.equals(receiverUPI)) {
        return new ValidationResult(false, "Cannot send money to yourself", null);
      }

      // Step 9: Check payload
      if (payloadJSON.length() > 512) {
        return new ValidationResult(false, "Payload too large: " + payloadJSON.length() + " > 512", null);
      }

      // Step 10: Register nonce as seen (prevent replay)
      seenNonces.add(nonce);

      Log.d(TAG, "Payload validation successful");

      return new ValidationResult(true, "Valid payload", payload);
    }
    catch (JSONException e) {
      Log.e(TAG, "JSON parsing error: " + e.getMessage());
      return new ValidationResult(false, "Invalid JSON format", null);
    }
    catch (Exception e) {
      Log.e(TAG, "Validation error: " + e.getMessage());
      return new ValidationResult(false, "Validation error: " + e.getMessage(), null);
    }
  }

// ------ Method 2: Is Valid UPI Format ------
  private static boolean isValidUPI(String upi) {
    if (upi == null || upi.isEmpty()) {
      return false;
    }

    // UPI format: username@bank
    String upiPattern = "^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$";

    return upi.matches(upiPattern) && upi.length() >= 5 && upi.length() <= 50;
  }

// ------ Method 3: Is Hex String ------
  private static boolean isHexString(String str) {
    if (str == null || str.isEmpty()) {
      return false;
    }

    return str.matches("^[a-f0-9]+$") || str.matches("^[A-F0-9]+$");
  }

// ------ Method 4: Clear Nonce Cache ------
  public static void clearNonceCache() {
    Log.d(TAG, "Clearing nonce cache");
    seenNonces.clear();
    Log.d(TAG, "Nonce cache cleared");
  }

// ------ Method 5: Get Cache Stats ------
  public static int getNonceCacheSize() {
    return seenNonces.size();
  }
}
