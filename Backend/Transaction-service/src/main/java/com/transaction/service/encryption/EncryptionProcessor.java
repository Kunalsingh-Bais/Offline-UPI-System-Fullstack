package com.transaction.service.encryption;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

@Service
public class EncryptionProcessor {

    @Autowired
    private RSAKeyService rsaKeyService;

    @Autowired
    private AESEncryptionService aesEncryptionService;

    @Autowired
    private HashingService hashingService;

    // ------ Method 1: DECRYPT and Combined String ------
    // Decrypt payment from frontend's combined encrypted string

    public Map<String,Object> decryptAndVerifyPayment(String combinedEncryptedData) throws Exception {

        System.out.println("\n=== DECRYPTION STARTED ===");
        System.out.println("📦 Received combined encrypted data");
        System.out.println("📏 Length: " + combinedEncryptedData.length());

        try {
            // Step 1: Split by comma
            System.out.println("\n📍 Step 1: Split encrypted data");
            String[] parts = combinedEncryptedData.split(",");

            if (parts.length != 3) {
                throw new Exception("Invalid format. Expected 3 parts separated by comma, got " + parts.length);
            }

            String encryptedAESKey = parts[0];
            String encryptedPaymentData = parts[1];
            String receivedHash = parts[2];

            System.out.println("✅ Split successful:");
            System.out.println("   Part 1 (RSA-key): " + encryptedAESKey.length() + " chars");
            System.out.println("   Part 2 (AES-data): " + encryptedPaymentData.length() + " chars");
            System.out.println("   Part 3 (hash): " + receivedHash.length() + " chars");

            // Step 2: Decrypt with original method
            System.out.println("\n📍 Step 2: Call decryption logic");
            Map<String, Object> result = decryptAndVerifyTransaction(
                    encryptedAESKey,
                    encryptedPaymentData,
                    receivedHash
            );

            System.out.println("=== DECRYPTION COMPLETED ===\n");
            return result;

        } catch (Exception e) {
            System.out.println("❌ Decryption error: " + e.getMessage());
            e.printStackTrace();

            Map<String, Object> errorResult = new HashMap<>();
            errorResult.put("hashVerified", false);
            errorResult.put("error", "Decryption failed: " + e.getMessage());
            return errorResult;
        }
    }

    // ------ Method 2: DECRYPT with Separate Parameters ------
    // Server-side decryption

