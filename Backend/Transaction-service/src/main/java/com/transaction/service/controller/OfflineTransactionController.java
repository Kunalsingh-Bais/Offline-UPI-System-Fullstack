package com.transaction.service.controller;

import com.transaction.service.dto.WiFiSyncRequest;
import com.transaction.service.dto.WiFiSyncResponse;
import com.transaction.service.service.OfflineIdempotencyService;
import com.transaction.service.service.OfflineKeyExchangeService;
import com.transaction.service.service.OfflinePaymentReceiverService;
import com.transaction.service.service.OfflinePaymentSettlementService;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/payment")
public class OfflineTransactionController {

    private static final Logger logger = LoggerFactory.getLogger(OfflineTransactionController.class);

    @Autowired
    private OfflinePaymentReceiverService paymentReceiverService;

    @Autowired
    private OfflineKeyExchangeService offlineKeyExchangeService;

    @Autowired
    private OfflinePaymentSettlementService offlinePaymentSettlementService;

    @Autowired
    private OfflineIdempotencyService offlineIdempotencyService;

    // ------ Health Check (for discovery) ------
    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        logger.info("Health check requested");

        Map<String, String> response = new HashMap<>();
        response.put("status", "ok");
        response.put("timestamp", System.currentTimeMillis() + " ");

