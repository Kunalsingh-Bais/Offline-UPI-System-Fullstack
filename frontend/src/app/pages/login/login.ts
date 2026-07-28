import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { UserService } from '../../services/user';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent implements OnInit{

  // Properties:
  loginForm!: FormGroup;         // Collection of form controls
  loading = false;               // loading spinner while login in progress
  submitted = false;             
  errorMessage = '';
  successMessage = '';

  constructor(private formBuilder: FormBuilder, private authService: AuthService, private userService: UserService ,private router: Router) {}

  ngOnInit(): void {
    console.log('LoginComponent initialized');
    this.initializeForm();
  }

// ------ Method 1: Initialize Form -----
  private initializeForm(): void {
    // create a form
    this.loginForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]], 
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    console.log('Form initialized with validators');
  }  
  
// ------ Method 2: Handle login submission ------
  OnLogin(): void {          // Called when user click login button
    // Mark as submitted
    this.submitted = true;
    console.log('Login form submitted');

    // Validate form
    if (this.loginForm.invalid) {
      console.warn('Form validation failed');
      return;
    }

    // show loading spinner
    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    // Get form values
    const {email, password} = this.loginForm.value;

    console.log('Attempting login for: ', email);

    // Call auth service
    this.authService.login(email,password).subscribe({
      next: (response) => {
        console.log('Login successful');
        console.log('User ID: ' ,response.userId);
        console.log('Email: ', response.email);
        console.log('Upi Id: ', response.upiId);

        this.successMessage = 'Login successful! Loading profile...';
        console.log("STEP 1 : Login API Success");

        console.log("STEP 2 : Loading Profile...");
        this.userService.getProfile(response.userId).subscribe({
          next: (profile) => {
            console.log('Profile loaded after login: ', profile);
            console.log("STEP 3 : Profile Loaded");

            localStorage.setItem('profileId', profile.profileId.toString());
            localStorage.setItem('name', profile.name);
            localStorage.setItem('upiId', profile.upiId);

            this.loading = false;
            this.successMessage = 'Login successful! Redirecting...';

            console.log("STEP 4 : Navigating Dashboard");
            setTimeout(() => {
              this.router.navigate(['/dashboard']).then(result => {
                console.log("STEP 5 :", result);
              });
            }, 1000);
          },

          error: (error) => {
            console.log('Profile loading failed:', error);
            console.log("Status:", error.status);
            console.log("URL:", error.url);
            console.log("Message:", error.message);
            
            this.loading = false;
            this.errorMessage = 'Failed to load profile';
          }
        });  
      },
      
      // Error path
      error: (error) => {
        console.log('Login failed: ', error);
        this.loading = false;
        this.errorMessage = error.error?.message || 'Login failed. Please check your credentials and try again.';

        console.warn('Error message: ', this.errorMessage);
      }
    });
  }

// ------ Method 3: Get Form controls ------  
  get f() {
    return this.loginForm.controls;
  }

// ------ Method 4: Clear Error Message ------
  // Calls when user clicks close button on error alert
  clearError(): void {
    this.errorMessage = '';
  }  

// ------ Method 5: Clear Success Message ------
  // Calls when user clicks close button on success alert
  clearSuccess(): void {
    this.successMessage = '';
  } 
}
