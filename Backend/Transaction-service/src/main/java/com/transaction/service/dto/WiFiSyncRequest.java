package com.transaction.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class WiFiSyncRequest {
    private String transactionId;
    private String encryptedData;  // Encrypted wifi transaction payload
    private String signature;
    private String nonce;
    private Long timestamp;
    private String senderUPI;
    private String receiverUPI;
    private BigDecimal amount;
    private Integer payloadVersion;
}
