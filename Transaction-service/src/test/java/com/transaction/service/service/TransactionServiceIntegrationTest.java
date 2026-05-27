package com.transaction.service.service;

import com.transaction.service.client.UserServiceClient;
import com.transaction.service.dto.CompleteTransactionRequest;
import com.transaction.service.dto.CompleteTransactionResponse;
import com.transaction.service.dto.InitiateTransactionRequest;
import com.transaction.service.dto.InitiateTransactionResponse;
import com.transaction.service.encryption.AESEncryptionService;
import com.transaction.service.encryption.EncryptionProcessor;
import com.transaction.service.encryption.HashingService;
import com.transaction.service.encryption.RSAKeyService;
import com.transaction.service.entity.Transaction;
import com.transaction.service.repository.TransactionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@SpringBootTest
@ActiveProfiles("test")
public class TransactionServiceIntegrationTest {

    @Autowired
    private TransactionService transactionService;

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private RSAKeyService rsaKeyService;

    @Autowired
    private HashingService hashingService;

    @Autowired
    private AESEncryptionService aesEncryptionService;

    @Autowired
    private EncryptionProcessor encryptionProcessor;

    // ------- Mock User Service ------
    // Instead of calling real User Service, use a mock
    @MockBean
    private UserServiceClient userServiceClient;

