// BLE Transaction Model
// Used for both SENDING and RECEIVING payments via BLE

export interface BLETransaction {
    id: string;
    senderUPI: string;
    receiverUPI: string;
    amount: number;
    timestamp: number;
    receivedAt?: number;
    syncedAt?: number;
    status: 'PENDING' | 'SYNCED' | 'SYNCING' | 'SYNCED_BACKEND' | 'FAILED' | 'REJECTED';
    nonce: string;    // Random bytes (base64) - prevents replay attacks
    encryptedPayload: string;
    signature: string;
    payloadVersion: number;
    syncAttempts: number;
    lastSyncError?: string;
    backendTransactionId?: string;
    source: 'SENT' | 'RECEIVED';
    isOffline: boolean;
    deviceInfo?: string;
}

// Plain JSON that gets encrypted before sending over BLE
export interface BLEPayloadPlain {
    senderUPI: string;
    receiverUPI: string;
    amount: number;
    timestamp: number;
    nonce: string;
}

// ACK response from receiver after getting payment
export interface BLEACKResponse {
    success: boolean;
    transactionId: string;
    message?: string;
    receivedAt: number;
}