import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

export const authGuard: CanActivateFn = (route, state) => {

  // ------ Dependency injection ------
  const authService = inject(AuthService);
  const router = inject(Router);

  console.log('AuthGuard checking access to: ', state.url);

// ------ Check if user is logged in ------  
  const isLoggedIn = authService.isLoggedIn();
  
  console.log('User logged in: ', isLoggedIn);

// ------ Allow or Deny access ------
  if(isLoggedIn) {
    console.log('Access ALLOWED to: ',state.url);
    return true;
  }  
  else {
    // User is NOT Logged in, redirect to login
    console.log('Access DENIED to: ', state.url);
    console.log('Redirecting to /login...');

    router.navigate(['/login']);
    return false;
  }
};
