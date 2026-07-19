package com.transaction.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class BLESyncResponse {
    private String transactionId;
    private String status;   // SUCCESS, FAILED
    private String message;
    private boolean success;
    private String timestamp;
}
