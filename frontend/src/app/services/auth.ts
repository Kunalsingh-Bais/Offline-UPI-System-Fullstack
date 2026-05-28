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

// ------ Method 1: Register User ------
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
  
// ------ Method 2: Login user ------  
  login(email: string, password: string): Observable<LoginResponse> {
    console.log('Logging in user: ', email);

    // Make POST request to backend
    return this.http.post<LoginResponse>( `${this.apiUrl}/login`,
      {
        email: email,
        password: password
      }
    ).pipe(
      // When response arrives, save token and update status
      tap(response => {
        console.log('Login successsful', response);

        // check if response has token (successful login)
        if (response.token) {
          // Save token to localStorage (browser's local storage)
          localStorage.setItem('authToken', response.token);
          localStorage.setItem('userId', response.userId.toString());
          localStorage.setItem('email', response.email);
          localStorage.setItem('upiId', response.upiId);

          // Update Behaviorsubject - notifies all subscribers that user is now logged in
          this.isLoggedInSubject.next(true);

          // update user info
          this.userSubject.next({
            userId: response.userId,
            email: response.email,
            upiId: response.upiId
          });
        }
      }),

      catchError(error => {
        console.error('Login failed', error);
        throw error;
      })
    );
  }

// ------ Method 3: Logout user ------
  logout(): void {
    console.log('Logging out user....');

    // Remove all user data from localStorage
    localStorage.removeItem('authToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('email');
    localStorage.removeItem('upiId');

    // Notify all subscribers that user logged out
    this.isLoggedInSubject.next(false);

    // Clear user info
    this.userSubject.next(null);

    console.log('Logout successful');
  }


}
