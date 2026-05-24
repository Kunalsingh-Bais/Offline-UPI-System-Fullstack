package com.transaction.service.encryption;

import org.springframework.stereotype.Service;
import java.security.MessageDigest;
import java.util.Base64;

@Service
public class HashingService {
    private final String ALGORITHM= "SHA-256";

    // ------ Method 1: Generate SHA-256 HASH of data ------
    public String generateSHA256Hash(String data) throws Exception {
        try {
            // Get SHA-256 message digest
            MessageDigest digest = MessageDigest.getInstance(ALGORITHM);

            // Compute hash of the data
            byte[] hashBytes = digest.digest(data.getBytes());

            // Convert to Base64 for transmission
            String hashBase64 = Base64.getEncoder().encodeToString(hashBytes);

            return hashBase64;
        }
        catch (Exception e) {
            throw new Exception("SHA-256 hashing failed: " +e.getMessage(), e);
        }
    }

    // ------ Method 2: Verify Hash (Did data get tampered?) ------
    // Verifies if data matches the hash
    public boolean verifyHash(String data , String expectedHash) throws Exception {
        try {
            // Generate hash of received data
            String computedHash = generateSHA256Hash(data);

            // Compare with expected hash
            boolean isValid = computedHash.equals(expectedHash);

            return isValid;
        }
        catch (Exception e) {
            throw new Exception("Hash verification failed: " + e.getMessage(), e);
        }
    }

    // ------ Method 3: Generate Transaction Hash ------
    // Creates unique hash for transaction
    public String generateTransactionHash(String senderUpiId, String receiverUpiId, String amount, String timestamp) throws Exception {
        try {
            // Combine all transaction details
            String transactionData = senderUpiId + "|" + receiverUpiId + "|" + amount + "|" + timestamp;

            // Generate hash
            return generateSHA256Hash(transactionData);
        } catch (Exception e) {
            throw new Exception("Transaction hash generation failed: "+e.getMessage() ,e);
        }
    }

    public String getAlgorithm() {
        return ALGORITHM;
    }
}
