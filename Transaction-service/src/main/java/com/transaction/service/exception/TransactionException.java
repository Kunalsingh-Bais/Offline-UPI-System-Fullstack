package com.transaction.service.exception;

public class TransactionException extends RuntimeException{

    private String transactionId;
    private String errorCode;

    public TransactionException(String message) {
        super(message);
    }

    public TransactionException(String message, Throwable cause) {
        super(message, cause);
    }

    public TransactionException(String message, String transactionId, String errorCode) {
        super(message);
        this.transactionId = transactionId;
        this.errorCode = errorCode;
    }

    public String getTransactionId() {
        return transactionId;
    }

    public String getErrorCode() {
        return errorCode;
    }
}
