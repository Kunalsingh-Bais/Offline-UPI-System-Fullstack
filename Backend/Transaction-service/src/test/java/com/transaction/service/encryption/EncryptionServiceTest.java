package com.transaction.service.encryption;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
public class EncryptionServiceTest {

    @Autowired
    private RSAKeyService rsaKeyService;

    @Autowired
    private AESEncryptionService aesEncryptionService;

    @Autowired
    private HashingService hashingService;

// ------ TEST 1: RSA Encryption/Decryption
    @Test
    public void testRSAEncryptionDecryption() throws Exception {
        String plainText = "ravi@upi|sam@upi|500";

        // Encrypt
        String encrypted = rsaKeyService.encryptWithPublicKey(plainText);
        assertNotNull(encrypted, "Encrypted text should not be null");
        assertNotEquals(plainText, encrypted, "Encrypted should differ from plain");

        // Decrypt
        String decrypted = rsaKeyService.decryptWithPrivateKey(encrypted);
        assertEquals(plainText, decrypted, "Decrypted should match original");
    }

// ------ TEST 2: RSA tampering detection ------
    @Test
    public void testRSATamperingDetection() throws Exception {
        String plainText = "ravi@upi|sam@upi|500";
        String encrypted = rsaKeyService.encryptWithPublicKey(plainText);

        // Tamper with encrypted data
        String tampered = encrypted.substring(0, encrypted.length() - 10) + "XXXXXXXXXX";

        // Try to decrypt tampered data
        assertThrows(Exception.class, () -> {
            rsaKeyService.decryptWithPrivateKey(tampered);
        },"Should throw exception for tampered data");
    }

// ------ TEST 3: AES Encryption/Decryption ------
    @Test
    public void testAESEncryptionDecryption() throws Exception {
        String plainText = "ravi@upi|sam@upi|500";

        // Generated AES key
        String aesKey = aesEncryptionService.generateAESKey();
        assertNotNull(aesKey, "AES key should be generated");

        // Encrypt
        String encrypted = aesEncryptionService.encryptWithAES(plainText, aesKey);
        assertNotNull(encrypted, "Encrypted text should not be null");
        assertNotEquals(plainText, encrypted, "Encrypted should differ from plain");

        // Decrypt
        String decrypted = aesEncryptionService.decryptWithAES(encrypted, aesKey);
        assertEquals(plainText, decrypted, "Decrypted should match original");
   }

// ------ TEST 4: SHA-256 Hashing ------
   @Test
   public void testSHA256Hashing() throws Exception {
        String data = "ravi@upi|sam@upi|500";

        // Generate hash
        String hash1 = hashingService.generateSHA256Hash(data);
        assertNotNull(hash1, "Hash should not be null");

        // Same data should produce same hash
        String hash2 = hashingService.generateSHA256Hash(data);
        assertEquals(hash1, hash2, "Same data should produce same hash");

        // Different data should produce different hash
        String differentData = "ravi@upi|sam@upi,5000";
        String differentHash = hashingService.generateSHA256Hash(differentData);
        assertNotEquals(hash1, differentHash, "Different data should produce different hash");
   }

// ------ TEST 5: Hash Verification
   @Test
   public void testHashVerification() throws Exception {
        String data = "ravi@upi|sam@upi|500";
        String hash = hashingService.generateSHA256Hash(data);

        // Verify correct hash
        boolean valid = hashingService.verifyHash(data, hash);
        assertTrue(valid, "Hash should verify correctly");

        // Verify wrong hash
        String wrongHash = hashingService.generateSHA256Hash("different data");
        boolean invalid = hashingService.verifyHash(data, wrongHash);
        assertFalse(invalid, "Wrong hash should not verify");
   }

// ------ TEST 6: Transaction hash generation ------
   @Test
   public void testTransactionHashGeneration() throws Exception {
        String hash1 = hashingService.generateTransactionHash(
                "ravi@upi", "sam@upi", "500","2026-05-06T10:30:00"
        );

        String hash2 = hashingService.generateTransactionHash(
                "ravi@upi", "sam@upi", "500","2026-05-06T10:30:00"
        );

        assertEquals(hash1, hash2, "Same inputs should produce same hash");

        // Different timestamp should produce different hash
        String hash3 = hashingService.generateTransactionHash(
                "ravi@upi", "sam@upi", "500","2026-05-06T10:31:00"
        );

        assertNotEquals(hash1, hash3, "Different timestamp should produce different hash");
   }
}
