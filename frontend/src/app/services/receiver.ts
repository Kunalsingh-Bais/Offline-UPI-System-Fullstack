import { Injectable } from '@angular/core';
import { BLETransaction } from '../model/ble-transaction';
import { Observable, Subject } from 'rxjs';
import { BleCharacteristic } from '@capacitor-community/bluetooth-le';

// Interface for start receiver request (to plugin)
interface StartReceiverRequest {
  serviceUUID: string;
  characteristicUUID: string;
  receiverUPI: string;
}

// Interface for start receiver response (from plugin)
interface StartReceiverResponse {
  success: boolean;
  message: string;
  advertisingStarted: boolean;
}

// Interface for payment received event (from Android)
interface PaymentReceivedEvent {
  transactionId: string;
  senderUPI: string;
  receiverUPI: string;
  amount: number;
  encryptedPayload: string;
  signature: string;
  nonce: string;
  timestamp: number;
}

// Interface for stop receiver response
interface StopReceiverResponse {
  success: boolean;
  message: string;
  advertisingStopped: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ReceiverService {

  private plugin: any;      // Reference to Capacitor plugin
  private isListening = false;     // Current reciever state

  // Subjects for notifying components about events
  private paymentReceivedSubject = new Subject<BLETransaction>();
  private receiverStatusSubject = new Subject<{isListening: boolean; message: string}>();
  private receiverErrorSubject = new Subject<string>();

  // Publicly accessible observables
  paymentReceived$ = this.paymentReceivedSubject.asObservable();
  receiverStatus$ = this.receiverStatusSubject.asObservable();
  receiverError$ = this.receiverErrorSubject.asObservable();

  constructor() {
    console.log('ReceiverService initialized');
    this.initializePlugin();
  }

// ------ Initialize Capacitor Plugin ------  
  private initializePlugin(): void {
    try {
      console.log('Attempting to initalize OfflineBluetoothPlugin...');
    }
    catch (error) {
      console.log('Error initalizing plugin: ', error);
    }
  }

// ------ Method 1: Start Listening for Payments ------
  startReceiving(receiverUPI: string): Observable<StartReceiverResponse> {
    console.log('Starting to listen for payments for UPI: ', receiverUPI);

    if (this.isListening) {
      console.warn('Already listening for payments');
      return new Observable(observer => {
        observer.next({
          success: false,
          message: 'Already listening for payments',
          advertisingStarted: false
        });
        observer.complete();
      });
    }

    // Create the request to send to Android plugin
    const request: StartReceiverRequest = {
      serviceUUID: '12345678-1234-1234-1234-123456789012',
      characteristicUUID: '87654321-4321-4321-4321-210987654321',
      receiverUPI: receiverUPI
    };

    return new Observable(observer => {
      try {
        // Get the plugin from Capacitor
        const {OfflineBluetoothPlugin} = window as any;

        if (!OfflineBluetoothPlugin) {
          console.error('OfflineBluetoothPlugin not found');
          observer.error('Plugin not available');
          return;
        }

        // Call the plugin's startReceiver method
        OfflineBluetoothPlugin.startReceiver(request).then((response: StartReceiverResponse) => {
          console.log('Start receiver response: ', response);

          if (response.success) {
            this.isListening = true;
            this.receiverStatusSubject.next({
              isListening: true,
              message: 'Listening for payments...'
            });

            // Start Listening for payment received events
            this.setupPaymentReceivedListener();

            observer.next(response);
          }
          else {
            console.warn('Failed to start receiver: ', response.message);
            observer.error(response.message);
          }
        },
        (error: any) => {
          console.error('Error starting receiver: ', error);
          this.receiverErrorSubject.next(error.message || 'Unknown error');
          observer.error(error);
        }
      );
      }
      catch (error) {
        console.error('Unexpected error in startReceiving: ', error);
        observer.error(error);
      }
    });
  }

// ------ Method 2: Stop Listening for Payments ------
  stopReceiving(): Observable<StopReceiverResponse> {
    console.log('Stopping receiver mode');

    if(!this.isListening) {
      console.warn('Not currently listening');
      return new Observable(observer => {
        observer.next({
          success: false,
          message: 'Not currently listening',
          advertisingStopped: false
        });
        observer.complete();
      });
    }

    return new Observable(observer => {
      try {
        const { OfflineBluetoothPlugin } = window as any;

        if (!OfflineBluetoothPlugin) {
          observer.error('Plugin not available');
          return;
        }

        OfflineBluetoothPlugin.stopReceiver().then(
          (response: StopReceiverResponse) => {
            console.log('Stop receiver response: ', response);

            if (response.success) {
              this.isListening = false;
              this.receiverStatusSubject.next({
                isListening: false,
                message: 'Stopped listening'
              });

              observer.next(response);
            }
            else {
              observer.error(response.message);
            }
          },
          (error: any) => {
            console.error('Error stopping receiver: ', error);
            observer.error(error);
          }
        );
      }
      catch (error) {
        console.error('Error stopping receiver: ', error);
        observer.error(error);
      }
    });
  }  

// ------ Method 3: Set Up Payment Received Listener ------
  private setupPaymentReceivedListener(): void {
    console.log('Setting up payment received listener');

    try {
      const { OfflineBluetoothPlugin } = window as any;

      if (!OfflineBluetoothPlugin) {
        console.error('Plugin not available for listener setup');
        return;
      }

      // Listen for payment received events from the Android layer
      OfflineBluetoothPlugin.addListener('paymentReceived', (event: PaymentReceivedEvent) => {
        console.log('Payment received event: ', event);

        // Convert event to BLETransaction
        const transaction: BLETransaction = {
          id: event.transactionId,
          senderUPI: event.senderUPI,
          receiverUPI: event.receiverUPI,
          amount: event.amount,
          timestamp: event.timestamp,
          receivedAt: Date.now(),
          status: 'SYNCED',  // Already confirmed by receiver on Android
          nonce: event.nonce,
          encryptedPayload: event.encryptedPayload,
          signature: event.signature,
          payloadVersion: 1,
          syncAttempts: 0,
          source: 'RECEIVED',
          isOffline: true
        };

        // Broadcast to subscribers
        this.paymentReceivedSubject.next(transaction);

        // Notify status
        this.receiverStatusSubject.next({
          isListening: true,
          message: `Received ₹${event.amount} from ${event.senderUPI}`
        });
      });

      // Listen for receiver errors
      OfflineBluetoothPlugin.addListener('receiverError', (event: any) => {
        console.error('Receiver error event: ', event);
        this.receiverErrorSubject.next(event.message || 'Unknown error');
      });
    }
    catch (error) {
      console.error('Error setting up payment listener: ', error);
    }
  }  

// ------ Method 4: Get received payments (from IndexedDB) ------  
  getReceivedPayments(): Observable<BLETransaction[]> {
    console.log('Fetching received payments');

    return new Observable(observer => {
      try {
        observer.next([]);
        observer.complete();
      }
      catch (error) {
        console.error('Error fetching received payments: ', error);
        observer.error(error);
      }
    });
  }

// ------ Method 5: Check if currently listening ------
  isCurrentlyListening(): boolean {
    return this.isListening;
  }  

// ------ Helper Method: Get receiver status ------
  getReceiverStatus(): { isListening: boolean} {
    return { isListening: this.isListening };
  }  

// ------ Helper Method: clear receiver cache (if needed) ------  
  clearReceiverCache(): void {
    try {
      // Stop listening if active
      if (this.isListening) {
        this.stopReceiving().subscribe({
          next: () => console.log('Receiver stopped and cache cleared'),
          error: (error) => console.error('Error clearing cache: ', error)
        });
      }
    }
    catch (error) {
      console.error('Error in clearReceiverCache: ', error);
    }
  }
}
