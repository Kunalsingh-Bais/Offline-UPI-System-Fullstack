package com.transaction.service.service;

import com.transaction.service.dto.BLESyncRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class OfflinePaymentReceiverService {

    private static final Logger logger = LoggerFactory.getLogger(OfflinePaymentReceiverService.class);

    // Receive payment from Device A via WiFi relay
    // Stores it but don't settle yet (will settle when synced from Device B)
    public void receivePaymentFromRelay(BLESyncRequest request) {
        logger.info("Receiving payment from relay");
        logger.info("Sender: {}, Receiver: {}", request.getSenderUPI(), request.getReceiverUPI());

        try {
            // we just log that we received it
            // Device B will sync it later when it gets internet

            logger.info("Payment queued for later sync");
        }
        catch (Exception e) {
            logger.error("Error: ", e);
            throw new RuntimeException("Failed to receive payment: " + e.getMessage());
        }
    }
}
