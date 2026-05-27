package com.user.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class GetBalanceResponse {
    private Integer walletId;
    private Integer profileId;
    private String  upiId;
    private BigDecimal balance;     // Current balance
    private String currency;        // "INR"
    private boolean success;
    private String message;
}
