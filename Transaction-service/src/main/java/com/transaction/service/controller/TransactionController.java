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

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/transaction")
@CrossOrigin(origins = "*")
public class TransactionController {

    @Autowired
    private TransactionService transactionService;

    @Autowired
    private EncryptionProcessor encryptionProcessor;

    // ----- POST /transaction/initiate -----
    @PostMapping("/initiate")
    public ResponseEntity<InitiateTransactionResponse> initiateTransaction(@RequestBody InitiateTransactionRequest request) {
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
            // Validate request
            if (request.getTransactionId() == null || request.getTransactionId().isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(new CompleteTransactionResponse(null, "FAILED", null, null,
                                "transactionId is required", false)
                        );
            }

            if (request.getEncryptedData() == null || request.getEncryptedData().isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(new CompleteTransactionResponse(request.getTransactionId(), "FAILED", null, null,
                                "encryptedData is required", false)
                        );
            }
            // Call service to complete transaction
            CompleteTransactionResponse response = transactionService.completeTransaction(request);

            if (response.isSuccess()) {  // Return 200 OK if successful
                return ResponseEntity.ok(response);
            }
            else {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
            }
        }
        catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new CompleteTransactionResponse(request.getTransactionId(), "FAILED",null , null,
                            "Error: " +e.getMessage(),false));
        }
    }
}
