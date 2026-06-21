import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, Observable, Subject, tap, throwError } from 'rxjs';

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

@Injectable({
  providedIn: 'root',
})
export class UserService {
  
  // Base URL
  private apiUrl = 'http://localhost:8080/api/user';

  constructor(private http: HttpClient) {
    console.log('UserService initialized');
  }

// ------ Method 1: Create Profile ------
  CreateProfile(request: CreateProfileRequest): Observable<CreateProfileResponse> {

    console.log('Creating user profile...',request.email);

    // Make POST request to backend
    return this.http.post<CreateProfileResponse>(
      `${this.apiUrl}/profile/create`,
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
    return this.http.get<GetProfileResponse>(
      `${this.apiUrl}/profile/auth/${authUserId}`  // Full URL with user Id 
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
    return this.http.get<GetBalanceResponse> (
      `${this.apiUrl}/wallet/balance/${profileId}` //Full URL with profile Id
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
    return this.http.get<any>(`${this.apiUrl}/profile/upi/${upiId}`);
  }

// ------ Helper Method 1: Save Profile to Localstorage ------
  saveProfileToStorage(response: CreateProfileResponse): void {
    try {
      localStorage.setItem('profileId', response.profileId.toString());
      localStorage.setItem('authUserId', response.authUserId.toString());
      localStorage.setItem('userName', response.name);
      localStorage.setItem('profileUpiId', response.upiId);

      console.log('Profile saved to localStorage');
      console.log('Profile ID: ', response.profileId);
      console.log('User name: ', response.name);
      console.log('Upi ID: ', response.upiId);
    }
    catch(error) {
      console.error('Error saving to localStorage: ', error);
    }
  } 
  
// ------ Helper Method 2: Get profile ID from Localstorage ------
  getProfileIdFromStorage(): number | null {
    try {
      const profileId = localStorage.getItem('profileId');
      if (!profileId || profileId === 'undefined' || profileId === 'null') {
        return null;
      }
      return Number(profileId)
    }
    catch (error) {
      console.log('Error reading profileId from localStorage: ', error);
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

// ------ Helper Method 4: Get UPI Id from Localstorage ------
  getUpiIdFromStorage(): string | null {
    try {
      return localStorage.getItem('profileUpiId');
    }
    catch(error) {
      console.log('Error reading profileUpiId from localStorage: ', error);
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



