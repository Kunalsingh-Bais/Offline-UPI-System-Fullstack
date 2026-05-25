package com.transaction.service.dto;

import jakarta.validation.constraints.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@NoArgsConstructor
@AllArgsConstructor
@Data
public class InitiateTransactionRequest {

    @NotBlank(message = "senderUpiId is required")
    @Pattern(regexp = "^[a-zA-Z0-9.%+-]+@upi$", message = "Invalid UPI ID format")
    private String senderUpiId;

    @NotNull(message = "senderProfileId is required")
    @Positive(message = "senderProfileId must be positive")
    private Integer senderProfileId;

    @NotBlank(message = "receiverUpiId is required")
    @Pattern(regexp = "^[a-zA-Z0-9.%+-]+@upi$", message = "Invalid UPI ID format")
    private String receiverUpiId;

    @NotNull(message = "receiverProfileId is required")
    @Positive(message = "receiverProfileId must be positive")
    private Integer receiverProfileId;

    @NotNull(message = "amount is required")
    @DecimalMin(value = "0.01", message = "amount must be greater than 0")
    @DecimalMax(value = "999999.99", message = "amount cannot exceed 999999.99")
    private BigDecimal amount;

    @Size(max = 500, message = "description cannot exceed 500 characters")
    private String description;
}