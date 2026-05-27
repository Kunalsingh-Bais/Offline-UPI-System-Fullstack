package com.transaction.service.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@NoArgsConstructor
@AllArgsConstructor
@Data
@Entity
@Table(name = "transactions")
public class Transaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "transaction_Id", nullable = false, unique = true)
    private String transactionId;

    @Column(nullable = false)
    private String senderUpiId;

    @Column(nullable = false)
    private Integer senderProfileId;  // Profile ID from user-service

    @Column(nullable = false)
    private String receiverUpiId;

    @Column(nullable = false)
    private Integer receiverProfileId;  // Profile ID from user-service

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(nullable = false)
    private String status;  // "PENDING", "SUCCESS", "FAILED"

    @Column(nullable = false)
    private String txnHash;  // SHA-256 hash of transaction data

    @Column(nullable = false)
    private LocalDateTime expireAt;  // if transaction not processed by this time, transaction fails

    @Column(length = 500)
    private String Description;

    @Column(name = "created_At", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_At", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
