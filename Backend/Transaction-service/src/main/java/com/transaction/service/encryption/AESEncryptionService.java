package com.transaction.service.encryption;

import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

@Service
public class AESEncryptionService {

    private final String ALGORITHM = "AES";
    private final String CIPHER_ALGORITHM = "AES/GCM/NoPadding";
    private final int KEY_SIZE = 256;
    private final int IV_SIZE = 12;  // 12 bytes for GCM
    private final int AUTH_TAG_SIZE = 128;     // 128 bits = 16 bytes

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

    // ------ Method 2: Encrypt with AES-CGM key ------
    // Encrypts data using AEs key
    public String encryptWithAES(String plainText, String aesKeyBase64) throws Exception {
        try {
            System.out.println("Encrypting with AES-GCM...");

            // Decode AES key from Base64
            byte[] decodeKey = Base64.getDecoder().decode(aesKeyBase64);

            // Create SecretKey from bytes
            SecretKey secretKey = new SecretKeySpec(decodeKey, 0,decodeKey.length, ALGORITHM);

            // Create cipher with AES
            Cipher cipher = Cipher.getInstance(CIPHER_ALGORITHM);

            // Generate random IV
            byte[] iv = new byte[IV_SIZE];
            new java.security.SecureRandom().nextBytes(iv);

            // Initialize with IV
            GCMParameterSpec gcmSpec = new GCMParameterSpec(AUTH_TAG_SIZE, iv);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, gcmSpec);

            // Encrypt plain text
            byte[] encryptedBytes = cipher.doFinal(plainText.getBytes());

            // Combine IV + encrypted data
            byte[] combined = new byte[iv.length + encryptedBytes.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(encryptedBytes, 0, combined, iv.length, encryptedBytes.length);

            // Convert to Base64 for transmission
            String encryptedBase64 = Base64.getEncoder().encodeToString(combined);

            System.out.println("Encryption successful");
            return encryptedBase64;
        }
        catch (Exception e) {
            throw new Exception("AES encryption failed: " +e.getMessage(), e);
        }
    }

    // ------ Method 3: Decrypt with AES-GCM key ------
    // Decrypts data using AES key
    public String decryptWithAES(String encryptedText, String aesKeyBase64) throws Exception {
        try {
            System.out.println("Decrypting with AES-GCM...");

            // Decode AES from Base64
            byte[] decodeKey = Base64.getDecoder().decode(aesKeyBase64.trim());

            // Create SecretKey from bytes
            SecretKey secretKey = new SecretKeySpec(decodeKey, 0, decodeKey.length,ALGORITHM);

            // Decode encrypted text from Base64
            byte[] decodeBytes = Base64.getDecoder().decode(encryptedText.trim());

            // Extract IV
            byte[] iv = new byte[IV_SIZE];
            System.arraycopy(decodeBytes, 0, iv, 0, IV_SIZE);

            // Extract ciphertext
            byte[] cipherText = new byte[decodeBytes.length - IV_SIZE];
            System.arraycopy(decodeBytes, IV_SIZE, cipherText, 0, cipherText.length);

            // Create cipher and decrypt
            Cipher cipher = Cipher.getInstance(CIPHER_ALGORITHM);

            // Create GCM spec with IV
            GCMParameterSpec gcmSpec = new GCMParameterSpec(AUTH_TAG_SIZE, iv);
            cipher.init(Cipher.DECRYPT_MODE, secretKey,gcmSpec);

            System.out.println("Cipher initialized");

            // Decrypt
            byte[] decryptedBytes = cipher.doFinal(cipherText);

            // Convert to string
            String decryptedText = new String(decryptedBytes);

            System.out.println("Decryption successful");
            System.out.println("Decrypted data: " + decryptedText);

            return decryptedText;
        }
        catch (javax.crypto.AEADBadTagException e) {
            System.out.println("Authentication tag verification failed!");
            System.out.println("This means the data was modifies during transmission");
            throw new Exception("AES-GCM authentication failed (data tampered): " + e.getMessage(), e);
        }
        catch (Exception e) {
            throw new Exception("AES decryption failed: " +e.getMessage(), e);
        }
    }

    public String getAlgorithm() {
        return CIPHER_ALGORITHM;
    }

    public int getKeySize() {
        return KEY_SIZE;
    }
}
