package com.transaction.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class BLESyncRequest {
    private String transactionId;
    private String encryptedData;  // Encrypted BLE transaction payload

}
