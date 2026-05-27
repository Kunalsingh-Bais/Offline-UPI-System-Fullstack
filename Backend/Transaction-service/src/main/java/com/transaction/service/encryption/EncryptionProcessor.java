package com.transaction.service.encryption;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

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

    // ------ Method 1: DECRYPT and VERIFY Transaction ------
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

            // Decrypt AES key using RSA private key
            String decryptedAESKeyBase64 = rsaKeyService.decryptWithPrivateKey(encryptedAESKey);

            // Decrypt payment data using AES key
            String decryptPaymentData = aesEncryptionService.decryptWithAES(encryptedPaymentData,decryptedAESKeyBase64);

            // Verify SHA-256 hash
            boolean hashVerified = hashingService.verifyHash(decryptPaymentData,dataHash);

            // If hash doesn't match, data was tampered!
            if(!hashVerified) {
                Map<String, Object> result = new HashMap<>();
                result.put("hashVerified", false);
                result.put("error", "Hash verification failed - data was tampered!");
                return result;
            }

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
            Map<String, Object> errorResult = new HashMap<>();
            errorResult.put("hashVerified", false);
            errorResult.put("error", "Decryption failed: " +e.getMessage());
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

            return result;
        }
        catch (Exception e) {
            Map<String, Object> errorResult = new HashMap<>();
            errorResult.put("success", false);
            errorResult.put("error", "Failed to generate public key: " +e.getMessage());
            return errorResult;
        }
    }
}
