package com.transaction.service.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class CompleteTransactionRequest {

    @NotBlank(message = "transactionId is required")
    @Pattern(regexp = "^TXN_.*", message = "Invalid transaction Id format")
    private String transactionId;

    @NotBlank(message = "encryption is required")
    private String encryptedData;    // AES encrypted payment details

    private String signature;     // Digital signature for verification
}
