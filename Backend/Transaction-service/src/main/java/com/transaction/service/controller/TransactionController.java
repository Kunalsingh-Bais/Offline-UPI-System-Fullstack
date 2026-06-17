package com.transaction.service.controller;

import com.transaction.service.dto.CompleteTransactionRequest;
import com.transaction.service.dto.CompleteTransactionResponse;
import com.transaction.service.dto.InitiateTransactionRequest;
import com.transaction.service.dto.InitiateTransactionResponse;
import com.transaction.service.encryption.EncryptionProcessor;
import com.transaction.service.service.TransactionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/transaction")
public class TransactionController {

    @Autowired
    private TransactionService transactionService;

    @Autowired
    private EncryptionProcessor encryptionProcessor;

    // ----- POST /transaction/initiate -----
    @PostMapping("/initiate")
    public ResponseEntity<InitiateTransactionResponse> initiateTransaction(@RequestBody InitiateTransactionRequest request) {
        System.out.println("Transaction endpoint hit!");
        try {
            // Validate request
            if (request.getSenderUpiId() == null || request.getSenderUpiId().isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(new InitiateTransactionResponse(null,null,null,null,null,null,null,
                                false, "senderUpiId is required")
                        );
            }

            if (request.getReceiverUpiId() == null || request.getReceiverUpiId().isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(new InitiateTransactionResponse(null,null,null,null,null,null,
                                null,false, "receiverUpiId is required")
                        );
            }

            if (request.getAmount() == null || request.getAmount().compareTo(java.math.BigDecimal.ZERO) <= 0) {
                return ResponseEntity.badRequest()
                        .body(new InitiateTransactionResponse(null, request.getSenderUpiId(), request.getReceiverUpiId(),
                                request.getAmount(), null, null, null, false,"amount must be greater than 0")
                        );
            }

            // Call service to initiate transaction
            InitiateTransactionResponse response = transactionService.initiateTransaction(request);

            if (response.isSuccess()) {    // Return 201 created if successful
                return ResponseEntity.status(HttpStatus.CREATED).body(response);
            }
            else {
                // Return 400 Bad request if failed
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
            }
        }
        catch (Exception e) {
            // Return 500 Internal server error
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new InitiateTransactionResponse(null, request.getSenderUpiId(), request.getReceiverUpiId(), request.getAmount(),
                            null, null, null, false, "Error: " +e.getMessage())
            );
        }
    }

    // ------ GET /transaction/public-key/{transactionId} ------
    @GetMapping("/public-key/{transactionId}")
    public ResponseEntity<Map<String, Object>> getPublicKey(@PathVariable String transactionId) {
        try {
            // Validate transactionId
            if (transactionId == null || transactionId.isEmpty()) {
                Map<String, Object> errorResponse = new HashMap<>();
                errorResponse.put("success", false);
                errorResponse.put("message", "transactionId is required");
                return ResponseEntity.badRequest().body(errorResponse);
            }

            // Call processor to get public key data
            Map<String, Object> response = encryptionProcessor.generatePublicKeyData();

            // Return 200 OK
            return ResponseEntity.ok(response);
        }
        catch (Exception e) {
            Map<String, Object> errorResponse = new HashMap<>();
            errorResponse.put("success", false);
            errorResponse.put("error", "Error: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorResponse);
        }
    }
    // ----- POST /transaction/complete -----
    @PostMapping("/complete")
    public ResponseEntity<CompleteTransactionResponse> completeTransaction(@RequestBody CompleteTransactionRequest request) {
        try {
            System.out.println("\n ==== Transaction Complete Endpoint === ");
            System.out.println("Transaction ID: " +request.getTransactionId());
            System.out.println("Encrypted data length: " +request.getEncryptedData().length());

            // Decrypt Payment Data
            Map<String, Object> decryptionResult = encryptionProcessor.decryptAndVerifyPayment(request.getEncryptedData());

            // Check if decryption was successful
            if(!(boolean) decryptionResult.getOrDefault("hashVerified", false)) {
                System.out.println("Decryption verification failed");

                CompleteTransactionResponse errorResponse = new CompleteTransactionResponse();
                errorResponse.setSuccess(false);
                errorResponse.setMessage((String) decryptionResult.get("error"));
                errorResponse.setStatus("FAILED");
                errorResponse.setTransactionId(request.getTransactionId());
                errorResponse.setTimestamp(new java.util.Date().toString());

                return ResponseEntity.badRequest().body(errorResponse);
            }

            // Extract decrypted values
            String senderUpiId = (String) decryptionResult.get("senderUpiId");
            String receiverUpiId = (String) decryptionResult.get("receiverUpiId");
            String amountStr = (String) decryptionResult.get("amount");
            double amount = Double.parseDouble(amountStr);

            System.out.println("\n Decryption successful!");
            System.out.println("Sender: " + senderUpiId);
            System.out.println("Receiver: " + receiverUpiId);
            System.out.println("Amount: ₹" + amount);

            // ---- Process Transaction ----

            // TODO: Implement actual transaction logic
            // For now , using mock values
            BigDecimal senderNewBalance = BigDecimal.valueOf(4500.00);
            BigDecimal receiverNewBalance = BigDecimal.valueOf(1200.00);

            // Build Success Response
            CompleteTransactionResponse successResponse = new CompleteTransactionResponse();
            successResponse.setSuccess(true);
            successResponse.setMessage("Transaction completed successfully");
            successResponse.setStatus("SUCCESS");
            successResponse.setSenderNewBalance(senderNewBalance);
            successResponse.setReceiverNewBalance(receiverNewBalance);
            successResponse.setTransactionId(request.getTransactionId());
            successResponse.setTimestamp(new java.util.Date().toString());

            System.out.println("==== Transaction Completed ====\n");

            return ResponseEntity.ok(successResponse);
        }
        catch (Exception e) {
            System.out.println(" Error: " + e.getMessage());
            e.printStackTrace();

            CompleteTransactionResponse errorResponse = new CompleteTransactionResponse();
            errorResponse.setSuccess(false);
            errorResponse.setMessage("Transaction failed: " + e.getMessage());
            errorResponse.setStatus("FAILED");
            errorResponse.setTransactionId(request.getTransactionId());
            errorResponse.setTimestamp(new java.util.Date().toString());

            return ResponseEntity.internalServerError().body(errorResponse);
        }
    }
}
