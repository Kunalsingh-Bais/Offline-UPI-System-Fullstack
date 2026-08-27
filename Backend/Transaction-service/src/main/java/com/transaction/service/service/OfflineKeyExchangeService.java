package com.transaction.service.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.security.*;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class OfflineKeyExchangeService {
    private static final Logger logger = LoggerFactory.getLogger(OfflineKeyExchangeService.class);

    // RSA Configuration
    private static final String RSA_ALGORITHM = "RSA";
    private static final int RSA_KEY_SIZE = 4096;
    private static final String ENCRYPTION_ALGORITHM = "RSA/ECB/OAEP";

    // Key storage
    // Server's own key pair (generated once on startup)
    private KeyPair serverKeyPair;

    // Cache of user public keys: UPI -> PublicKey
    private final ConcurrentHashMap<String, CachedPublicKey> publicKeyCache = new ConcurrentHashMap<>();

    // Key expiry
    private static final long KEY_CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days

    public OfflineKeyExchangeService() {
        logger.info("KeyExchangeService initialized");
        initializeServerKeyPair();
    }

// ------ Method 1: Initialize Server Key pair ------
    // Generate RSA-4096 key pair for the server
    private void initializeServerKeyPair() {
        logger.info("Initializing server RSA-4096 key pair...");

        try {
            KeyPairGenerator keyGen = KeyPairGenerator.getInstance(RSA_ALGORITHM);
            keyGen.initialize(RSA_KEY_SIZE);
            serverKeyPair = keyGen.generateKeyPair();

            logger.info("Server RSA key pair generated");
            logger.info("Algorithm: RSA");
            logger.info("Key size: {} bits", RSA_KEY_SIZE);
            logger.info("Status: Ready for key exchange");
        }
        catch (NoSuchAlgorithmException e) {
            logger.error("Failed to initialize RSA: {}", e.getMessage());
            throw new RuntimeException("RSA algorithm not available", e);
        }
    }

// ------ Method 2: Get Server Public Key (for sharing with clients) ------
    public String getServerPublicKeyBase64() {
        logger.info("Exporting server public key....");

        try {
            if (serverKeyPair == null) {
                throw new RuntimeException("Server key pair not initialized");
            }

            // Export public key
            PublicKey publicKey = serverKeyPair.getPublic();
            byte[] publicKeyBytes = publicKey.getEncoded();
            String publicKeyBase64 = Base64.getEncoder().encodeToString(publicKeyBytes);

            logger.info("Server public key exported");
            logger.info(" Size: {} bytes", publicKeyBase64.length());

            return publicKeyBase64;
        }
        catch (Exception e) {
            logger.error("Error exporting public key: {}", e.getMessage());
            throw new RuntimeException("Failed to export public key", e);
        }
    }

// ------ Method 3: Get User's Public Key (for encryption) ------
    public String getUserPublicKeyBase64(String upiId) {
        logger.info("Getting public key for user: {}", upiId);

        if (upiId == null || upiId.isEmpty()) {
            logger.error("Invalid UPI ID");
            throw new IllegalArgumentException("UPI ID cannot be null/empty");
        }

        // Check cache first
        CachedPublicKey cached = publicKeyCache.get(upiId);
        if (cached != null && !cached.isExpired()) {
            logger.info("Public key found in cache for: {}", upiId);
            return cached.publicKeyBase64;
        }

        // Not in cache -> Generate new key for this user
        logger.info("Cache miss, generating new public key for: {}", upiId);

        try {
            KeyPairGenerator keyGen = KeyPairGenerator.getInstance(RSA_ALGORITHM);
            keyGen.initialize(RSA_KEY_SIZE);
            KeyPair userKeyPair = keyGen.generateKeyPair();

            // Export public key
            byte[] publicKeyBytes = userKeyPair.getPublic().getEncoded();
            String publicKeyBase64 = Base64.getEncoder().encodeToString(publicKeyBytes);

            // Cache it
            CachedPublicKey cachedKey = new CachedPublicKey(
                    upiId,
                    publicKeyBase64,
                    userKeyPair.getPublic(),
                    System.currentTimeMillis()
            );

            publicKeyCache.put(upiId, cachedKey);

            logger.info("Public key generated and cached for: {}", upiId);

            return publicKeyBase64;
        }
        catch (NoSuchAlgorithmException e) {
            logger.error("RSA algorithm error: {}", e.getMessage());
            throw new RuntimeException("RSA algorithm not available", e);
        }
    }

// ------ Method 4: Verify Public key format ------
    public boolean isValidPublicKey(String publicKeyBase64) {
        logger.info("Validating public key format...");

        if (publicKeyBase64 == null || publicKeyBase64.isEmpty()) {
            logger.warn("Public Key is null/empty");
            return false;
        }

        try {
            // Try to decode base64
            byte[] decodedKey = Base64.getDecoder().decode(publicKeyBase64);

            // Check minimum size (RSA-4096 should be ~550 bytes)
            if (decodedKey.length < 200) {
                logger.warn("Public key too small: {} bytes", decodedKey.length);
                return false;
            }

            // Try to import as RSA public key
            KeyFactory keyFactory = KeyFactory.getInstance(RSA_ALGORITHM);
            X509EncodedKeySpec keySpec = new X509EncodedKeySpec(decodedKey);
            keyFactory.generatePublic(keySpec);

            logger.info("Public key is valid");
            logger.info("Size: {} bytes", decodedKey.length);

            return true;
        }
        catch (IllegalArgumentException e) {
            logger.error("Invalid Base64: {}", e.getMessage());
            return false;
        }
        catch (Exception e) {
            logger.error("Invalid key format: {}", e.getMessage());
            return false;
        }
    }

// ------ Method 5: Get Public key as CryptoKey object ------
    public PublicKey getPublicKeyFromBase64(String publicKeyBase64) throws Exception {
        logger.info("Converting Base64 public key to PublicKey object...");

        byte[] decodedKey = Base64.getDecoder().decode(publicKeyBase64);
        X509EncodedKeySpec keySpec = new X509EncodedKeySpec(decodedKey);
        KeyFactory keyFactory = KeyFactory.getInstance(RSA_ALGORITHM);
        PublicKey publicKey = keyFactory.generatePublic(keySpec);

        logger.info("Public key converted successfully");

        return publicKey;
    }

// ------ Method 6: Clear Public Key cache ------
    public void clearKeyCache() {
        logger.info("Clearing key cache...");

        int beforeCount = publicKeyCache.size();
        publicKeyCache.clear();

        logger.info("Cache cleared: {} keys removed", beforeCount);
    }

// ------ Method 7: Get Key Cache Statistics ------
    public KeyCacheStats getCacheStats() {
        logger.info("Getting key cache statistics...");

        int totalKeys = publicKeyCache.size();
        int validKeys = (int) publicKeyCache.values().stream()
                .filter(cached -> !cached.isExpired())
                .count();

        int expiredKeys = totalKeys - validKeys;

        return new KeyCacheStats(totalKeys, validKeys, expiredKeys, KEY_CACHE_EXPIRY_MS);
    }

// ------ HELPER Method ------

    // --- Represents a cached public key with expiry ---
    public static class CachedPublicKey {
        public String upiId;
        public String publicKeyBase64;
        public PublicKey publicKey;
        public long cachedAt;

        public CachedPublicKey(String upiId, String publicKeyBase64, PublicKey publicKey, long cachedAt) {
            this.upiId = upiId;
            this.publicKeyBase64 = publicKeyBase64;
            this.publicKey = publicKey;
            this.cachedAt = cachedAt;
        }

        // --- Check if this cached key has expired (7 days) ---
        public boolean isExpired() {
            long ageMs = System.currentTimeMillis() - cachedAt;
            long expiryMs = 7 * 24 * 60 * 60 * 1000;  // 7 days
            return ageMs > expiryMs;
        }
    }

    // --- Statistics about key cache ---
    public static class KeyCacheStats {
        public int totalKeys;
        public int validKeys;
        public int expiredKeys;
        public long expiryTimeMs;

        public KeyCacheStats(int totalKeys, int validKeys, int expiredKeys, long expiryTimeMs) {
            this.totalKeys = totalKeys;
            this.validKeys = validKeys;
            this.expiredKeys = expiredKeys;
            this.expiryTimeMs = expiryTimeMs;
        }
    }


}

