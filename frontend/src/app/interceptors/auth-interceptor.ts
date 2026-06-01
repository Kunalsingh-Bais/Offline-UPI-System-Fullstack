import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth';
import { Router } from '@angular/router';
import { catchError, throwError, timestamp } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {

  // inject services
  const authService = inject(AuthService);    // get services in interceptor
  const router = inject(Router);

  // log request
  console.log('Http Request: ', {
    method: req.method,
    url: req.url,
    timestamp: new Date().toLocaleTimeString()
  });

  // Get JWT token
  const token = authService.getToken();

  console.log('Token status: ', token? 'Present' : 'Not present');

  // Add token to request headers
  // If token exists, add it to  Authorization header
  if (token) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log('Token added to Authorization header');
  }
  else {
    console.log('No Token available - request sent without auth');
  }

  // Send request & handle errors
  return next(req).pipe(          // Pass request to backend

    // Handle errors
    catchError((error: HttpErrorResponse) => {
      console.error('Http Error: ', {
        status: error.status,
        statusText: error.statusText,
        message: error.error?.message || 'Unknown error',
        url: error.url
      });

      // Handle 401 UNAUTHORIZED
      if(error.status === 401) {
        console.warn('Token expired or invalid');

        authService.logout();
        router.navigate(['/login']);     // redirect to login

        alert('Session expired. Please login again.');
      }

      // Handle 403 FORBIDDEN
      if(error.status === 403) {
        console.warn('Access forbidden');
        alert('You do not have permission to access this resource.');
      }

      // Handle 500 Server Error
      if(error.status === 500) {
        console.error('Server error');
        alert('Server error. Please try again later.');
      }

      return throwError(() => error);
    })
  )
};
