package com.transaction.service.repository;

import com.transaction.service.entity.Transaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TransactionRepository extends JpaRepository<Transaction, Integer> {

    // Find transaction by unique transactionId
    // Used to check if transaction already processed (idempotency)
    Optional<Transaction> findByTransactionId(String transactionId);

    // Check if transaction exists
    boolean existsByTransactionId(String transactionId);

    List<Transaction> findBySenderProfileIdOrReceiverProfileIdOrderByCreatedAtDesc(Integer senderProfileId, Integer receiverProfileId);

    // Find all transactions sent by a user
    List<Transaction> findBySenderUpiId(String senderUpiId);

    // Find all transactions received by a user
    List<Transaction> findByReceiverUpiId(String ReceiverUpiId);

    // Find transactions by status
    List<Transaction> findByStatus(String status);

    // Find transactions by status and sender
    List<Transaction> findByStatusAndSenderUpiId(String status, String senderUpiId);

    // Find transactions by nonce (prevent duplicate)
    Optional<Transaction> findByNonce(String nonce);

    // Find all pending BLE transactions (not yet synced)
    List<Transaction> findBySourceAndIsOfflineAndStatusOrderByCreatedAtDesc(String source, Boolean isOffline, String status);

    // Find pending BLE sync by receiver UPI
    List<Transaction> findByReceiverUpiIdAndSourceAndSyncedAtIsNull(String receiverUpiId, String source);

    // Find transactions that need syncing
    List<Transaction> findBySyncAttemptsLessThanAndIsOfflineAndStatusOrderByCreatedAtAsc(Integer maxAttempts, Boolean isOffline, String status);

}
