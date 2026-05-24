package com.transaction.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class CompleteTransactionResponse {
    private String transactionId;
    private String status;      // "SUCCESS" or "FAILED"
    private BigDecimal senderNewBalance;    // Updated balance after transaction
    private BigDecimal receiverNewBalance;
    private String message;
    private boolean success;
}
