package com.transaction.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class EncryptedTransactionData {
    private String encryptedAESKey;
    private String encryptedPaymentData;
    private String dataHash;
}
