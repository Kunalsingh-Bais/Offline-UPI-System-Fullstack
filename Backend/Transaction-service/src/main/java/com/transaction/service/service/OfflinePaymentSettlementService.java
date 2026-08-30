package com.transaction.service.service;

import com.transaction.service.client.UserServiceClient;
import com.transaction.service.client.WalletServiceClient;
import com.transaction.service.dto.BLESyncRequest;
import com.transaction.service.dto.BLESyncResponse;
import com.transaction.service.encryption.EncryptionProcessor;
import com.transaction.service.entity.Transaction;
import com.transaction.service.repository.TransactionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Service
public class OfflinePaymentSettlementService {

    private static final Logger logger = LoggerFactory.getLogger(OfflinePaymentSettlementService.class);

    @Autowired
    private EncryptionProcessor encryptionProcessor;

    @Autowired
    private OfflineIdempotencyService offlineIdempotencyService;

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private WalletServiceClient walletServiceClient;

    @Autowired
    private UserServiceClient userServiceClient;

// ------ Method 1: Settle Wi-Fi Payment (Main entry point) ------
    public BLESyncResponse settleWiFiPayment(BLESyncRequest request) {

        logger.info("===== PAYMENT SETTLEMENT STARTED =====");
        logger.info("Transaction ID: {}",request.getTransactionId());
        logger.info("Sender: {}", request.getSenderUPI());
        logger.info("Receiver: {}", request.getReceiverUPI());

        try {
            // Step 1: Validate request format
            validateSettlementRequest(request);
            logger.info("Request is valid");

            // Step 2: Check nonce (prevent duplicates)
            if (!offlineIdempotencyService.isFirstTime(request.getNonce())) {
                logger.warn("DUPLICATE DETECTED: Nonce already processed");

                Optional<Transaction> existing = transactionRepository.findByTransactionId(request.getTransactionId());

                if (existing.isPresent()) {
                    logger.info("Returning existing settlement result");
                    return buildSuccessResponse(existing.get());
                }
                else {
                    logger.error("Duplicate nonce but no existing transaction!");
                    return buildFailureResponse(request, "DUPLICATE_NONCE", "Payment already processed");
                }
            }

            logger.info("Nonce is unique (first time)");

            // Step 3: Decrypt payment
            DecryptedPayment decrypted = decryptPayment(request);
            logger.info("Payment decrypted successfully");
            logger.info("Sender: {}", decrypted.senderUPI);
            logger.info("Receiver: {}", decrypted.receiverUPI);
            logger.info("Amount: ₹{}", decrypted.amount);

            // Step 4: Verify signature
            if (!verifySignature(decrypted, request.getSignature())) {
                logger.error("Signature verification FAILED");
                return buildFailureResponse(request, "SIGNATURE_FAILED", "Payment signature is invalid - data may be tampered");
            }
            logger.info("Signature verified - data integrity confirmed");

            // Step 5: Validate payment details
            validatePaymentDetails(decrypted, request);
            logger.info("Payment details are valid");

            // Step 6: Get sender and receiver profiles (via Feign)
            UserServiceClient.UserProfile sender = null;
            UserServiceClient.UserProfile receiver = null;

            try {
                sender = userServiceClient.getProfileByUPI(decrypted.senderUPI);
                receiver = userServiceClient.getProfileByUPI(decrypted.receiverUPI);

                if (sender == null || receiver == null) {
                    logger.error("User profile not found");
                    return buildFailureResponse(request, "USER_NOT_FOUND", "Sender or receiver profile not found");
                }

                logger.info("Profiles found");
                logger.info(" Sender: {} (ID: {})", sender.getUpiId(), sender.getProfileId());
                logger.info(" Receiver: {} (ID: {})", receiver.getUpiId(), receiver.getProfileId());
            }
            catch (Exception e) {
                logger.error("Error fetching user profiles: {}", e.getMessage());
                return buildFailureResponse(request, "SERVICE_ERROR",
                        "Failure to fetch user profiles: " + e.getMessage());
            }

            // Step 7: Check sender has sufficient balance (via Feign)
            BigDecimal senderBalance = null;

            try {
                senderBalance = walletServiceClient.getBalance(sender.getProfileId());

                if (senderBalance.compareTo(decrypted.amount) < 0) {
                    logger.error("Insufficient balance: {} < {}", senderBalance, decrypted.amount);
                    return buildFailureResponse(request, "INSUFFICIENT_BALANCE", "Sender has insufficient balance");
                }
                logger.info("Sender has sufficient balance: ₹{}", senderBalance);
            }
            catch (Exception e) {
                logger.error("Error checking balance: {}", e.getMessage());
                return buildFailureResponse(request, "SERVICE_ERROR", "Failed to check balance: " + e.getMessage());
            }

            // Step 8: Debit sender (via Feign)
            WalletServiceClient.WalletResponse debitResponse = null;

            try {
                debitResponse = walletServiceClient.debitWallet(
                        sender.getProfileId(),
                        decrypted.amount,
                        "BLE Payment: To " + decrypted.receiverUPI
                );

                if (!debitResponse.isSuccess()) {
                    logger.error("Debit failed: {}", debitResponse.getMessage());
                    return buildFailureResponse(request, "DEBIT_FAILED",
                            "Failed to debit sender: " + debitResponse.getMessage());
                }

                logger.info("Sender debited: -₹{}", decrypted.amount);
                logger.info(" New balance: ₹{}", debitResponse.getNewBalance());
            }
            catch (Exception e) {
                logger.error("Error debiting wallet: {}", e.getMessage());
                return buildFailureResponse(request, "SERVICE_ERROR", "Failed to debit wallet: " + e.getMessage());
            }

            // Step 9: Credit receiver (via Feign)
            WalletServiceClient.WalletResponse creditResponse = null;

            try {
                creditResponse = walletServiceClient.creditWallet(
                        receiver.getProfileId(),
                        decrypted.amount,
                        "BLE Payment: From " + decrypted.senderUPI
                );

                if (!creditResponse.isSuccess()) {
                    logger.error("Credit failed: {}", creditResponse.getMessage());

                    // Undo debit if credit fails
                    logger.error("CRITICAL: Rolling back debit!");
                    walletServiceClient.creditWallet(
                            sender.getProfileId(),
                            decrypted.amount,
                            "Rollback: Failed credit"
                    );
                    return buildFailureResponse(request, "CREDIT_FAILED", "Failed to credit receiver, transaction rolled back");
                }
                logger.info("Receiver credited: +₹{}", decrypted.amount);
                logger.info("New balance: ₹{}", creditResponse.getNewBalance());
            }
            catch (Exception e) {
                logger.error("Error crediting wallet: {}", e.getMessage());
                logger.error("CRITICAL: Rolling back debit!");

                // Rollback debit if credit fails
                try {
                    walletServiceClient.creditWallet(
                            sender.getProfileId(),
                            decrypted.amount,
                            "Rollback: Failed credit"
                    );
                }
                catch (Exception rollbackError) {
                    logger.error("CRITICAL: Rollback failed! {}", rollbackError.getMessage());
                }

                return buildFailureResponse(request, "SERVICE_ERROR", "Failed to credit wallet: " + e.getMessage());
            }

            // Step 10: Create transaction record
            Transaction transaction = createTransactionRecord(request, sender, receiver, decrypted.amount);

            logger.info("Transaction record created");
            logger.info("Backend TX ID: {}", transaction.getBackendTransactionId());

            // Step 11: Return success
            logger.info("PAYMENT SETTLEMENT COMPLETE");
            return buildSuccessResponse(transaction);
        }
        catch (Exception e) {
            logger.error("SETTLEMENT FAILED");
            logger.error("Error: {}", e.getMessage());
            e.printStackTrace();

            return buildFailureResponse(request, "SETTLEMENT_ERROR", "Payment settlement failed: " + e.getMessage());
        }
    }

// ------ Method 2: Decrypt Payment data ------
    private DecryptedPayment decryptPayment(BLESyncRequest request) throws Exception {
        logger.info("Decrypting payment with EncryptionProcessor...");

        try {
            var decryptionResult = encryptionProcessor.decryptAndVerifyPayment(request.getEncryptedData());

            if (!(boolean) decryptionResult.get("hashVerified")) {
                throw new Exception("Hash verification failed during decryption");
            }

            String senderUPI = (String) decryptionResult.get("senderUpiId");
            String receiveUPI = (String) decryptionResult.get("receiverUpiId");
            String amountStr = (String) decryptionResult.get("amount");

            BigDecimal amount = new BigDecimal(amountStr);

            logger.info("Decryption successful");

            return new DecryptedPayment(senderUPI, receiveUPI, amount);
        }
        catch (Exception e) {
            logger.error("Decryption failed: {}", e.getMessage());
            throw new Exception("Failed to decrypt payment: " + e.getMessage(), e);
        }
    }

// ------ Method 3: Verify payment signature ------
    private boolean verifySignature(DecryptedPayment payment, String signature) {
        logger.info("Verifying payment signature...");

        try {
            String paymentString = payment.senderUPI + "|" + payment.receiverUPI + "|" + payment.amount;

            String calculatedSignature = calculateSignature(paymentString);
            boolean isValid = calculatedSignature.equals(signature);

            if (isValid) {
                logger.info("Signature is VALID");
            }
            else {
                logger.error("Signature is INVALID");
            }

            return isValid;
        }
        catch (Exception e) {
            logger.error("Error verifying signature: {}", e.getMessage());
            return false;
        }
    }

// ------ Method 4: Validate payment details ------
    private void validatePaymentDetails(DecryptedPayment payment, BLESyncRequest request) throws Exception {
        logger.info("Validating payment details...");

        if (payment.amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new Exception("Amount must be positive");
        }

        if (payment.amount.compareTo(new BigDecimal("100000")) > 0) {
            throw new Exception("Amount exceeds maximum limit (₹100,000)");
        }

        logger.info("Amount valid: ₹{}", payment.amount);

        if (!isValidUPI(payment.senderUPI)) {
            throw new Exception("Invalid sender UPI format");
        }

        if (!isValidUPI(payment.receiverUPI)) {
            throw new Exception("Invalid receiver UPI format");
        }

        logger.info("UPI formats valid");

        if (payment.senderUPI.equals(payment.receiverUPI)) {
            throw new Exception("Cannot send to yourself");
        }

        logger.info("Not self-transfer");

        long ageMs = System.currentTimeMillis() - request.getTimestamp();
        long maxAgeMs = 5 * 60 * 1000;

        if (ageMs > maxAgeMs) {
            throw new Exception("Payment is too old: " + ageMs + "ms");
        }

        logger.info("Timestamp valid (age: {}ms)", ageMs);
    }

// ------ Method 5: Create Transaction ------
    private Transaction createTransactionRecord(
            BLESyncRequest request,
            UserServiceClient.UserProfile sender,
            UserServiceClient.UserProfile receiver,
            BigDecimal amount ) {

        logger.info("Creating transaction record...");

        Transaction transaction = new Transaction();

        transaction.setTransactionId(request.getTransactionId());
        transaction.setSenderUpiId(sender.getUpiId());
        transaction.setSenderProfileId(sender.getProfileId());
        transaction.setReceiverUpiId(receiver.getUpiId());
        transaction.setReceiverProfileId(receiver.getProfileId());
        transaction.setAmount(amount);

        transaction.setPaymentMethod("WiFi");
        transaction.setSource("Wifi_SYNC");
        transaction.setEncryptedPayload(request.getEncryptedData());
        transaction.setSignature(request.getSignature());
        transaction.setNonce(request.getNonce());
        transaction.setIsOffline(true);
        transaction.setReceivedAt(LocalDateTime.now());
        transaction.setSyncedAt(LocalDateTime.now());
        transaction.setPayloadVersion(request.getPayloadVersion());

        transaction.setStatus("SUCCESS");
        transaction.setBackendTransactionId(UUID.randomUUID().toString());
        transaction.setDescription("BLE offline payment settled");

        String txnString = sender.getUpiId() + "|" + receiver.getUpiId() + "|" + amount;
        transaction.setTxnHash(calculateHash(txnString));

        LocalDateTime expireAt = LocalDateTime.now().plusDays(30);
        transaction.setExpireAt(expireAt);

        transaction = transactionRepository.save(transaction);

        logger.info("Transaction record created");
        logger.info("  DB ID: {}", transaction.getId());
        logger.info("  Backend TX ID: {}", transaction.getBackendTransactionId());

        return transaction;
    }

// ------ Method 6: Validate settlement request ------
    private void validateSettlementRequest(BLESyncRequest request) throws Exception {
        if (request.getTransactionId() == null || request.getTransactionId().isEmpty()) {
            throw new Exception("Transaction ID is required");
        }

        if (request.getEncryptedData() == null || request.getEncryptedData().isEmpty()) {
            throw new Exception("Encrypted data is required");
        }

        if (request.getSignature() == null || request.getSignature().isEmpty()) {
            throw new Exception("Signature is required");
        }

        if (request.getNonce() == null || request.getNonce().isEmpty()) {
            throw new Exception("Nonce is required");
        }

        if (request.getTimestamp() == null || request.getTimestamp() == 0) {
            throw new Exception("Timestamp is required");
        }

        logger.info("All required fields present");
    }

// ------ Method 7: Build SUCCESS response ------
    private BLESyncResponse buildSuccessResponse(Transaction transaction) {

        BLESyncResponse response = new BLESyncResponse();
        response.setTransactionId(transaction.getTransactionId());
        response.setStatus("SUCCESS");
        response.setSuccess(true);
        response.setMessage("Payment settled successfully");
        response.setBackendTransactionId(transaction.getBackendTransactionId());
        response.setTimestamp(LocalDateTime.now().toString());

        return response;
    }

// ------ Method 8: Build Failure Response ------
    private BLESyncResponse buildFailureResponse(BLESyncRequest request, String status, String message) {

        BLESyncResponse response = new BLESyncResponse();
        response.setTransactionId(request.getTransactionId());
        response.setStatus(status);
        response.setSuccess(false);
        response.setMessage(message);
        response.setTimestamp(LocalDateTime.now().toString());

        return response;
    }

// ------ Method 9: Validate UPI ------
    private boolean isValidUPI(String upi) {
        if (upi == null || upi.isEmpty()) return false;

        return upi.matches("[a-zA-Z0-9._-]+@[a-zA-Z0-9]+") && upi.length() >=5 && upi.length() <= 50;
    }

// ------ Method 10: Calculate Signature ------
    private String calculateSignature(String data) {
        return Integer.toHexString(data.hashCode());
    }

// ------ Method 11: Calculate Hash ------
    private String calculateHash(String data) {
        return Integer.toHexString(data.hashCode());
    }

// ------ HELPER METHOD ------

    public static class DecryptedPayment {
        public String senderUPI;
        public String receiverUPI;
        public BigDecimal amount;

        public DecryptedPayment(String senderUPI, String receiverUPI, BigDecimal amount) {
            this.senderUPI = senderUPI;
            this.receiverUPI = receiverUPI;
            this.amount = amount;
        }
    }
}
