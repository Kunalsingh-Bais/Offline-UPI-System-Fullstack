package com.transaction.service.service;

import com.transaction.service.client.UserServiceClient;
import com.transaction.service.dto.*;
import com.transaction.service.encryption.EncryptionProcessor;
import com.transaction.service.encryption.HashingService;
import com.transaction.service.encryption.RSAKeyService;
import com.transaction.service.entity.Transaction;
import com.transaction.service.repository.TransactionRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;


@Service
public class TransactionService {

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

    // ------ Method 4: Sync BLE Transaction ------
    public BLESyncResponse syncBLETransaction(BLESyncRequest request) {
        try {
            System.out.println("[SERVICE] Processing BLE Sync Request: " + request.getTransactionId());

            // Step 1: Validate Request
            if(request.getTransactionId() == null || request.getTransactionId().isEmpty()) {
                System.out.println("Transaction ID missing");
                return new BLESyncResponse(null, "FAILED", "Transaction ID is required", false, LocalDateTime.now().toString(), null);
            }

            if (request.getEncryptedData() == null || request.getEncryptedData().isEmpty()) {
                System.out.println("Encrypted data missing");
                return new BLESyncResponse(null, "FAILED", "Encrypted data is required", false, LocalDateTime.now().toString(), null);
            }

            if (request.getNonce() == null || request.getNonce().isEmpty()) {
                System.out.println("Nonce missing");
                return new BLESyncResponse(request.getTransactionId(), "Failed", "Nonce is required", false, LocalDateTime.now().toString(), null);
            }

            System.out.println("[SERVICE] BLE Sync Request validated");

            // Step 2: Check for replay attack (nonce already seen)
            Optional<Transaction> nonceDuplicate = transactionRepository.findByNonce(request.getNonce());

            if (nonceDuplicate.isPresent()) {
                System.out.println("REPLAY ATTACK DETECTED: Nonce already used: " +request.getNonce());

                Transaction txn = nonceDuplicate.get();
                return new BLESyncResponse(txn.getTransactionId(), txn.getStatus(), "Replay attack detected: Nonce already used", false,
                        txn.getUpdatedAt().toString(), txn.getTransactionId());
            }

            // Step 3: Check for duplicate transactionId (idompotency)
            Optional<Transaction> existingTransaction = transactionRepository.findByTransactionId(request.getTransactionId());

            if (existingTransaction.isPresent()) {
                System.out.println("Transaction already synced: " + request.getTransactionId());

                Transaction txn = existingTransaction.get();
                return new BLESyncResponse(txn.getTransactionId(), txn.getStatus(), "Transaction already synced", true,
                        txn.getUpdatedAt().toString(), txn.getTransactionId());
            }

            // Step 4: Validate signature format
            if (request.getSignature() == null || request.getSignature().isEmpty()) {
                System.out.println("Signature missing");
                return new BLESyncResponse(request.getTransactionId(), "FAILED",
                        "Signature is required", false, LocalDateTime.now().toString(), null);
            }

            if (!isValidHexString(request.getSignature())) {
                System.out.println("Invalid signature format (must be hex)");
                return new BLESyncResponse(request.getTransactionId(), "FAILED",
                        "Invalid signature format", false, LocalDateTime.now().toString(), null);
            }

            // Step 5: Validate timestamp (payment not too old)
            if (request.getTimestamp() == null) {
                System.out.println("Timestamp missing");
                return new BLESyncResponse(request.getTransactionId(), "FAILED",
                        "Timestamp is required", false, LocalDateTime.now().toString(), null);
            }

            long ageMs = System.currentTimeMillis() - request.getTimestamp();
            long MAX_AGE_MS = 5 * 60 * 1000;  // 5 minutes

            if (ageMs > MAX_AGE_MS) {
                System.out.println("Payment is too old: " + ageMs + "ms");
                return new BLESyncResponse(request.getTransactionId(), "FAILED",
                        "Payment is too old (max 5 minutes)", false, LocalDateTime.now().toString(), null);
            }

            System.out.println("Payment is fresh: " + ageMs + "ms old");

            // STEP 6: Decrypt and Verify payment
            System.out.println("[SERVICE] Decrypting BLE transaction data...");

            Map<String, Object> decryptedData = encryptionProcessor.decryptAndVerifyPayment(request.getEncryptedData());

            if (decryptedData == null || !(boolean) decryptedData.getOrDefault("hashVerified", false)) {
                System.out.println("BLE payment decryption failed");

                return new BLESyncResponse(request.getTransactionId(), "FAILED", "Decryption or verification failed",
                        false, LocalDateTime.now().toString(), null);
            }

            // Step 7: Extract decrypted data
            String senderUPI = (String) decryptedData.get("senderUpiId");
            String receiverUPI = (String) decryptedData.get("receiverUpiId");
            String amountStr = (String) decryptedData.get("amount");
            BigDecimal amount = new BigDecimal(amountStr);

            // validate UPI format
            if (!isValidUPI(senderUPI) || !isValidUPI(receiverUPI)) {
                System.out.println("Invalid UPI format");
                return new BLESyncResponse(request.getTransactionId(), "FAILED",
                        "Invalid UPI format", false, LocalDateTime.now().toString(), null);
            }

            if (amount.compareTo(BigDecimal.ZERO) <= 0) {
                System.out.println("Invalid amount");
                return new BLESyncResponse(request.getTransactionId(), "FAILED",
                        "Amount must be positive", false, LocalDateTime.now().toString(), null);
            }

            System.out.println("[SERVICE] Decryption successful");
            System.out.println("  Sender: " + senderUPI);
            System.out.println("  Receiver: " + receiverUPI);
            System.out.println("  Amount: " + amount);

            // Step 8: Create and save BLE transaction
            Transaction bletransaction = new Transaction();
            bletransaction.setTransactionId(request.getTransactionId());
            bletransaction.setSenderUpiId(senderUPI);
            bletransaction.setReceiverUpiId(receiverUPI);
            bletransaction.setAmount(amount);
            bletransaction.setStatus("SUCCESS");
            bletransaction.setPaymentMethod("Bluetooth");
            bletransaction.setSource("BLE_SYNC");
            bletransaction.setDescription("BLE Bluetooth Payment");
            bletransaction.setStatus("PENDING");

            // Generate hash for BLE transaction
            String txnHash = generateTransactionHash(senderUPI, receiverUPI, amount.toString());
            bletransaction.setTxnHash(txnHash);

            bletransaction.setExpireAt(LocalDateTime.now().plusDays(30));

            // Set BLE-specific fields
            bletransaction.setEncryptedPayload(request.getEncryptedData());
            bletransaction.setSignature(request.getSignature());
            bletransaction.setNonce(request.getNonce());
            bletransaction.setIsOffline(true);
            bletransaction.setSyncedAt(LocalDateTime.now());
            bletransaction.setBackendTransactionId(UUID.randomUUID().toString());
            bletransaction.setSyncAttempts(1);
            bletransaction.setPayloadVersion(request.getPayloadVersion() != null ? request.getPayloadVersion() : 1);

            Transaction savedTransaction = transactionRepository.save(bletransaction);

            System.out.println("BLE transaction saved successfully");
            System.out.println("  Transaction ID: " + savedTransaction.getTransactionId());
            System.out.println("  Backend ID: " + savedTransaction.getBackendTransactionId());

            // Step 9: Return success response
            return new BLESyncResponse(savedTransaction.getTransactionId(), savedTransaction.getStatus(), "BLE transaction synced successfully", true,
                    savedTransaction.getCreatedAt().toString(), savedTransaction.getBackendTransactionId());
        }
        catch (Exception e) {
            System.err.println("[SERVICE] Unexpected error: " + e.getMessage());
            e.printStackTrace();
            return new BLESyncResponse(request.getTransactionId(), "FAILED", "Error: " + e.getMessage(), false, new Date().toString(), null);
        }
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

