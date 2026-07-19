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
                return new BLESyncResponse(null, "FAILED", "Transaction ID is required", false, new Date().toString());
            }

            if (request.getEncryptedData() == null || request.getEncryptedData().isEmpty()) {
                return new BLESyncResponse(null, "FAILED", "Encrypted data is required", false, new Date().toString());
            }

            System.out.println("[SERVICE] BLE Sync Request validated");

            // Step 2: Check if already synced
            Optional<Transaction> existingTxn = transactionRepository.findByTransactionId((request.getTransactionId()));
            if (existingTxn.isPresent()) {
                System.out.println("[SERVICE] Transaction already synced: " + request.getTransactionId());
                return new BLESyncResponse(request.getTransactionId(), "SUCCESS", "Transaction already synced", true, new Date().toString());
            }

            // Step 3: Parse encrypted data
            String[] parts = request.getEncryptedData().split(",");
            if (parts.length != 3) {
                System.out.println("[SERVICE] Invalid encrypted data format");
                return new BLESyncResponse(request.getTransactionId(), "FAILED", "Invalid encrypted data format", false, new Date().toString());
            }

            String encryptedAESKey = parts[0].trim();
            String encryptedPaymentData = parts[1].trim();
            String dataHash = parts[2].trim();

            // STEP 4: Decrypt and Verify
            System.out.println("[SERVICE] Decrypting BLE transaction data...");

            Map<String, Object> decryptionResult = encryptionProcessor.decryptAndVerifyTransaction(
                    encryptedAESKey,
                    encryptedPaymentData,
                    dataHash
            );

            Boolean hashVerified = (Boolean) decryptionResult.get("hashVerified");
            if(!hashVerified) {
                System.err.println("[SERVICE] Data verification failed");
                return new BLESyncResponse(request.getTransactionId(), "FAILED", "Data verification failed: " + decryptionResult.get("error"),
                        false, new Date().toString());
            }

            System.out.println("[SERVICE] Decryption successful");

            // Step 5: Extract Transaction Data
            String senderUpiId = (String) decryptionResult.get("senderUpiId");
            String receiverUpiId = (String) decryptionResult.get("receiverUpiId");
            String amountStr = (String) decryptionResult.get("amount");
            BigDecimal amount = new BigDecimal(amountStr);

            // Validate extracted data
            if(senderUpiId == null || receiverUpiId == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
                System.out.println("[SERVICE] Invalid transaction data extracted");
                return new BLESyncResponse(request.getTransactionId(), "FAILED", "Invalid transaction data", false, new Date().toString());
            }

            System.out.println("[SERVICE] Transaction data extracted: " + senderUpiId + " -> " + receiverUpiId + " : " + amount);

            // Step 6: Get profile ID from user service
            Integer senderProfileId = null;
            Integer receiverProfileID = null;

            try {
                // Get sender profile ID
                Map<String, Object> senderProfileRequest = new HashMap<>();
                senderProfileRequest.put("upiId", senderUpiId);

                Map<String, Object> senderProfileResponse = userServiceClient.getProfileByUpiId(senderProfileRequest);

                if ((Boolean) senderProfileResponse.get("success")) {
                    senderProfileId = ((Number) senderProfileResponse.get("profileId")).intValue();
                }
                else {
                    return new BLESyncResponse(request.getTransactionId(), "FAILED", "Sender profile not found", false, new Date().toString());
                }

                // Get receiver profile ID
                Map<String, Object> receiverProfileRequest = new HashMap<>();
                receiverProfileRequest.put("upiId", receiverUpiId);

                Map<String, Object> receiverProfileResponse = userServiceClient.getProfileByUpiId(receiverProfileRequest);
                if ((Boolean) receiverProfileResponse.get("success")) {
                    receiverProfileID = ((Number) receiverProfileResponse.get("profileId")).intValue();
                }
                else {
                    return new BLESyncResponse(request.getTransactionId(), "FAILED", "Receiver profile not found", false, new Date().toString());
                }
            }
            catch (Exception e) {
                System.err.println("[SERVICE] Error getting profile IDs: " + e.getMessage());
                return new BLESyncResponse(request.getTransactionId(), "FAILED", "Error getting profile information", false, new Date().toString());
            }

            // Step 7: Create Transaction entity
            Transaction transaction = new Transaction();
            transaction.setTransactionId(request.getTransactionId());
            transaction.setSenderUpiId(senderUpiId);
            transaction.setReceiverUpiId(receiverUpiId);
            transaction.setAmount(amount);
            transaction.setSenderProfileId(senderProfileId);
            transaction.setReceiverProfileId(receiverProfileID);
            transaction.setDescription("BLE Bluetooth Payment");
            transaction.setStatus("PENDING");

            // Generate hash for BLE transaction
            String txnHash = generateTransactionHash(senderUpiId, receiverUpiId, amount.toString());
            transaction.setTxnHash(txnHash);

            transaction.setExpireAt(LocalDateTime.now().plusMinutes(5));

            // Step 8: Debit sender wallet
            try {
                Map<String, Object> debitRequest = new HashMap<>();
                debitRequest.put("profileId", senderProfileId);
                debitRequest.put("amount", amount);
                debitRequest.put("operation", "DEBIT");
                debitRequest.put("transactionId", request.getTransactionId());
                debitRequest.put("description", "BLE Sent to " + receiverUpiId);

                System.out.println("[SERVICE] Debiting sender wallet...");
                Map<String, Object> debitResponse = userServiceClient.updateBalance(debitRequest);

                Boolean debitSuccess = (Boolean) debitResponse.get("success");
                if (!debitSuccess) {
                    System.err.println("[SERVICE] Debit failed");
                    transaction.setStatus("FAILED");
                    transactionRepository.save(transaction);

                    String message = debitResponse.get("message") != null ? debitResponse.get("message").toString() : "Failed to debit sender's wallet";

                    return new BLESyncResponse(request.getTransactionId(), "FAILED", message, false, new Date().toString());
                }
                System.out.println("[SERVICE] Sender debited successfully");
            }
            catch (Exception e) {
                System.out.println("[SERVICE] Error debiting wallet: " + e.getMessage());
                transaction.setStatus("FAILED");
                transactionRepository.save(transaction);

                return new BLESyncResponse(request.getTransactionId(), "FAILED", "Error debiting wallet: " + e.getMessage(), false, new Date().toString());
            }

            // Step 9: Credit receiver wallet
            try {
                Map<String, Object> creditRequest = new HashMap<>();
                creditRequest.put("profileId", receiverProfileID);
                creditRequest.put("amount", amount);
                creditRequest.put("operation", "CREDIT");
                creditRequest.put("transactionId", request.getTransactionId());
                creditRequest.put("description", "BLE Received from "+senderUpiId);

                System.out.println("[SERVICE] Crediting receiver wallet...");
                Map<String, Object> creditResponse = userServiceClient.updateBalance(creditRequest);

                Boolean creditSuccess = (Boolean) creditResponse.get("success");
                if (!creditSuccess) {
                    System.out.println("[SERVICE] Credit failed - Rolling back...");

                    // ROLLBACK: Reverse the debit
                    try {
                        Map<String, Object> rollbackRequest = new HashMap<>();
                        rollbackRequest.put("profileId", senderProfileId);
                        rollbackRequest.put("amount", amount);
                        rollbackRequest.put("operation", "CREDIT");
                        rollbackRequest.put("transactionId", request.getTransactionId() + "_ROLLBACK");
                        rollbackRequest.put("description", "BLE Rollback from failed transaction");

                        userServiceClient.updateBalance(rollbackRequest);
                        System.out.println("[SERVICE] Rollback successful");
                    }
                    catch (Exception rollbackError) {
                        System.err.println("CRITICAL: Rollback failed! " + rollbackError.getMessage());
                    }

                    transaction.setStatus("FAILED");
                    transactionRepository.save(transaction);

                    String message = creditResponse.get("message") != null ? creditResponse.get("message").toString() : "Failed to credit receiver's wallet";

                    return new BLESyncResponse(request.getTransactionId(), "FAILED", message, false, new Date().toString());
                }
                System.out.println("[SERVICE] Receiver credited successfully");
            }
            catch (Exception e) {
                System.err.println("[SERVICE] Error crediting wallet: " + e.getMessage());

                // ROLLBACK: Reverse the debit
                try {
                    Map<String, Object> rollbackRequest = new HashMap<>();
                    rollbackRequest.put("profileId", senderProfileId);
                    rollbackRequest.put("amount", amount);
                    rollbackRequest.put("operation", "CREDIT");
                    rollbackRequest.put("transactionId", request.getTransactionId() + "_ROLLBACK");
                    rollbackRequest.put("description", "BLE Rollback from failed transaction");

                    userServiceClient.updateBalance(rollbackRequest);
                }
                catch (Exception rollbackError) {
                    System.err.println("CRITICAL: Rollback failed! " + rollbackError.getMessage());
                }

                transaction.setStatus("FAILED");
                transactionRepository.save(transaction);

                return new BLESyncResponse(request.getTransactionId(), "FAILED", "Error crediting wallet: " + e.getMessage(), false, new Date().toString());
            }

            // Step 10: Mark as SUCCESS
            transaction.setStatus("SUCCESS");
            transactionRepository.save(transaction);

            System.out.println("[SERVING] BLE transaction synced successfully: " + request.getTransactionId());

            return new BLESyncResponse(request.getTransactionId(), "SUCCESS", "BLE transaction synced successfully", true, new Date().toString());
        }
        catch (Exception e) {
            System.err.println("[SERVICE] Unexpected error: " + e.getMessage());
            e.printStackTrace();
            return new BLESyncResponse(request.getTransactionId(), "FAILED", "Error: " + e.getMessage(), false, new Date().toString());
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
}
