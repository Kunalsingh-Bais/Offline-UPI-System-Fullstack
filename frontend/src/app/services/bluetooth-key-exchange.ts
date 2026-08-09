import { Injectable } from '@angular/core';
import { timestamp } from 'rxjs';

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeyBase64: string;   //For transmission
}

export interface PeerKey {
  deviceId: string;
  deviceName: string;
  publicKey: CryptoKey;
  publicKeyBase64: string;
  receivedAt: number;
  expiresAt: number;
}

@Injectable({
  providedIn: 'root',
})
export class BluetoothKeyExchangeService {
   
  // Local device keys
  private localKeyPair: KeyPair | null = null;

  // Cache of peer public keys (deviceId -> PeerKey)
  private peerKeyCache = new Map<string, PeerKey>();

  // Key expiry time (24 hours)
  private readonly KEY_EXPIRY_MS = 24 * 60 * 60 * 1000;

  // RSA configuration
  private readonly RSA_CONFIG = {
    name: 'RSA-OAEP',
    modulesLength: 4096,
    publicExponent: new Uint8Array([1, 0, 1]),  // 65537
    hash: 'SHA-256'
  };

  constructor() {
    console.log('KeyExchangeService initialized');
  }

// ------ Method 1: Generate Local Key Pair ------  
  async generateLocalKeyPair(): Promise<KeyPair> {
    console.log('Generating local RSA-4096 key pair...');

    try {
      // Step 1: Generate key pair
      const keyPair = await crypto.subtle.generateKey(
        this.RSA_CONFIG, 
        true,   // extractable (needed to export public key)
        ['encrypt', 'decrypt']   // usage
      ) as CryptoKeyPair;

      console.log('Key pair generated');

      // Step 2: Export public key to base64
      const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
      const publicKeyJSON = JSON.stringify(publicKeyJwk);
      const publicKeyBase64 = this.stringToBase64(publicKeyJSON);

      console.log('Public key exported to base64');

      const result: KeyPair = {
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
        publicKeyBase64: publicKeyBase64
      };

      // Store for reuse
      this.localKeyPair = result;

      console.log('Local Key pair generated and stored');

      return result;
    }
    catch (error) {
      console.error('Error generating key pair: ', error);
      throw new Error('Failed to generate local key pair');
    }
  }

// ------ Method 2: Get Local Public Key ------
  getLocalPublicKey(): string {

    if (!this.localKeyPair) {
      throw new Error('Local key pair not generated. Call generateLocalKeyPair()first.');
    }

    console.log('Returning local public key');
    return this.localKeyPair.publicKeyBase64;
  }  

// ------ Method 3: Get Local Private key ------
  getLocalPrivateKey(): CryptoKey {
    if (!this.localKeyPair) {
      throw new Error('Local key pair not generated.Call generateLocalKeyPair() first.');
    }

    console.log('Returning local private key');
    return this.localKeyPair.privateKey;
  }  

// ------ Method 4: Store Peer public key ------
  async storePeerPublicKey(deviceId: string, deviceName: string, publicKeyBase64: string): Promise<void> {

    console.log(`Storing peer public key for device: ${deviceName} (${deviceId})`);

    try {
      // Step 1: Parse base64 to JWK
      const publicKeyJSON = this.base64ToString(publicKeyBase64);
      const publicKeyJwk = JSON.parse(publicKeyJSON);

      console.log('Public key parsed from base64');

      // Step 2: Import JWK to CryptoKey
      const publicKey = await crypto.subtle.importKey(
        'jwk',
        publicKeyJwk,
        this.RSA_CONFIG,
        false,   // not extractable
        ['encrypt']   // can only encrypt with peer's public key
      );

      console.log('Public key imported as CryptoKey');

      // Step 3: Store in cache
      const peerKey: PeerKey = {
        deviceId: deviceId,
        deviceName: deviceName,
        publicKey: publicKey,
        publicKeyBase64: publicKeyBase64,
        receivedAt: Date.now(),
        expiresAt: Date.now() + this.KEY_EXPIRY_MS
      };

      this.peerKeyCache.set(deviceId, peerKey);

      console.log(`Peer public key stored for ${deviceName}`);
    }
    catch (error) {
      console.error('Error storing peer key: ', error);
      throw new Error('Failed to store peer public key')
    }
  }  

// ------ Method 5: Get Peer Public key ------
  getPeerPublicKey(deviceId: string): CryptoKey | null {
    const peerKey = this.peerKeyCache.get(deviceId);

    if (!peerKey) {
      console.warn(`No cached key for device: ${deviceId}`);
      return null;
    }

    // Check if key expired
    if (peerKey.expiresAt < Date.now()) {
      console.warn(`Key expired for device: ${deviceId}`);
      this.peerKeyCache.delete(deviceId);
      return null;
    }

    console.log(`Returning peer public key for ${peerKey.deviceName}`);
    return peerKey.publicKey;
  }  

// ------ Method 6: Get Peer Public Key (Base64) ------
  getPeerPublicKeyBase64(deviceId: string): string | null {
    const peerKey = this.peerKeyCache.get(deviceId);

    if (!peerKey) {
      console.warn(`No cached key for device: ${deviceId}`);
      return null;
    }

    // Check if key expired
    if (peerKey.expiresAt < Date.now()) {
      console.warn(`Key expired for device: ${deviceId}`);
      this.peerKeyCache.delete(deviceId);
      return null;
    }

    console.log( `Returning peer public key base64 for ${peerKey.deviceName}`);
    return peerKey.publicKeyBase64;
  }  

// ------ Method 7: Check if Peer Key Cached ------
  hasPeerKey(deviceId: string): boolean {
    const peerKey = this.peerKeyCache.get(deviceId);

    if (!peerKey) {
      return false;
    }

    // Check expiry
    if (peerKey.expiresAt < Date.now()) {
      this.peerKeyCache.delete(deviceId);
      return false;
    }

    return true;
  }  

// ------ Method 8: Get Key Exchange Payload ------
  // Format data to send during handshake
  getKeyExchangePayload(): string {
    console.log('Building key exchange payload');

    if (!this.localKeyPair) {
      throw new Error('Local key pair not generated');
    }

    const payload = {
      version: 1,
      algorithm: 'RSA-OAEP',
      keySize: 4096,
      publicKey: this.localKeyPair.publicKeyBase64,
      timestamp: Date.now()
    };

    return JSON.stringify(payload);
  }  

// ------ Method 9: Parse Key Exchange Payload ------
  parseKeyExchangePayload(payloadJSON: string): {
    version: number;
    algorithm: string;
    keySize: number;
    publicKey: string;
    timestamp: number;
  } {
    console.log('Parsing key exhange payload');

    try {
      const payload = JSON.parse(payloadJSON);

      if (!payload.publicKey) {
        throw new Error('Missing publicKey in payload');
      }

      if (payload.version !== 1) {
        console.warn(`Key exchange version ${payload.version} may be not be supported`);
      }

      if (payload.algorithm !== 'RSA-OAEP') {
        throw new Error(`Unsupported algorithm: ${payload.algorithm}`);
      }

      return payload;
    }
    catch (error) {
      console.error('Error parsing key exchange payload: ', error);
      throw new Error('Failed to parse key exchange payload');
    }
  }

// ------ Method 10: Clear Cached Keys ------
  clearPeerKeyCache(): void {
    console.log('Clearing peer key cache');
    this.peerKeyCache.clear();
    console.log('Peer key cache cleared');
  }  

// ------ Method 11: Get Cache statistics ------
  getCacheStats(): {
    cachedDevices: number;
    devices: Array<{deviceId: string; deviceName: string; expiresIn: number}>;
  }  {
    const devices = Array.from(this.peerKeyCache.values()).map(peerKey => ({
      deviceId: peerKey.deviceId,
      deviceName: peerKey.deviceName,
      expiresIn: Math.max(0, peerKey.expiresAt - Date.now())
    }));

    return {
      cachedDevices: devices.length,
      devices: devices
    };
  }

// ------ Helper Method: String to Base64 ------
  private stringToBase64(str: string): string {
    return btoa(unescape(encodeURIComponent(str)));
  }  

  private base64ToString(base64: string): string {
    return decodeURIComponent(escape(atob(base64)));
  }
}


