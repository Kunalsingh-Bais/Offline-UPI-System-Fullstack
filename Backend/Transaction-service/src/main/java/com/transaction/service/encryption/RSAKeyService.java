package com.transaction.service.encryption;

import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import java.security.*;
import java.util.Base64;

@Service
public class RSAKeyService {
    private KeyPair keyPair;
    private final int KEY_SIZE = 2048;     // 2048-bit RSA key
    private final String ALGORITHM = "RSA";
    private final String CIPHER_ALGORITHM = "RSA/ECB/PKCS1Padding";

    // Constructor - Generate keys when service starts
    public RSAKeyService() {
        try {
            generateKeyPair();
            System.out.println("RSA Key Service Initialized");
            System.out.println("Key Size: " + KEY_SIZE + " bits");
            System.out.println("Public Key Ready for Distribution");
            System.out.println("Private Key Secured on Server");
        }
        catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("RSA algorithm not available", e);
        }
    }

    // ------ Method 1: Generate RSA Key pair ------
    private void generateKeyPair() throws NoSuchAlgorithmException {
        // Create RSA Key pair generator
        KeyPairGenerator keyGenerator = KeyPairGenerator.getInstance(ALGORITHM);

        // Initialize with 2048-bit key size
        keyGenerator.initialize(KEY_SIZE);

        // Generate the key pair
        this.keyPair = keyGenerator.generateKeyPair();

        System.out.println("RSA KeyPair generated (2048-bit)");
    }

    // ------ Method 2: Get PUBLIC Key as BASE64 String ------
    // Converts public key to Base64 string
    public String getPublicKeyString() {
        try {
            // Get public key from pair
            PublicKey publicKey = keyPair.getPublic();

            // Convert to bytes
            byte[] publicKeyBytes = publicKey.getEncoded();

            // Convert bytes to Base64 string
            String publicKeyBase64 = Base64.getEncoder().encodeToString(publicKeyBytes);

            return publicKeyBase64 ;
        }
        catch (Exception e) {
            throw new RuntimeException("Error exporting public key", e);
        }
    }

    // ------ Method 3: Get Private Key (Server only) ------
    // Returns private key object
    public PrivateKey getPrivateKey() {
        return keyPair.getPrivate();
    }

    // ------ Method 4: Encrypt with Public Key ------
    // Encrypts text using public key
    public String encryptWithPublicKey(String plainText) throws Exception {
        try {
            PublicKey publicKey = keyPair.getPublic();

            // Create RSA cipher
            Cipher cipher = Cipher.getInstance(CIPHER_ALGORITHM);

            // Initialize in ENCRYPT mode with public key
            cipher.init(Cipher.ENCRYPT_MODE, publicKey);

            // Encrypt the plain text
            byte[] encryptedBytes = cipher.doFinal(plainText.getBytes());

            // Convert to Base64 for JSON transmission
            String encryptedBase64 = Base64.getEncoder().encodeToString(encryptedBytes);

            return encryptedBase64;
        }
        catch (Exception e) {
            throw new Exception("RSA encryption failed: " + e.getMessage(), e);
        }
    }

    // ----- Method 5: Decrypt with PRIVATE Key
    // Decrypts text using private key
    public String decryptWithPrivateKey(String encryptedText) throws Exception {
        try {
            PrivateKey privateKey = keyPair.getPrivate();

            // Create RSA cipher
            Cipher cipher = Cipher.getInstance(CIPHER_ALGORITHM);

            // Initialize in DECRYPT mode with private key
            cipher.init(Cipher.DECRYPT_MODE, privateKey);

            // Decode Base64 to bytes
            byte[] decodedBytes = Base64.getDecoder().decode(encryptedText);

            // Decrypt the bytes
            byte[] decryptedBytes = cipher.doFinal(decodedBytes);

            // Convert bytes to string
            String decryptedText = new String(decryptedBytes);
            return decryptedText;
        }
        catch (IllegalArgumentException e) {
            throw new Exception("Invalid Base64 format: "+ e.getMessage(), e);
        }
        catch (Exception e) {
            throw new Exception("RSA decryption failed: "+ e.getMessage(), e);
        }
    }

    // ------ Utility Methods ------
    public int getKeySize() {
        return KEY_SIZE;
    }

    public String getAlgorithm() {
        return ALGORITHM;
    }
}
