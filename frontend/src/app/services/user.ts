import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, Observable, tap, throwError } from 'rxjs';

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
  phone: string;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
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
  private apiUrl = 'http://localhost:8080/user';

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
      }),
      // Handle error
      catchError(error => {
        console.log('Error creating profile: ',error);
        return throwError(() => error);
      })
    );
  }




}