    @BeforeEach
    void setUp() {
        Map<String, Object> mockResponse = new HashMap<>();
        mockResponse.put("success", true);
        mockResponse.put("profileId", 1);
        mockResponse.put("newBalance", 9500.00);
        mockResponse.put("operation", "DEBIT");
        mockResponse.put("message", "Balance updated");

        // Configure mock to return success response
        when(userServiceClient.updateBalance(any())).thenReturn(mockResponse);
    }

// ------ TEST 1: Initiate Transaction ------
    @Test
    public void testInitiateTransaction_Success() {

        // Create request
        InitiateTransactionRequest request = new InitiateTransactionRequest();
        request.setSenderUpiId("ravi@upi");
        request.setSenderProfileId(1);
        request.setReceiverUpiId("sam@upi");
        request.setReceiverProfileId(2);
        request.setAmount(new BigDecimal("500.00"));
        request.setDescription("Payment for lunch");

        // Call service
        InitiateTransactionResponse response = transactionService.initiateTransaction(request);

        // Verify response
        assertTrue(response.isSuccess(), "Response should be successful");
        assertNotNull(response.getTransactionId(), "TransactionId should not be null");
        assertEquals("PENDING", response.getStatus(), "Status should be PENDING");
        assertEquals(new BigDecimal("500.00"), response.getAmount(), "Amount should match request");
        assertNotNull(response.getPublicKey(), "Public key should be returned");
        assertNotNull(response.getExpiresAt(), "ExpiresAt should be set");

        // Verify transaction in database
        Optional<Transaction> txnInDb = transactionRepository.findByTransactionId(response.getTransactionId());
        assertTrue(txnInDb.isPresent(), "Transaction should be saved in database");

        Transaction savedTxn = txnInDb.get();
        assertEquals("ravi@upi", savedTxn.getSenderUpiId(), "Sender should match");
        assertEquals("sam@upi", savedTxn.getReceiverUpiId(), "Receiver should match");
        assertEquals("PENDING", savedTxn.getStatus(), "Status should be PENDING");
    }

// ------ TEST 2: Initiate with missing fields ------
    // Test: Initiate transaction with missing required field
    @Test
    public void testInitiateTransaction_MissingReceiverUpiId() {
        // Create request with missing receiverUpiId
        InitiateTransactionRequest request = new InitiateTransactionRequest();
        request.setSenderUpiId("ravi@upi");
        request.setSenderProfileId(1);
        request.setReceiverUpiId(null);    // Missing
        request.setReceiverProfileId(2);
        request.setAmount(new BigDecimal("500.00"));

        // Call service
        InitiateTransactionResponse response = transactionService.initiateTransaction(request);

        // Should fail
        assertFalse(response.isSuccess(), "Should fail with missing receiverUpiId");
    }

// ------ TEST 3: Complete transaction ------
    // Test: Complete transaction successfully
    @Test
    public void testCompleteTransaction_Success() throws Exception {

        // Initiate transaction first
        InitiateTransactionRequest initiateRequest = new InitiateTransactionRequest();
        initiateRequest.setSenderUpiId("ravi@upi");
        initiateRequest.setSenderProfileId(1);
        initiateRequest.setReceiverUpiId("sam@upi");
        initiateRequest.setReceiverProfileId(2);
        initiateRequest.setAmount(new BigDecimal("500.00"));
        initiateRequest.setDescription("Payment for lunch");

        InitiateTransactionResponse initiateResponse = transactionService.initiateTransaction(initiateRequest);
        String transactionId = initiateResponse.getTransactionId();
        String publicKey = initiateResponse.getPublicKey();

        // Encrypt payment data (simulate client)
        // Generate AES key
        String aesKey = aesEncryptionService.generateAESKey();

        // Payment data format: "sender|receiver|amount"
        String paymentData = "ravi@upi|sam@upi|500";

        // Encrypt AES key using RSA public key
        String encryptedAESKey = rsaKeyService.encryptWithPublicKey(aesKey);

        // Encrypt payment data using AES key
        String encryptedPaymentData = aesEncryptionService.encryptWithAES(paymentData,aesKey);

        // Generate hash
        String dataHash = hashingService.generateSHA256Hash(paymentData);

        // Prepare encrypted data (comma-separated)
        String encryptedData = encryptedAESKey + "," + encryptedPaymentData + "," + dataHash;

        // Create complete request
        CompleteTransactionRequest completeRequest = new CompleteTransactionRequest();
        completeRequest.setTransactionId(transactionId);
        completeRequest.setEncryptedData(encryptedData);

        // Call service
        CompleteTransactionResponse response = transactionService.completeTransaction(completeRequest);

        // Verify response
        assertTrue(response.isSuccess(), "Response should be successful");
        assertEquals("SUCCESS",response.getStatus(), "Status should be SUCCESS");
        assertEquals(transactionId, response.getTransactionId(), "TransactionId should match");

        // Verify transaction in database is updated
        Optional<Transaction> txnInDb = transactionRepository.findByTransactionId(transactionId);

        assertTrue(txnInDb.isPresent(), "Transaction should exist");
        assertEquals("SUCCESS", txnInDb.get().getStatus(), "Status should be SUCCESS in database");
    }

// ------ TEST 4: Complete transaction (Already processed) ------
    // Test: Complete same transaction twice
    // Should be idempotent (return SUCCESS both times)
    @Test
    public void testCompleteTransaction_Idempotency() throws Exception {

        // Create and save transaction
        InitiateTransactionRequest initalResquest = new InitiateTransactionRequest();
        initalResquest.setSenderUpiId("ravi@upi");
        initalResquest.setSenderProfileId(1);
        initalResquest.setReceiverUpiId("sam@upi");
        initalResquest.setReceiverProfileId(2);
        initalResquest.setAmount(new BigDecimal("500.00"));

        InitiateTransactionResponse initialResponse =  transactionService.initiateTransaction(initalResquest);
        String transactionId = initialResponse.getTransactionId();

        // Manually mark as SUCCESS (simulate already completed)
        Transaction txn = transactionRepository.findByTransactionId(transactionId).get();
        txn.setStatus("SUCCESS");
        transactionRepository.save(txn);

        // Try to complete again
        CompleteTransactionRequest completeRequest = new CompleteTransactionRequest();
        completeRequest.setTransactionId(transactionId);
        completeRequest.setEncryptedData("dummy,dummy,dummy");

        // Call Service
        CompleteTransactionResponse response = transactionService.completeTransaction(completeRequest);

        // Verify idempotency
        assertTrue(response.isSuccess(), "Should return SUCCESS (already completed)");
        assertEquals("SUCCESS", response.getStatus(), "Status should still be SUCCESS");
    }

// ------ TEST 5: Transaction Expiry ------
    // Test: Transaction expires after TTL
    @Test
    public void testCompleteTransaction_Expired() throws Exception {
        // Create transaction
        InitiateTransactionRequest initiateRequest = new InitiateTransactionRequest();
        initiateRequest.setSenderUpiId("ravi@upi");
        initiateRequest.setSenderProfileId(1);
        initiateRequest.setReceiverUpiId("sam@upi");
        initiateRequest.setReceiverProfileId(2);
        initiateRequest.setAmount(new BigDecimal("500.00"));

        InitiateTransactionResponse initiateResponse = transactionService.initiateTransaction(initiateRequest);
        String transactionId = initiateResponse.getTransactionId();

        // Manually set expiry to past
        Transaction txn = transactionRepository.findByTransactionId(transactionId).get();
        txn.setExpireAt(java.time.LocalDateTime.now().minusMinutes(1));
        transactionRepository.save(txn);

        // Try to complete
        CompleteTransactionRequest completeRequest = new CompleteTransactionRequest();
        completeRequest.setTransactionId(transactionId);
        completeRequest.setEncryptedData("dummy,dummy,dummy");

        // Call service
        CompleteTransactionResponse response = transactionService.completeTransaction(completeRequest);

        // Verify it fails with expiry error
        assertFalse(response.isSuccess(), "Should fail due to expiry");
        assertEquals("FAILED", response.getStatus(), "Status should be FAILED");
        assertTrue(response.getMessage().contains("expired"), "Message should mention expiry");
    }

// ------ TEST 6: Encryption/Decryption Flow ------
    // Ensure RSA + AES + SHA-256 work together
    @Test
    public void testEncryptionDecryptionFlow() throws Exception {

        // Generate keys
        String publicRSAKey = rsaKeyService.getPublicKeyString();
        assertNotNull(publicRSAKey, "Public key should be generated");

        // Generate AES key
        String aesKey = aesEncryptionService.generateAESKey();
        assertNotNull(aesKey, "AES key should be generated");

        // Encrypt AES key with RSA
        String encryptedAESKey = rsaKeyService.encryptWithPublicKey(aesKey);
        assertNotNull(encryptedAESKey, "Encrypted AES key should not be null");
        assertNotEquals(aesKey, encryptedAESKey, "Encrypted should be different from plain");

        // Encrypt payment data with AES
        String paymentData  = "ravi@upi|sam@upi|500";
        String encryptedPaymentData = aesEncryptionService.encryptWithAES(paymentData, aesKey);
        assertNotNull(encryptedPaymentData, "Encrypted payment should not be null");
        assertNotEquals(paymentData, encryptedPaymentData, "Encrypted should be different from plain");

        // Generate hash
        String hash = hashingService.generateSHA256Hash(paymentData);
        assertNotNull(hash, "Hash should not be null");

        // Verify hash
        boolean hashValid = hashingService.verifyHash(paymentData, hash);
        assertTrue(hashValid, "Hash should verify correctly");

        // Decrypt AES key
        String decryptedAESKey = rsaKeyService.decryptWithPrivateKey(encryptedAESKey);
        assertEquals(aesKey, decryptedAESKey, "Decrypted AES key should match original");

        // Decrypt payment data
        String decryptedPaymentData = aesEncryptionService.decryptWithAES(encryptedPaymentData, decryptedAESKey);
        assertEquals(paymentData, decryptedPaymentData, "Decrypted data should match original");
    }
}

