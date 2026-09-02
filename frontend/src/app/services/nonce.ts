import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class NonceService {

  // Store seen nonces to prevent replay attacks
  private usedNonces = new Set<string>();

  // Track nonce timestamps (for local cleanup)
  private nonceTimestamps = new Map<string, number>();

  // Clear old nonces every 24 hours
  private readonly NONCE_EXPIRY_MS = 24 * 60 * 60 * 1000;
  private readonly NONCE_LENGTH = 32;   // 32 character nonce
  private nonceClearInterval: any;

  constructor() {
    console.log('NonceService initialized');
    this.setupNonceCleaner();
  }

// ------ Method 1: Generate random nonce ------
  generateNonce(): string {
    console.log('Generating nonce...');

    try {
      // Create random 24 bytes
      const randomBytes = new Uint8Array(24);
      crypto.getRandomValues(randomBytes);

      // Convert to hex string
      let nonce = '';
      for (let i = 0; i < randomBytes.length; i++) {
          nonce += randomBytes[i].toString(16).padStart(2, '0');
        }

      // Ensure it's 32 characters
      nonce = nonce.substring(0, 32);

      console.log('✅ Nonce generated: ' + nonce);
      console.log('   Length: ' + nonce.length);
      console.log('   Format: Hex string');

      // Track this nonce
      this.usedNonces.add(nonce);
      this.nonceTimestamps.set(nonce, Date.now());

      return nonce;
    }
    catch (error: any) {
      console.error('Error generating nonce: ' + error.message);
      throw new Error('Failed to generate nonce: ' + error.message);
    }  
  }  
 
// ------ Method 2: Generate Nonce with prefix ------
  generateNonceWithPrefix(prefix: string): string {

    console.log('Generating nonce with prefix: ' + prefix);

    const nonce = this.generateNonce();
    const prefixedNonce = prefix + '_' + nonce.substring(0, 28);

    console.log('Prefixed nonce: ' + prefixedNonce);

    this.usedNonces.add(prefixedNonce);
    this.nonceTimestamps.set(prefixedNonce, Date.now());

    return prefixedNonce;
  }  

// ------ Method 3: Check if nonce was already seen ------
  hasSeenNonce(nonce: string): boolean {
    console.log('Checking if nonce exists: ' + nonce);

    if (!nonce) {
      console.warn('❌ Nonce is null/empty');
      return false;
    }

    const seen = this.usedNonces.has(nonce);

    if (seen) {
      const ageMs = Date.now() - (this.nonceTimestamps.get(nonce) || 0);
      console.warn('⚠️ REPLAY ATTACK DETECTED: Nonce already seen: ', nonce);
    }
    else {
      console.log('✅ Nonce is new');
    }

    return seen;
  }  

// ------ Method 4: Register nonce as seen ------
  registerNonce(nonce: string): void {
    console.log('Registering nonce as seen: ', nonce);

    if (!nonce) {
      console.warn('❌ Cannot register null/empty nonce');
      return;
    }

    this.usedNonces.add(nonce);
    this.nonceTimestamps.set(nonce, Date.now());

    console.log('Nonce registered');
  }

// ------ Method 5: Validate nonce format ------
  isValidNonce(nonce: string): boolean {

    console.log('Validating nonce format: ' + nonce);

    if (!nonce || typeof nonce !== 'string') {
      console.warn('❌ Nonce is not a string');
      return false;
    }

    // Check length (32 or with prefix like "BLE_xxxx...")
    if (nonce.length < 32) {
      console.warn('❌ Nonce too short: ' + nonce.length);
      return false;
    }

    if (nonce.length > 40) {
      console.warn('❌ Nonce too long: ' + nonce.length);
      return false;
    }
    
    // Check format (hex or prefix_hex)
    const hexPart = nonce.includes('_') 
      ? nonce.split('_')[1] 
      : nonce;

    const isHex = /^[a-f0-9]*$/.test(hexPart);

    if (!isHex) {
      console.warn('❌ Nonce contains invalid characters');
      return false;
    }

    console.log('✅ Nonce format is valid');
    return true;
  }
  
// ------ Method 4: Clear old nonces ------
  private setupNonceCleaner(): void {
    console.log('Setting up nonce cleaner (24-hour interval)');

    this.nonceClearInterval = setInterval(() => {
      console.log('Clearing nonce cache...');
      this.usedNonces.clear();
      console.log('Nonce cache cleared');
    }, this.NONCE_EXPIRY_MS);
  }  
    
// ------ Helper Method: Convert bytes to base64 ------
  private bytesToBase64(bytes: Uint8Array): string {
    let binaryString = '';

    for (let i=0; i<bytes.length; i++) {
      binaryString += String.fromCharCode(bytes[i]);
    }

    return btoa(binaryString);
  }  

// ------ Cleanup on destroy ------
  ngOnDestroy(): void {
    if (this.nonceClearInterval) {
      clearInterval(this.nonceClearInterval);
    }
  }  
}