    public Map<String, Object> decryptAndVerifyTransaction(String encryptedAESKey, String encryptedPaymentData, String dataHash) throws Exception {
        try {
            // Validate inputs
            if (encryptedAESKey == null || encryptedAESKey.isEmpty()) {
                throw new Exception("Encrypted AES Key is required");
            }
            if (encryptedPaymentData == null || encryptedPaymentData.isEmpty()) {
                throw new Exception("Encrypted payment data is required");
            }
            if (dataHash == null || dataHash.isEmpty()) {
                throw new Exception("Data hash is required");
            }

            System.out.println("\n🔐 Decrypting AES key with RSA private key...");

            // Decrypt AES key using RSA private key
            String decryptedAESKeyBase64 = rsaKeyService.decryptWithPrivateKey(encryptedAESKey);

            // ===== DEBUG: Check what we got =====
            System.out.println("✅ AES key decrypted from RSA");
            System.out.println("   Decrypted AES key length: " + (decryptedAESKeyBase64 != null ? decryptedAESKeyBase64.length() : "NULL"));
            System.out.println("   First 50 chars: " + (decryptedAESKeyBase64 != null ? decryptedAESKeyBase64.substring(0, Math.min(50, decryptedAESKeyBase64.length())) : "NULL"));

            // Verify it's valid Base64
            try {
                byte[] decodedAESKey = Base64.getDecoder().decode(decryptedAESKeyBase64);
                System.out.println("   Decoded AES key length: " + decodedAESKey.length + " bytes");
                System.out.println("   ✅ Valid Base64 format");
            } catch (IllegalArgumentException e) {
                System.out.println("   ❌ Invalid Base64 format: " + e.getMessage());
                throw new Exception("Decrypted AES key is not valid Base64: " + e.getMessage());
            }

            System.out.println("\n🔐 Decrypting payment data with AES key...");

            // Decrypt payment data using AES key
            String decryptPaymentData = aesEncryptionService.decryptWithAES(encryptedPaymentData,decryptedAESKeyBase64);

            // ===== DEBUG: Check decrypted data =====
            System.out.println("✅ Payment data decrypted");
            System.out.println("   Decrypted data length: " + (decryptPaymentData != null ? decryptPaymentData.length() : "NULL"));
            System.out.println("   Decrypted data: " + decryptPaymentData);

            // Verify SHA-256 hash
            System.out.println("\n🔐 Verifying SHA-256 hash...");
           // System.out.println("   Received hash: " + receivedHash);

            // Verify SHA-256 hash
            boolean hashVerified = hashingService.verifyHash(encryptedPaymentData,dataHash);

            // If hash doesn't match, data was tampered!
            if(!hashVerified) {
                System.out.println("❌ Hash verification FAILED - Data tampered!");

                // Debug: Calculate what hash SHOULD be
                try {
                    // Hash the encrypted payload (what hash should match)
                    String calculatedHash = calculateHash(encryptedPaymentData);
                    System.out.println("   Expected hash (of encrypted data): " + calculatedHash);
                } catch (Exception e) {
                    System.out.println("   Could not calculate expected hash: " + e.getMessage());
                }
                Map<String, Object> result = new HashMap<>();
                result.put("hashVerified", false);
                result.put("error", "Hash verification failed - data was tampered!");
                return result;
            }

            System.out.println("✅ Hash verified - Data integrity confirmed");

            // Parse payment data
            // Format: sender|receiver|amount
            String[] parts = decryptPaymentData.split("\\|");

            // Validate we have all 3 parts
            if(parts.length != 3) {
                throw new Exception("Invalid payment data format");
            }

            // Extract values
            String senderUpiId = parts[0].trim();
            String receiverUpiId = parts[1].trim();
            String amount = parts[2].trim();

            // Build response
            Map<String, Object> result = new HashMap<>();
            result.put("senderUpiId", senderUpiId);
            result.put("receiverUpiId", receiverUpiId);
            result.put("amount",amount);
            result.put("hashVerified", true);
            result.put("error", null);

            return result;
        }
        catch (Exception e) {
            System.out.println("❌ DECRYPTION FAILED!");
            System.out.println("Error message: " + e.getMessage());
            System.out.println("Error class: " + e.getClass().getName());
            e.printStackTrace();  // This prints full stack trace

            Map<String, Object> errorResult = new HashMap<>();
            errorResult.put("hashVerified", false);
            errorResult.put("error", "Decryption failed: " + e.getMessage());
            return errorResult;
        }
    }

    // ------ Method 2: Generate Public key for client ------
    // Called when client requests public key
    public Map<String, Object> generatePublicKeyData() throws Exception {
        try {
            // Get public key from RSA service - from server
            String publicKey = rsaKeyService.getPublicKeyString();

            // Return public key response
            Map<String, Object> result = new HashMap<>();
            result.put("publicKey", publicKey);
            result.put("algorithm", "RSA");
            result.put("keySize", 2048);
            result.put("success", true);

            System.out.println(
                    "Backend Public Key: "
                            + rsaKeyService.getPublicKeyString().substring(0, 80)
            );
            return result;
        }
        catch (Exception e) {
            Map<String, Object> errorResult = new HashMap<>();
            errorResult.put("success", false);
            errorResult.put("error", "Failed to generate public key: " +e.getMessage());
            return errorResult;
        }
    }

    // Helper method to calculate hash
    private String calculateHash(String data) throws Exception {
        java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
        byte[] hashBytes = digest.digest(data.getBytes());
        return Base64.getEncoder().encodeToString(hashBytes);
    }
}
