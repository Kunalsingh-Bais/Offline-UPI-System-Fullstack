package com.transaction.service.controller;

import com.transaction.service.dto.BLESyncRequest;
import com.transaction.service.service.OfflinePaymentReceiverService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/payment")
@CrossOrigin(origins = "*")
public class OfflineTransactionController {

    private static final Logger logger = LoggerFactory.getLogger(OfflineTransactionController.class);

    @Autowired
    private OfflinePaymentReceiverService paymentReceiverService;

    // ------ Health Check (for discovery) ------
    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        logger.info("Health check requested");

        Map<String, String> response = new HashMap<>();
        response.put("status", "ok");
        response.put("timestamp", System.currentTimeMillis() + " ");

        return ResponseEntity.ok(response);
    }

    // ------ Receive payment form sender (Device A -> Device B) ------
    @PostMapping("/receive")
    public ResponseEntity<Map<String, Object>> receivePayment(@RequestBody BLESyncRequest request) {
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
}

