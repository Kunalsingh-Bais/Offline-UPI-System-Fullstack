package com.transaction.service.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class DecryptedTransactionData {
    private String senderUpiId;
    private String receiverUpiId;
    private String amount;
    private boolean hashVerified;
    private String error;
}
