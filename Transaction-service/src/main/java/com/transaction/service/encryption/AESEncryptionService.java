package com.transaction.service.encryption;

import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

@Service
public class AESEncryptionService {

    private final String ALGORITHM = "AES";
    private final int KEY_SIZE = 256;

    // ------ Method 1: Generate AES Key ------
    // Generates random AES key
    public String generateAESKey() throws Exception {
        try {
            // Create KeyGenerator for AES
            KeyGenerator keyGenerator = KeyGenerator.getInstance(ALGORITHM);

            // Initialize with 256-bit key size
            keyGenerator.init(KEY_SIZE);

            // Generate the secret key
            SecretKey secretKey = keyGenerator.generateKey();

            // Convert to Base64 for transmission
            byte[] encodeKey = secretKey.getEncoded();
            String keyBase64 = Base64.getEncoder().encodeToString(encodeKey);

            return keyBase64;
        }
        catch (Exception e) {
            throw new Exception("AES key generation failed: "+ e.getMessage(), e);
        }
    }

    // ------ Method 2: Encrypt with AES key ------
    // Encrypts data using AEs key
    public String encryptWithAES(String plainText, String aesKeyBase64) throws Exception {
        try {
            // Decode AES key from Base64
            byte[] decodeKey = Base64.getDecoder().decode(aesKeyBase64);

            // Create SecretKey from bytes
            SecretKey secretKey = new SecretKeySpec(decodeKey, 0,decodeKey.length, ALGORITHM);

            // Create cipher with AES
            Cipher cipher = Cipher.getInstance(ALGORITHM);

            // Initialize in ENCRYPT mode
            cipher.init(Cipher.ENCRYPT_MODE, secretKey);

            // Encrypt plain text
            byte[] encryptedBytes = cipher.doFinal(plainText.getBytes());

            // Convert to Base64 for transmission
            String encryptedBase64 = Base64.getEncoder().encodeToString(encryptedBytes);

            return encryptedBase64;
        }
        catch (Exception e) {
            throw new Exception("AES encryption failed: " +e.getMessage(), e);
        }
    }

    // ------ Method 3: Decrypt with AES key ------
    // Decrypts data using AES key
    public String decryptWithAES(String encryptedText, String aesKeyBase64) throws Exception {
        try {
            // Decode AES from Base64
            byte[] decodeKey = Base64.getDecoder().decode(aesKeyBase64);

            // Create SecretKey from bytes
            SecretKey secretKey = new SecretKeySpec(decodeKey, 0, decodeKey.length,ALGORITHM);

            // Create cipher with AES
            Cipher cipher = Cipher.getInstance(ALGORITHM);

            // Initialize in DECRYPT mode
            cipher.init(Cipher.DECRYPT_MODE, secretKey);

            // Decode encrypted text from Base64
            byte[] decodeBytes = Base64.getDecoder().decode(encryptedText);

            // Decrypt
            byte[] decryptedBytes = cipher.doFinal(decodeBytes);

            // Convert to string
            String decryptedText = new String(decryptedBytes);

            return decryptedText;
        }
        catch (Exception e) {
            throw new Exception("AES decryption failed: " +e.getMessage(), e);
        }
    }

    public String getAlgorithm() {
        return ALGORITHM;
    }

    public int getKeySize() {
        return KEY_SIZE;
    }
}
