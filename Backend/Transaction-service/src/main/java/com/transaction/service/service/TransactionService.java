package com.transaction.service.service;

import com.transaction.service.client.UserServiceClient;
import com.transaction.service.dto.*;
import com.transaction.service.encryption.EncryptionProcessor;
import com.transaction.service.encryption.HashingService;
import com.transaction.service.encryption.RSAKeyService;
import com.transaction.service.entity.Transaction;
import com.transaction.service.repository.TransactionRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class TransactionService {

    private final static Logger logger = LoggerFactory.getLogger(TransactionService.class);

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private RSAKeyService rsaKeyService;

    @Autowired
    private EncryptionProcessor encryptionProcessor;

    @Autowired
    private HashingService hashingService;

    @Autowired
    private UserServiceClient userServiceClient;

    @Autowired
    private OfflineIdempotencyService offlineIdempotencyService;

    @Autowired
    private OfflineKeyExchangeService offlineKeyExchangeService;

    @Autowired
    private OfflinePaymentSettlementService offlinePaymentSettlementService;

    // simple idempotency
    private static ConcurrentHashMap<String, Long> seenNonces = new ConcurrentHashMap<>();

    // ------ METHOD 1: INITIATE TRANSACTION ------
    public InitiateTransactionResponse initiateTransaction(InitiateTransactionRequest request) {
        try{
            // Generate unique transaction ID
            String transactionId = generateTransactionId();

            // Create new Transaction entity
            Transaction transaction = new Transaction();
            transaction.setSenderUpiId(request.getSenderUpiId());
            transaction.setReceiverUpiId(request.getReceiverUpiId());
            transaction.setAmount(request.getAmount());
            transaction.setStatus("PENDING");
            transaction.setDescription(request.getDescription());
            transaction.setSenderProfileId(request.getSenderProfileId());
            transaction.setReceiverProfileId(request.getReceiverProfileId());
            transaction.setTransactionId(transactionId);

            // Calculate expiry time
            LocalDateTime expiresAt = LocalDateTime.now().plusMinutes(5);
            transaction.setExpireAt(expiresAt);

            // Generate transaction hash , Hash = SHA256(sender + receiver + amount)
            String txnHash = generateTransactionHash(
                    request.getSenderUpiId(),
                    request.getReceiverUpiId(),
                    request.getAmount().toString()
            );

            // Used to detect tampering
            transaction.setTxnHash(txnHash);

            Transaction savedTxn = transactionRepository.save(transaction);

            String publicKey = rsaKeyService.getPublicKeyString();

            return new InitiateTransactionResponse(
                    savedTxn.getTransactionId(),
                    savedTxn.getSenderUpiId(),
                    savedTxn.getReceiverUpiId(),
                    savedTxn.getAmount(),
                    "PENDING",
                    expiresAt,
                    publicKey,
                    true,
                    "Transaction initiated successfully"
            );
        }
        catch (Exception e) {
            return new InitiateTransactionResponse(null, request.getSenderUpiId(), request.getReceiverUpiId(), request.getAmount(),
                    null, null,null,false,"Error: "+e.getMessage());
        }
    }

    // ------ METHOD 2: COMPLETE TRANSACTION (with Decryption) ------
    public CompleteTransactionResponse completeTransaction(CompleteTransactionRequest request) {
        try {
            // Find transaction
            Optional<Transaction> txnOpt = transactionRepository.findByTransactionId(request.getTransactionId());

            // Check if found
            if(txnOpt.isEmpty()) {
                return new CompleteTransactionResponse(request.getTransactionId(), "FAILED",null,null,
                        "Transaction not found",false, new java.util.Date().toString());
            }

            Transaction txn = txnOpt.get();

            // Check idempotency (already processed?)
            if("SUCCESS".equals(txn.getStatus())) {
                return new CompleteTransactionResponse(txn.getTransactionId(), "SUCCESS", null, null,
                        "Transaction already completed", true, new java.util.Date().toString());
            }

            // Check if expired
            if(LocalDateTime.now().isAfter(txn.getExpireAt())) {
                txn.setStatus("FAILED");
                transactionRepository.save(txn);

                return new CompleteTransactionResponse(txn.getTransactionId(), "FAILED", null,null,
                        "Transaction expired",false, new java.util.Date().toString());
            }

            // Validate encrypted data exists
            if(request.getEncryptedData() == null || request.getEncryptedData().isEmpty()) {
                return new CompleteTransactionResponse(txn.getTransactionId(), "FAILED", null, null,
                        "Encrypted data is required", false, new java.util.Date().toString());
            }

            // Parse Encrypted Data
            String[] parts = request.getEncryptedData().split(",");
            if (parts.length != 3) {
                return new CompleteTransactionResponse(txn.getTransactionId(), "FAILED", null, null,
                        "Invalid encrypted data format", false, new java.util.Date().toString());
            }

            String encryptedAESKey = parts[0].trim();
            String encryptedPaymentData = parts[1].trim();
            String dataHash = parts[2].trim();

            // DECRYPT and VERIFY
            Map<String,Object> decryptionResult = encryptionProcessor.decryptAndVerifyTransaction(encryptedAESKey, encryptedPaymentData, dataHash);

            // Check if decryption successful
            Boolean hashVerified = (Boolean) decryptionResult.get("hashVerified");
            if (!hashVerified) {
                txn.setStatus("FAILED");
                transactionRepository.save(txn);

                return new CompleteTransactionResponse(txn.getTransactionId(), "FAILED", null, null,
                        "Data verification failed: " + decryptionResult.get("error"), false, new java.util.Date().toString());
            }

            // Extract sender, receiver, amount from decrypted data
            String senderUpiId = (String) decryptionResult.get("senderUpiId");
            String receiverUpiId = (String) decryptionResult.get("receiverUpiId");
            String amountStr = (String) decryptionResult.get("amount");

            // Validate extracted data matches transaction
            if (!txn.getSenderUpiId().equals(senderUpiId) || !txn.getReceiverUpiId().equals(receiverUpiId)) {
                txn.setStatus("FAILED");
                transactionRepository.save(txn);

                return new CompleteTransactionResponse(txn.getTransactionId(), "FAILED", null, null,
                        "Sender/Receiver mismatch", false, new java.util.Date().toString());
            }

            // Debit Sender Wallet (Call User Service)
            try {
                Map<String, Object> debitRequest = new HashMap<>();
                debitRequest.put("profileId", txn.getSenderProfileId());
                debitRequest.put("amount", txn.getAmount());
                debitRequest.put("operation", "DEBIT");
                debitRequest.put("transactionId", request.getTransactionId());
                debitRequest.put("description", "Sent to " + receiverUpiId);

                System.out.println("Calling User-service for DEBIT...");
                System.out.println("Debit Request = " + debitRequest);

                Map<String,Object> debitResponse = userServiceClient.updateBalance(debitRequest);

                System.out.println("Debit Response = " + debitResponse);

                // Check if debit successful
                Boolean debitSuccess = (Boolean) debitResponse.get("success");
                if (!debitSuccess) {
                    txn.setStatus("FAILED");
                    transactionRepository.save(txn);

                    String message = debitResponse.get("message") != null ? debitResponse.get("message").toString() : "Failed to debit sender's wallet";

                    return new CompleteTransactionResponse(txn.getTransactionId(),"FAILED", null, null,
                            message, false, new java.util.Date().toString());
                }
            }
            catch (Exception e) {
                txn.setStatus("FAILED");
                transactionRepository.save(txn);

                return new CompleteTransactionResponse(txn.getTransactionId(), "FAILED", null, null,
                        "Error debiting wallet: " + e.getMessage(), false, new java.util.Date().toString());
            }

            // CREDIT receiver's wallet (Call User Service)
            try {
                Map<String,Object> creditRequest = new HashMap<>();
                creditRequest.put("profileId", txn.getReceiverProfileId());
                creditRequest.put("amount",txn.getAmount());
                creditRequest.put("operation", "CREDIT");
                creditRequest.put("transactionId", request.getTransactionId());
                creditRequest.put("description", "Received from " + senderUpiId);

                System.out.println("Calling User-service for CREDIT...");
                System.out.println("Credit Request = " + creditRequest);

                Map<String, Object> creditResponse = userServiceClient.updateBalance(creditRequest);

                System.out.println("Credit Response = " + creditResponse);

                // Check if credit successful
                Boolean creditSuccess = (Boolean) creditResponse.get("success");
                if(!creditSuccess) {
                    // ROLLBACK: Reverse the debit
                    try {
                        Map<String, Object> rollbackRequest = new HashMap<>();
                        rollbackRequest.put("profileId", txn.getSenderProfileId());
                        rollbackRequest.put("amount", txn.getAmount());
                        rollbackRequest.put("operation", "CREDIT");
                        rollbackRequest.put("transactionId", request.getTransactionId() + "_ROLLBACK");
                        rollbackRequest.put("description", "Rollback from failed transaction");

                        userServiceClient.updateBalance(rollbackRequest);
                    } catch (Exception rollbackError) {
                        System.err.println("CRITICAL: Rollback failed! " + rollbackError.getMessage());
                    }

                    txn.setStatus("FAILED");
                    transactionRepository.save(txn);

                    return new CompleteTransactionResponse(txn.getTransactionId(), "FAILED", null, null,
                            "Failed to credit receiver's wallet", false, new java.util.Date().toString());
                }
            } catch (Exception e) {
                // ROLLBACK: Reverse the debit
                try {
                    Map<String, Object> rollbackRequest = new HashMap<>();
                    rollbackRequest.put("profileId", txn.getSenderProfileId());
                    rollbackRequest.put("amount", txn.getAmount());
                    rollbackRequest.put("operation", "CREDIT");
                    rollbackRequest.put("transactionId", request.getTransactionId() + "_ROLLBACK");
                    rollbackRequest.put("description", "Rollback from failed transaction");

                    userServiceClient.updateBalance(rollbackRequest);
                } catch (Exception rollbackError) {
                    System.err.println("CRITICAL: Rollback failed! " + rollbackError.getMessage());
                }

                txn.setStatus("FAILED");
                transactionRepository.save(txn);

                return new CompleteTransactionResponse(txn.getTransactionId(), "FAILED", null, null,
                        "Error crediting wallet: " + e.getMessage(), false, new java.util.Date().toString());
            }

            // Update status to SUCCESS
            txn.setStatus("SUCCESS");
            transactionRepository.save(txn);

            // Return success response
            return new CompleteTransactionResponse(txn.getTransactionId(), "SUCCESS", null, null,
                    "Transaction completed successfully", true, new java.util.Date().toString());
        }
        catch (Exception e) {
            return new CompleteTransactionResponse(request.getTransactionId(), "FAILED", null, null,
                    "Error: "+e.getMessage(), false, new java.util.Date().toString());
        }
    }

    // ------ Method 3: Transaction history ------
    public List<Transaction> getTransactionHistory(Integer profileId) {
        return transactionRepository.findBySenderProfileIdOrReceiverProfileIdOrderByCreatedAtDesc(profileId, profileId);
    }

    // ------ Method 4: Process WiFi Transaction ------
    public WiFiSyncResponse processWifiTransaction(WiFiSyncRequest request) {

        logger.info("\n========== PROCESSING WiFi TRANSACTION ==========");
        logger.info("Method: processWiFiTransaction");
        logger.info("Transaction ID: {}", request.getTransactionId());
        logger.info("Sender: {}", request.getSenderUPI());
        logger.info("Receiver: {}", request.getReceiverUPI());

        try {
            // Step 1: Validate basic request
            validateWiFiRequest(request);
            logger.info("✅ Request is valid");

            // Step 2: Use IdempotencyService for duplicate check
            if (!offlineIdempotencyService.isFirstTime(request.getNonce())) {
                logger.warn("⚠️ DUPLICATE: Nonce already processed");

                // Return existing transaction if found
                Optional <Transaction> existing = transactionRepository.findByNonce(request.getNonce());
                if (existing.isPresent()) {
                    logger.info("✅ Returning existing transaction result");
                    return buildResponseFromTransaction(existing.get());
                }
            }
            logger.info("✅ Nonce is unique - first time processing");

            // Step 3: Delegate to PaymentSettlementService for actual settlement
            WiFiSyncResponse settlementResponse = offlinePaymentSettlementService.settleWiFiPayment(request);

            logger.info("✅ Settlement complete");
            logger.info("   Status: {}", settlementResponse.getStatus());
            logger.info("   Success: {}", settlementResponse.isSuccess());

            return settlementResponse;

        } catch (Exception e) {
            logger.error("❌ Error processing WiFi transaction: {}", e.getMessage());
            e.printStackTrace();

            return new WiFiSyncResponse(
                    request.getTransactionId(),
                    "PROCESSING_ERROR",
                    "Failed to process transaction: " + e.getMessage(),
                    false,
                    null,
                    null
            );
        }
    }

    // ------ Method 5: Get Transaction by Nonce ------
    public Transaction getTransactionByNonce(String nonce) {

        logger.info("Fetching transaction by nonce: {}", nonce);

        try {
            Optional<Transaction> transaction = transactionRepository.findByNonce(nonce);

            if (transaction.isPresent()) {
                logger.info("✅ Transaction found with nonce: {}", nonce);
                return transaction.get();
            } else {
                logger.warn("⚠️ No transaction with nonce: {}", nonce);
                return null;
            }

        } catch (Exception e) {
            logger.error("❌ Error fetching by nonce: {}", e.getMessage());
            throw new RuntimeException("Failed to fetch transaction", e);
        }
    }

    // ------ Method 6: Get Wifi transaction ------
    public List<Transaction> getWifiTransactionHistory() {

        logger.info("Fetching all WiFi transactions");

        try {
            List<Transaction> transactions = transactionRepository.findByIsOfflineTrue();

            logger.info("✅ Found {} WiFi transactions", transactions.size());

            return transactions;

        } catch (Exception e) {
            logger.error("❌ Error fetching WiFi transactions: {}", e.getMessage());
            throw new RuntimeException("Failed to fetch WiFi transactions", e);
        }
    }

    // ------ Method 7: Get Unsettled Transaction ------
    public List<Transaction> getUnsettledTransactions() {

        logger.info("Fetching unsettled WiFi transactions");

        try {
            // Find Wi-Fi transactions with status not SUCCESS
            List<Transaction> transactions = transactionRepository.findByIsOfflineTrueAndStatusNot("SUCCESS");

            logger.info("✅ Found {} unsettled transactions", transactions.size());

            return transactions;

        } catch (Exception e) {
            logger.error("❌ Error fetching unsettled transactions: {}", e.getMessage());
            throw new RuntimeException("Failed to fetch unsettled transactions", e);
        }
    }

    // ------ Method 8: Retry Failed Wifi Payment ------
    public WiFiSyncResponse retryFailedPayment(String transactionId) {

        logger.info("========== RETRYING FAILED PAYMENT ==========");
        logger.info("Transaction ID: {}", transactionId);

        try {
            // Get original transaction
            Transaction original = transactionRepository.findByTransactionId(transactionId).orElse(null);

            if (original == null) {
                logger.error("❌ Transaction not found: {}", transactionId);
                return new WiFiSyncResponse(
                        transactionId,
                        "NOT_FOUND",
                        "Transaction not found",
                        false,
                        null,
                        null
                );
            }

            logger.info("✅ Original transaction found");

            // Rebuild request from original transaction

            WiFiSyncRequest retryRequest = new WiFiSyncRequest();
            retryRequest.setTransactionId(original.getTransactionId());
            retryRequest.setEncryptedData(original.getEncryptedPayload());
            retryRequest.setSignature(original.getSignature());
            retryRequest.setNonce(original.getNonce());
            retryRequest.setTimestamp(System.currentTimeMillis());
            retryRequest.setSenderUPI(original.getSenderUpiId());
            retryRequest.setReceiverUPI(original.getReceiverUpiId());

            logger.info("✅ Retry request built");

            // Process with settlement service

            WiFiSyncResponse retryResponse = offlinePaymentSettlementService.settleWiFiPayment(retryRequest);

            logger.info("✅ Retry processed");
            logger.info("   Status: {}", retryResponse.getStatus());

            return retryResponse;

        } catch (Exception e) {
            logger.error("❌ Error retrying payment: {}", e.getMessage());
            e.printStackTrace();

            return new WiFiSyncResponse(
                    transactionId,
                    "RETRY_ERROR",
                    "Failed to retry payment: " + e.getMessage(),
                    false,
                    null,
                    null
            );
        }
    }

    // ------ Method 9: Validate WiFi Request ------
    private void validateWiFiRequest(WiFiSyncRequest request) throws Exception {

        logger.info("Validating WiFi request...");

        if (request.getTransactionId() == null || request.getTransactionId().isEmpty()) {
            throw new IllegalArgumentException("Transaction ID is required");
        }

        if (request.getEncryptedData() == null || request.getEncryptedData().isEmpty()) {
            throw new IllegalArgumentException("Encrypted data is required");
        }

        if (request.getSignature() == null || request.getSignature().isEmpty()) {
            throw new IllegalArgumentException("Signature is required");
        }

        if (request.getNonce() == null || request.getNonce().isEmpty()) {
            throw new IllegalArgumentException("Nonce is required");
        }

        if (request.getSenderUPI() == null || request.getReceiverUPI() == null) {
            throw new IllegalArgumentException("Sender and receiver UPI required");
        }

        logger.info("✅ WiFi request is valid");
    }

    // ------ Method 10: Build Response from Transaction ------
    private WiFiSyncResponse buildResponseFromTransaction(Transaction transaction) {

        WiFiSyncResponse response = new WiFiSyncResponse();
        response.setTransactionId(transaction.getTransactionId());
        response.setStatus(transaction.getStatus());
        response.setSuccess("SUCCESS".equals(transaction.getStatus()));
        response.setMessage("Transaction already processed");
        response.setBackendTransactionId(transaction.getBackendTransactionId());
        response.setTimestamp(transaction.getSyncedAt().toString());

        return response;
    }

// ------- Helper Methods -------

    private String generateTransactionId() {
        return "TXN_" + System.currentTimeMillis() + "_" + UUID.randomUUID().toString().substring(0,8);
    }

     /**
     * Generate SHA-256 hash of transaction data
     * Used to detect tampering */
    private String generateTransactionHash(String sender, String receiver, String amount) {
        try{
            String data = sender + "|" + receiver + "|" + amount;
            // Combine all data
            return hashingService.generateSHA256Hash(data);
        }
        catch (Exception e) {
            return "hash_error";
        }
    }

    // Validate Hex String
    private boolean isValidHexString(String str) {
        if (str == null || str.isEmpty()) {
            return false;
        }
        return str.matches("^[a-f0-9A-F0-9]+$") && str.length() >= 32;
    }

    // Validate UPI format
    private boolean isValidUPI(String upi) {
        if (upi == null || upi.isEmpty()) {
            return false;
        }
        return upi.matches("^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$") && upi.length() >= 5 && upi.length() <= 50;
    }
}



