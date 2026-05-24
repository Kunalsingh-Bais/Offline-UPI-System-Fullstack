package com.user.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class UpdateBalanceResponse {
    private Integer walletId;
    private BigDecimal previousBalance;     // Balance before transaction
    private BigDecimal newBalance;          // Balance after transaction
    private BigDecimal amount;              // Amount changed
    private String operation;               // "DEBIT" or "CREDIT"
    private String transactionId;
    private boolean success;
    private String message;
}
