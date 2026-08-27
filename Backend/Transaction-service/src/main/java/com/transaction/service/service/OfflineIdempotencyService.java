package com.transaction.service.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Service
public class OfflineIdempotencyService {
    private static final Logger logger = LoggerFactory.getLogger(OfflineIdempotencyService.class);

    // Nonce storage
    private final ConcurrentHashMap<String, Long> seenNonces = new ConcurrentHashMap<>();

    // Nonce expiry time (1 hour)
    private static final long NONCE_EXPIRY_MS = 60 * 60 * 1000;

    // Cleanup scheduler (runs every 30 minutes)
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1);

    public OfflineIdempotencyService() {
        logger.info("IdempotencyService initialized");

        startCleanupTask();   // remove expired nonce
    }

    // ------ Method 1: Check if Nonce is NEW (not seen before) ------
    public synchronized boolean isFirstTime(String nonce) {
        logger.info("Checking if nonce is first time: {}", nonce);

        if (nonce == null || nonce.isEmpty()) {
            logger.warn("Nonce is null or empty");
            return false;
        }

        // Check if we have seen this nonce before
        Long previousTimestamp = seenNonces.get(nonce);

        if (previousTimestamp != null) {
            // We have seen this before -> DUPLICATE
            long ageMs = System.currentTimeMillis() - previousTimestamp;
            logger.warn("DUPLICATE DETECTED: Nonce seen {} ms ago", ageMs);
            return false;
        }

        // First time seeing this nonce -> NEW PAYMENT
        long currentTime = System.currentTimeMillis();
        seenNonces.put(nonce, currentTime);

        logger.info("NEW NONCE: {} stored", nonce);
        logger.info("  Total unique nonces tracked: {}", seenNonces.size());

        return true;
    }

    // ------ Method 2: Get Nonce status ------
    public NonceStatus getNonceStatus(String nonce) {
        logger.info("Getting status for nonce: {}", nonce);

        Long timestamp = seenNonces.get(nonce);

        if (timestamp == null) {
            return new NonceStatus(nonce, false, 0, "FIRST_TIME");
        }

        long ageMs = System.currentTimeMillis() - timestamp;
        String status = ageMs > NONCE_EXPIRY_MS ? "EXPIRED" : "DUPLICATE";

        return new NonceStatus(nonce, true, ageMs, status);
    }

    // ------ Method 3: Register Nonce Manually ------
    public void registerNonce(String nonce) {
        logger.info("Manually registering nonce: {}", nonce);

        if (nonce == null || nonce.isEmpty()) {
            logger.error("Cannot register null/empty nonce");
            return;
        }

        seenNonces.put(nonce, System.currentTimeMillis());
        logger.info("Nonce registered");
    }

    // ------ Method 4: Force Remove Expired Nonces ------
    public synchronized void cleanupExpiredNonces() {
        logger.info("Cleaning up expired nonces...");

        int beforeCount = seenNonces.size();
        long currentTime = System.currentTimeMillis();

        // Find and remove expired nonces
        seenNonces.entrySet().removeIf(entry -> {
            long ageMs = currentTime - entry.getValue();
            return ageMs > NONCE_EXPIRY_MS;
        });

        int afterCount = seenNonces.size();
        int removed = beforeCount - afterCount;

        logger.info("Cleanup complete: {} nonces removed", removed);
        logger.info("  Active nonces: {}", afterCount);
    }

    // ------ Method 5: Get Statistics ------
    public IdempotencyStats getStats() {
        return new IdempotencyStats(
                seenNonces.size(),
                NONCE_EXPIRY_MS,
                System.currentTimeMillis()
        );
    }

    // ------ Method 6: Start Cleanup Task ------
    private void startCleanupTask() {
        logger.info("Starting nonce cleanup scheduler (every 30 minutes)");

        scheduler.scheduleAtFixedRate(
                this::cleanupExpiredNonces,
                30,         // Initial delay: 30 minutes
                30,                   // Repeat every: 30 minutes
                TimeUnit.MINUTES
        );
    }

// ====== Helper Methods ======

    // -- Status information for a nonce --
    private static class NonceStatus {
        public String nonce;
        public boolean exists;
        public long ageMs;
        public String status;   // FIRST_TIME, DUPLICATE, EXPIRED

        public NonceStatus(String nonce, boolean exists, long ageMs, String status) {
            this.nonce = nonce;
            this.exists = exists;
            this.ageMs = ageMs;
            this.status = status;
        }
    }

    // -- Statistical about current idempotency state --
    public static class IdempotencyStats {
        public int activeNonces;
        public long expiryTimeMs;
        public long currentTimeMs;

        public IdempotencyStats(int activeNonces, long expiryTimeMs, long currentTimeMs) {
            this.activeNonces = activeNonces;
            this.expiryTimeMs = expiryTimeMs;
            this.currentTimeMs = currentTimeMs;
        }
    }
}
