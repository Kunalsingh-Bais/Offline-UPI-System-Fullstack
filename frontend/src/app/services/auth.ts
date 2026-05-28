import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, catchError, Observable, tap } from 'rxjs';

// Interface for login response
interface LoginResponse {
  token: string;
  userId: number;
  email: string;
  upiId: string;
  success: boolean;
  message: string;
}

// Interface for register request
interface RegisterRequest {
  email: string;
  password: string;
  upiId: string;
  name: string;
  phone: string;
}

// Interface for register response
interface RegisterResponse {
  userId: number;
  email: string;
  upiId: string;
  success: boolean;
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  // Base url - points to Api gateway
  private apiUrl = 'http://localhost:8080/auth';

  // Track login status
  private isLoggedInSubject = new BehaviorSubject<boolean>(this.hasToken());

  // watch if user logged in or not
  public isLoggedIn$ = this.isLoggedInSubject.asObservable();

  // Track current user info
  private userSubject = new BehaviorSubject<any>(this.getUserFromStorage());
  public user$ = this.userSubject.asObservable();

  constructor(private http: HttpClient) {
    console.log('AuthService initialized');
  }

// ------ Method 1: Register ------
  register(userData: RegisterRequest): Observable<RegisterResponse> {

    console.log('Registering user:', userData.email);

    // Make POST request to backend 
    return this.http.post<RegisterResponse>(
      `${this.apiUrl}/register`, 
      userData            // Request body
    ).pipe(
      tap(Response => {           // run when response arrives
        console.log('Registration successful', Response);
      }),

      catchError(error => {
        console.log('Registration failed', error);
        throw error;
      })
    );  

  }    
}
