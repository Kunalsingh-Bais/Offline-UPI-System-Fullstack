package com.transaction.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class InitiateTransactionRequest {
    private String senderUpiId;
    private int senderProfileId;
    private String receiverUpiId;
    private int receiverProfileId;
    private BigDecimal amount;
    private String description;
    private String deviceId;

}
