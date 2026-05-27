package com.transaction.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class PublicKeyResponse {
    private String transactionId;
    private String publicKey;
    private String algorithm;
    private int keySize;
    private boolean success;
    private String message;
}
