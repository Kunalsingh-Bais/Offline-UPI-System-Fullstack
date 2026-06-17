package com.transaction.service.encryption;

import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.OAEPParameterSpec;
import javax.crypto.spec.PSource;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.security.*;
import java.security.spec.MGF1ParameterSpec;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

@Service
public class RSAKeyService {
    private KeyPair keyPair;
    private final int KEY_SIZE = 2048;     // 2048-bit RSA key
    private final String ALGORITHM = "RSA";
    private final String CIPHER_ALGORITHM = "RSA/ECB/OAEPWithSHA-256AndMGF1Padding";

    // Key file paths
    private final String PRIVATE_KEY_FILE = "PRIVATE_key.key";
    private final String PUBLIC_KEY_FILE = "public_key.key";

    // Constructor - Generate keys when service starts
    public RSAKeyService() {
        try {
            // Try to load existing keys
            if (keysExist()) {
                loadKeysFromFile();
                System.out.println("✅ RSA keys loaded from disk");
            } else {
                // Generate new keys
                generateKeyPair();
                saveKeysToFile();
                System.out.println("✅ RSA keys generated and saved to disk");
            }

            System.out.println("🔑 RSA Key Service Initialized");
            System.out.println("   Key Size: " + KEY_SIZE + " bits");
            System.out.println("   Algorithm: " + CIPHER_ALGORITHM);
            System.out.println("   Public Key Ready for Distribution");
            System.out.println("   Private Key Secured on Server");
        }
        catch (Exception e) {
            throw new RuntimeException("RSA algorithm not available", e);
        }
    }

    // ------ Check if key files exist ------
    private boolean keysExist() {
        return Files.exists(Paths.get(PRIVATE_KEY_FILE)) &&
                Files.exists(Paths.get(PUBLIC_KEY_FILE));
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

    // ------ Save keys to file ------
    private void saveKeysToFile() throws IOException {
        System.out.println("💾 Saving RSA keys to disk...");

        // Save private key
        byte[] privateKeyBytes = keyPair.getPrivate().getEncoded();
        String privateKeyBase64 = Base64.getEncoder().encodeToString(privateKeyBytes);
        Files.write(Paths.get(PRIVATE_KEY_FILE), privateKeyBase64.getBytes());
        System.out.println("   ✅ Private key saved: " + PRIVATE_KEY_FILE);

        // Save public key
        byte[] publicKeyBytes = keyPair.getPublic().getEncoded();
        String publicKeyBase64 = Base64.getEncoder().encodeToString(publicKeyBytes);
        Files.write(Paths.get(PUBLIC_KEY_FILE), publicKeyBase64.getBytes());
        System.out.println("   ✅ Public key saved: " + PUBLIC_KEY_FILE);
    }

    // ------ Load keys from file ------
    private void loadKeysFromFile() throws Exception {
        System.out.println("📂 Loading RSA keys from disk...");

        // Load private key
        String privateKeyBase64 = new String(Files.readAllBytes(Paths.get(PRIVATE_KEY_FILE)));
        byte[] decodedPrivateKey = Base64.getDecoder().decode(privateKeyBase64);
        KeyFactory keyFactory = KeyFactory.getInstance(ALGORITHM);
        PrivateKey privateKey = keyFactory.generatePrivate(new PKCS8EncodedKeySpec(decodedPrivateKey));
        System.out.println("   ✅ Private key loaded");

        // Load public key
        String publicKeyBase64 = new String(Files.readAllBytes(Paths.get(PUBLIC_KEY_FILE)));
        byte[] decodedPublicKey = Base64.getDecoder().decode(publicKeyBase64);
        PublicKey publicKey = keyFactory.generatePublic(new X509EncodedKeySpec(decodedPublicKey));
        System.out.println("   ✅ Public key loaded");

        // Create key pair
        this.keyPair = new KeyPair(publicKey, privateKey);
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

        System.out.println("Using RSA Algorithm: " + CIPHER_ALGORITHM);
        try {
            Cipher cipher = Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding");

            OAEPParameterSpec oaepParams = new OAEPParameterSpec(
                    "SHA-256",
                    "MGF1",
                    MGF1ParameterSpec.SHA256,
                    PSource.PSpecified.DEFAULT
            );


            // Initialize in DECRYPT mode with private key
            cipher.init(Cipher.DECRYPT_MODE, keyPair.getPrivate(), oaepParams);

            // Decode Base64 to bytes
            byte[] decodedBytes = Base64.getDecoder().decode(encryptedText.trim());

            // Decrypt the bytes
            byte[] decryptedBytes = cipher.doFinal(decodedBytes);

            // Convert bytes to string
            String aesKeyBase64 = Base64.getEncoder().encodeToString(decryptedBytes);

            System.out.println("   ✅ RSA Decryption successful");
            System.out.println("   📝 Decrypted length: " + decryptedBytes.length);

            return aesKeyBase64;
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