        return ResponseEntity.ok(response);
    }

    // ------ Key Exchange (Get Receiver's Public key)
    @PostMapping("/key-exchange")
    public ResponseEntity<?> getReceiverPublicKey(@RequestBody KeyExchangeRequest request) {

        logger.info("======= KEY EXCHANGE REQUEST =======");
        logger.info("Receiver UPI: {}", request.getReceiverUPI());

        try {
            // Validate request
            if (request.getReceiverUPI() == null || request.getReceiverUPI().isEmpty()) {
                logger.error("Receiver UPI is required");
                return ResponseEntity.badRequest().body(new ErrorResponse("BAD_REQUEST", "RECEIVER UPI is required"));
            }

            // Validate UPI format
            if (!isValidUPI(request.getReceiverUPI())) {
                logger.error("Invalid UPI format: {}", request.getReceiverUPI());
                return ResponseEntity.badRequest().body(new ErrorResponse("INVALID_UPI", "Invalid UPI format"));
            }

            // Getting receiver's public key
            String publicKeyBase84 = offlineKeyExchangeService.getUserPublicKeyBase64(request.getReceiverUPI());

            logger.info("Public key retrieved");
            logger.info("Size: {} bytes (base64)", publicKeyBase84.length());

            // Build response
            KeyExchangeResponse response = new KeyExchangeResponse();
            response.setReceiverUPI(request.getReceiverUPI());
            response.setPublicKey(publicKeyBase84);
            response.setAlgorithm("RSA-OAEP");
            response.setKeySize(4096);
            response.setStatus("success");
            response.setTimestamp(System.currentTimeMillis());

            logger.info("KEY EXCHANGE SUCCESSFUL");

            return ResponseEntity.ok(response);
        }
        catch (Exception e) {
            logger.error("Key exchange failed: {}", e.getMessage());
            e.printStackTrace();

            return ResponseEntity.status(500).body(new ErrorResponse("KEY_EXCHANGE_ERROR", "Failed to retrieve public key: " + e.getMessage()));
        }
    }

    // ------ Sync WiFi Payment (Settlement) ------
    @PostMapping("/sync-wifi")
    public ResponseEntity<WiFiSyncResponse> syncWiFiPayment(@RequestBody WiFiSyncRequest request) {

        try {
            // Validate request
            logger.info("Validating sync request");

            if (request.getTransactionId() == null || request.getTransactionId().isEmpty()) {
                logger.error("Transaction ID is required");

                return ResponseEntity.badRequest().body(new WiFiSyncResponse(
                        request.getTransactionId(),
                        "INVALID_REQUEST",
                        "Transaction ID is required",
                        false,
                        null,
                        null
                ));
            }

            if (request.getEncryptedData() == null || request.getEncryptedData().isEmpty()) {
                logger.error("Encrypted data is required");

                return ResponseEntity.badRequest().body(new WiFiSyncResponse(
                        request.getTransactionId(),
                        "INVALID_REQUEST",
                        "Encrypted data is required",
                        false,
                        null,
                        null
                ));
            }

            if (request.getNonce() == null || request.getNonce().isEmpty()) {
                logger.error("Nonce is required");

                return ResponseEntity.badRequest().body(new WiFiSyncResponse(
                        request.getTransactionId(),
                        "INVALID_REQUEST",
                        "Nonce is required for duplicate prevention",
                        false,
                        null,
                        null
                ));
            }

            logger.info("Request validation passed");

            // Call settlement service (this does actual work)
            logger.info("Calling PaymentSettlementService");
            WiFiSyncResponse settlementResponse = offlinePaymentSettlementService.settleWiFiPayment(request);

            logger.info("Sync response Ready");
            logger.info("Status: {}", settlementResponse.getStatus());
            logger.info("Success: {}", settlementResponse.isSuccess());

            return ResponseEntity.ok(settlementResponse);
        }
        catch (Exception e) {
            logger.error("Sync failed: {}", e.getMessage());
            e.printStackTrace();

            WiFiSyncResponse errorResponse = new WiFiSyncResponse(
                    request.getTransactionId(),
                    "Sync_ERROR",
                    "Sync failed: " + e.getMessage(),
                    false,
                    null,
                    null
            );

            return ResponseEntity.status(500).body(errorResponse);
        }
    }

    // ------ Get Idempotency Stats ------
    @GetMapping("/idempotency/stats")
    public ResponseEntity<?> getIdempotencyStats() {
        logger.info("Fetching idempotency stats...");

        try {
            OfflineIdempotencyService.IdempotencyStats stats = offlineIdempotencyService.getStats();

            Map<String, Object> response = new HashMap<>();
            response.put("activeNonces", stats.activeNonces);
            response.put("expiryTimeMs", stats.expiryTimeMs);
            response.put("exiryHours", stats.expiryTimeMs / (60 * 60 * 1000));
            response.put("currentTimeMs", stats.currentTimeMs);

            logger.info("Idempotency stats retrieved");
            logger.info("Active nonces: {}", stats.activeNonces);

            return ResponseEntity.ok(response);
        }
        catch (Exception e) {
            logger.error("Error getting stats: {}", e.getMessage());
            return ResponseEntity.status(500).body(new ErrorResponse("STATS_ERROR", "Fsailed to get stats: " + e.getMessage()));
        }
    }

    // ------ Get Key Cache Stats ------
    @GetMapping("/key-cache/stats")
    public ResponseEntity<?> getKeyCacheStats() {
        logger.info("Fetching key cache stats...");

        try {
            OfflineKeyExchangeService.KeyCacheStats stats = offlineKeyExchangeService.getCacheStats();

            Map<String, Object> response = new HashMap<>();
            response.put("totalKeys", stats.totalKeys);
            response.put("validKeys", stats.validKeys);
            response.put("expiredKeys", stats.expiredKeys);
            response.put("expiryTimeMs", stats.expiryTimeMs);
            response.put("expiryDays", stats.expiryTimeMs / (24 * 60 * 60 * 1000));

            logger.info("Key cache stats retrieved");
            logger.info("Total keys: {}", stats.totalKeys);
            logger.info("Valid keys: {}", stats.validKeys);
            logger.info("Expired Keys: {}", stats.expiredKeys);

            return ResponseEntity.ok(response);
        }
        catch (Exception e) {
            logger.error("Error getting stats: {}", e.getMessage());
            return ResponseEntity.status(500).body(new ErrorResponse("STATS_ERROR", "Failed to get stats: " + e.getMessage()));
        }
    }

    // ------ Get Server Public Key (future use)------
    @GetMapping("/server-public-key")
    public ResponseEntity<?> getServerPublicKey() {
        logger.info("Fetching server public key...");

        try {
            String publicKeyBase64 = offlineKeyExchangeService.getServerPublicKeyBase64();

            Map<String, Object> response = new HashMap<>();
            response.put("publicKey", publicKeyBase64);
            response.put("algorithm", "RSA-OAEP");
            response.put("keySize", 4096);
            response.put("type", "SERVER_PUBLIC_KEY");

            logger.info("Server public key retrieved");

            return ResponseEntity.ok(response);
        }
        catch (Exception e) {
            logger.error("Error getting server public key: {}", e.getMessage());
            return ResponseEntity.status(500).body(new ErrorResponse("KEY_ERROR", "Failed to get server public key: " + e.getMessage()));
        }
    }

    // ------ Receive payment form sender (Device A -> Device B) ------
    @PostMapping("/receive")
    public ResponseEntity<Map<String, Object>> receivePayment(@RequestBody WiFiSyncRequest request) {
        logger.info("Received payment form sender via WiFi relay");
        logger.info("Sender: {}, Receiver: {}",
                request.getSenderUPI(),
                request.getReceiverUPI());

        try {
            // Validate request
            if (request.getEncryptedData() == null || request.getEncryptedData().isEmpty()) {
                logger.error("Encrypted data missing");

                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("status", "FAILED");
                errorResponse.put("message", "Encrypted data encrypted");

                return ResponseEntity.badRequest().body(errorResponse);
            }

            // Process payment (just receive and validate)
            logger.info("Processing payment...");

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("status", "RECEIVED");
            response.put("transactionId", request.getTransactionId());
            response.put("message", "Payment received and stored locally");

            logger.info("Payment received successfully");

            return ResponseEntity.ok(response);
        }
        catch (Exception e) {
            logger.error("Error receiving payment: ", e);

            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("status", "ERROR");
            errorResponse.put("message", "Error: " + e.getMessage());

            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }

// ------ HELPER METHODS ------

    // --- Validate UPI Format ---
    private boolean isValidUPI(String upi) {
        if (upi == null || upi.isEmpty()) return false;

        return upi.matches("[a-zA-Z0-9._-]+@[a-zA-Z0-9]+") && upi.length() >= 5 && upi.length() <= 50;
    }

    // --- Key Exchange Request DTO ---
    public static class KeyExchangeRequest {
        private String receiverUPI;

        public KeyExchangeRequest() {}

        public KeyExchangeRequest(String receiverUPI) {
            this.receiverUPI = receiverUPI;
        }

        public String getReceiverUPI() {
            return receiverUPI;
        }

        public void setReceiverUPI(String receiverUPI) {
            this.receiverUPI = receiverUPI;
        }
    }

    // --- Key Exchange Response DTO ---
    @Getter
    @Setter
    public static class KeyExchangeResponse {
        private String receiverUPI;
        private String publicKey;
        private String algorithm;
        private int keySize;
        private String status;
        private long timestamp;

        public KeyExchangeResponse() {}
    }

    // --- Error Response DTO ---
    @NoArgsConstructor
    @AllArgsConstructor
    @Getter
    @Setter
    public static class ErrorResponse {
        private String errorCode;
        private String message;
    }
}

