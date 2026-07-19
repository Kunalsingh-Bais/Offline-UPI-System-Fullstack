package com.transaction.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class BLETransactionPayload {
    private String senderUpiId;
    private String receiverUpiId;
    private double amount;
    private String description;
}
