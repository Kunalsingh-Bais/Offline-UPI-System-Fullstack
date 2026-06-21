package com.transaction.service.service;

import com.transaction.service.client.UserServiceClient;
import com.transaction.service.dto.CompleteTransactionRequest;
import com.transaction.service.dto.CompleteTransactionResponse;
import com.transaction.service.dto.InitiateTransactionRequest;
import com.transaction.service.dto.InitiateTransactionResponse;
import com.transaction.service.encryption.EncryptionProcessor;
import com.transaction.service.encryption.HashingService;
import com.transaction.service.encryption.RSAKeyService;
import com.transaction.service.entity.Transaction;
import com.transaction.service.repository.TransactionRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

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
                    txn.setTransactionId("FAILED");
                    transactionRepository.save(txn);

                    return new CompleteTransactionResponse(txn.getTransactionId(),"FAILED", null, null,
                            "Failed to debit sender's wallet", false, new java.util.Date().toString());
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
