package com.user.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;

@AllArgsConstructor
@NoArgsConstructor
@Data
public class UpdateBalanceRequest {
    private Integer profileId;
    private BigDecimal amount;       // Amount to add or subtract
    private String operation;        // "DEBIT" or "CREDIT"
    private String transactionId;    // For idempotency (prevent duplicate debit)
    private String description;      // "Send to tom@upi"  or  "Received from ram@upi"
}
