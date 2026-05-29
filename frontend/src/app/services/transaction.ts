import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, Observable, take, tap, throwError } from 'rxjs';

// Interface for initiate transaction request
interface InitiateTransactionRequest {
  senderUpiId: string;
  senderProfileId: number;
  receiverUpiId: string;
  receiverProfileId: number;
  amount: number;
  description?: string;
}

// Interface for initiate transaction response
interface InitiateTransactionResponse {
  transactionId: string;
  senderUpiId: string;
  receiverUpiId: string;
  amount: number;
  status: string;
  expiresAt: string;
  publicKey: string;
  success: boolean;
  message: string;
}

// Interface for complete transaction request
interface CompleteTransactionRequest {
  transactionId: string;
  encryptedData: string;
  signature?: string; 
}

// Interface for complete transaction response
interface CompleteTransactionResponse {
  transactionId: string;
  status: string;
  senderNewBalance?: number;
  receiverNewBalance?: number;
  message: string;
  success: boolean;
}

// Interface for public key response
interface PublicKeyResponse {
  publicKey: string;
  algorithm: string;
  keySize: number;
  success: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class TransactionService {

  // Base url - points to transaction service via API Gateway
  private apiUrl = 'http://localhost:8080/transaction';

  constructor(private http: HttpClient) {
    console.log('TransactionService initialized');
  }

// ------ Method 1: Initiate Transaction ------  
  initiateTransaction(request: InitiateTransactionRequest):  Observable<InitiateTransactionResponse> {

    console.log("Initiating transaction...", request);

    // Make POST request to backend
    return this.http.post<InitiateTransactionResponse>(
      `${this.apiUrl}/initiate`, 
      request                  // request body
    ).pipe(
        // when response arrives, log it
        tap(response => {
          if(response.success) {
            console.log('Transaction initiated successfully');
            console.log('Transaction Id:', response.transactionId);
            console.log('Expires at:', response.expiresAt);
          }
          else {
            console.warn('Transaction initiation failed: ',response.message);
          }
        }),

        // Handle errors
        catchError(error => {
          console.error('Error initiating transaction: ', error);
          return throwError(() => error);
        })
      );
  }
}
