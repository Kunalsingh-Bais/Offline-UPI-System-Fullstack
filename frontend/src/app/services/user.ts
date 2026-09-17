import { Injectable } from '@angular/core';
import { catchError, Observable, Subject, tap, throwError } from 'rxjs';
import { ApiService } from './api';
import { NetworkService } from './network';

// Interface for create profile request
interface CreateProfileRequest {
  authUserId: number;
  name: string;
  email: string;
  upiId: string;
  phone: string;
}

// Interface for create profile response
interface CreateProfileResponse {
  profileId: number;
  authUserId: number;
  name: string;
  email: string;
  upiId: string;
  success: boolean;
  message: string;
}

// Interface for get profile response
interface GetProfileResponse {
  profileId: number;
  authUserId: number;
  name: string;
  email: string;
  upiId: string;
  phone?: string;
  success: boolean;
  message: string;
}

// Interface for get balance response
interface GetBalanceResponse {
  profileId: number;
  balance: number;
  currency: string;
  success: boolean;
  message: string;
}

// Interface for user profile data stored locally
interface UserProfile {
  id?: number;
  profileId?: number;
  authUserId?: number;
  name?: string;
  email?: string;
  upiId?: string;
  phone?: string;
}

@Injectable({
  providedIn: 'root',
})
export class UserService {

  constructor(private api: ApiService, private network: NetworkService) {
    console.log('UserService initialized');
  }

// ------ Method 1: Create Profile ------
  CreateProfile(request: CreateProfileRequest): Observable<CreateProfileResponse> {

    console.log('Creating user profile...',request.email);

    // Make POST request to backend
    return this.network.post<CreateProfileResponse>(
      `${this.api.user}/profile/create`,
      request                             // Request body
    ).pipe(
      tap(response => {
        if(response.success) {
          console.log('Profile created successfully');
          console.log('Profile ID:', response.profileId);
        }
        else {
          console.warn('Profile creation failed: ', response.message);
        }
      }),
      // Handle error
      catchError(error => {
        console.error('Error creating profile: ',error);
        return throwError(() => error);
      })
    );
  }

// ------ Method 2: Get profile ------
  // Get user's profile information
  getProfile(authUserId: number): Observable<GetProfileResponse> {

    console.log('Getting profile for user: ', authUserId);

    // Make GET request to backend
    return this.network.get<GetProfileResponse>(
      `${this.api.user}/profile/auth/${authUserId}`  // Full URL with user Id 
    )
    .pipe(
      tap(response => {
        if (response.success) {
          console.log('Profile retrieved successfully');
          console.log('Name: ', response.name);
        }
      }),
      catchError(error => {
        console.error('Error getting profile: ', error);
        return throwError(() => error);
      })
    );
  }   

// ------ Method 3: Get Wallet Balance ------  
  // Get user's wallet balance
  getBalance(profileId: number): Observable<GetBalanceResponse> {

    console.log('Getting wallet balance for profile: ', profileId);

    // Make GET request to backend
    return this.network.get<GetBalanceResponse> (
      `${this.api.user}/wallet/balance/${profileId}` //Full URL with profile Id
    )
    .pipe(
      tap(response => {
        if(response.success) {
          console.log('Balance retrieved: ', response.balance);
        }
      }),

      catchError(error => {
        console.error('Error getting balance: ', error);
        return throwError(() => error);
      })
    );
  }

// ------ Get Profile by Upi Id ------  
  getProfileByUpiId(upiId: string): Observable<any> {
    console.log('Searching profile by UPI ID: ', upiId);
    return this.network.get<any>(`${this.api.user}/profile/upi/${upiId}`);
  }

// ------ Helper Method 1: Save Profile to Localstorage ------
  saveProfileToStorage(profile: UserProfile): void {
  
  console.log('saveProfileToStorage() called with: ', profile);

  try {
    // Save entire profile as JSON
    localStorage.setItem('userProfile', JSON.stringify(profile));
    console.log('✅ Full profile saved to localStorage');

    // Also save UPI ID separately for easy access
    // The profile object should have upiId field
    if (profile.upiId) {
      localStorage.setItem('upiId', profile.upiId);
      console.log('✅ UPI ID saved: ' + profile.upiId);
    } else if (profile.email) {
      // Fallback: use email as UPI if upiId not present
      localStorage.setItem('upiId', profile.email);
      console.log('✅ Email saved as UPI: ' + profile.email);
    }

    // Save profile ID
    if (profile.id) {
      localStorage.setItem('profileId', profile.id.toString());
      console.log('✅ Profile ID saved: ' + profile.id);
    }

  } catch (error) {
    console.error('❌ Error saving profile: ', error);
  }
}

// Save UPI ID to localStorage
  saveUpiIdToStorage(upiId: string): void {
    if (upiId) {
      localStorage.setItem('upiId', upiId);
      console.log('✅ UPI ID saved to localStorage: ' + upiId);
    }
  }  
  
// ------ Helper Method 2: Get UPI ID from Localstorage ------
  getUpiIdFromStorage(): string | null {
  
    try {
      // First try to get the separate UPI key
      let upiId = localStorage.getItem('upiId');
    
      if (upiId) {
        console.log('✅ UPI found in localStorage: ' + upiId);
        return upiId;
      }

      // Fallback: Get from full profile
      const profileJson = localStorage.getItem('userProfile');
      if (profileJson) {
        try {
          const profile = JSON.parse(profileJson);
          upiId = profile.upiId || profile.email;
        
          if (upiId) {
            console.log('✅ UPI found in profile: ' + upiId);
            return upiId;
          }
        } 
        catch (parseError) {
        console.error('Error parsing profile JSON: ', parseError);
        }
      }

      console.warn('⚠️ No UPI ID found in localStorage');
      return null;

    } catch (error) {
      console.error('❌ Error retrieving UPI: ', error);
      return null;
    }
  }  

// ------ Helper Method 3: Get user name from Localstorage ------
  getUserNameFromStorage(): string | null {
    try {
      return localStorage.getItem('userName');
    }
    catch(error) {
      console.error('Error reading userName from localStorage: ', error);
      return null;
    }
  }
  
// ------ Helper Method 4: Get profile ID from Localstorage ------
  getProfileIdFromStorage(): number | null {
    try {
      const profileId = localStorage.getItem('profileId');
      return profileId ? Number(profileId) : null;
    } catch (error) {
      console.error('Error reading profileId from localStorage: ', error);
      return null;
    }
  }

// ------ Helper Method 5: Clear all profile data ------
  clearProfileData(): void {
    try {
      localStorage.removeItem('profileId');
      localStorage.removeItem('authUserId');
      localStorage.removeItem('userName');
      localStorage.removeItem('profileUpiId');

      console.log('Profile data cleared from localStorage');
    }
    catch(error) {
      console.log('Error clearing profile data: ',error);
    }
  }  

  // Balance refresh method
  private balanceRefreshSubject = new Subject<void>();
  balanceRefresh$ = this.balanceRefreshSubject.asObservable();

  triggerBalanceRefresh(): void {
    this.balanceRefreshSubject.next();
  }
}



