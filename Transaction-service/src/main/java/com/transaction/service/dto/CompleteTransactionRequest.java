package com.transaction.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class CompleteTransactionRequest {
    private String transactionId;
    private String encryptedData;    // AES encrypted payment details
    private String signature;     // Digital signature for verification
    private String deviceId;      // Device that initiated transaction
}
