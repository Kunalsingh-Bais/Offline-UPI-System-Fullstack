import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { UserService } from '../../services/user';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class RegisterComponent implements OnInit{

  // Properties:
  registerForm!: FormGroup;   // Register form with fields
  loading = false;            // Spinner
  submitted = false;
  errorMessage = '';
  successMessage = '';

  /* Track which step of registration:
  1 = Auth service registration
  2 = User service profile creation
  3 = complete    */
  registrationStep = 1;

  constructor(private formBuilder: FormBuilder, private authService: AuthService, private userService: UserService, private router: Router) {}

  ngOnInit(): void {
    console.log('RegisterComponent initialized');
    this.initializeForm();
  }

// ------ Method 1: Initialize Form ------
  // Registration form with all fields
  private initializeForm(): void {
    this.registerForm = this.formBuilder.group({

      name: ['',[Validators.required, Validators.minLength(2)]],
      email: ['',[Validators.required, Validators.email]],
      password: ['',[Validators.required,Validators.minLength(6)]],
      confirmPassword: ['', Validators.required],

      // Phone (required, patter for Inidian phone - 10 digits starting with 6-9)
      phone: ['',[Validators.required,Validators.pattern(/^[6-9]\d{9}$/)]],

      // Upi id (required, pattern: xxx@upi)
      UpiId: ['',[Validators.required,Validators.pattern(/^[a-zA-Z0-9._-]+@upi$/)]]
    });

    console.log('Registration form initialized');
  }  

// ------ Method 2: Validate password match ------
  // Check if password and confirmPassword are same
  get passwordsMatch(): boolean {
    const password = this.registerForm.get('password')?.value;
    const confirmPassword = this.registerForm.get('confirmPassword')?.value;
    return password === confirmPassword;
  }  

// ------ Method 3: Handle registration submission ------
  // Calls when user clicks Register button
  onregister(): void {
    // Mark as submitted
    this.submitted = true;
    console.log('Registration form submitted');

    // Validate form
    if (this.registerForm.invalid) {
      console.warn('Form validation failed');
      return;
    }

    // Check password match
    if (!this.passwordsMatch) {
      this.errorMessage = 'Passwords do not match';
      console.error('Passwords do not match');
      return;
    }

    // Set loading state
    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    // Get form values
    const { name, email, password, phone, upiId } = this.registerForm.value;

    console.log('Registration user: ', email);

    // ----- Step 1: Register in Auth Service -----
    this.registrationStep = 1;

    this.authService.register({
      email: email,
      password: password,
      name: name,
      phone: phone,
      upiId: upiId
    })
      .subscribe({
        // Auth registration success
        next: (authResponse) => {
          console.log('Auth registration successful');
          console.log('User ID: ', authResponse.userId);

          this.registrationStep = 2;
          console.log('Creating user profile....');

          // ----- Step 2: Create profile in user service -----

          // Use authResponse.userId to create profile
          this.userService.CreateProfile({
            authUserId: authResponse.userId,
            name: name,
            email: email,
            upiId: upiId,
            phone: phone
          })
            .subscribe({
              // Profile creation success
              next: (profileResponse) => {
                console.log('Profile created successfully')
                console.log('Profile ID: ', profileResponse.profileId);

                // save profile to localStorage
                this.userService.saveProfileToStorage(profileResponse);

                this.loading = false;
                this.successMessage = 'Registration successful! Redirecting to login...';
                this.registrationStep =3;

                // Redirect to login after 2 seconds
                setTimeout(() => {
                  this.router.navigate(['/login']);
                }, 2000);
              },

              // Profile creation error
              error: (error) => {
                console.error('Profile creation failed: ', error);
                this.loading = false;
                this.errorMessage = error.error?.message || 'Failed to create profile. Please try again.';
              }
            });
        },

        // Auth registration error
        error: (error) => {
          console.error('Auth registration failed: ', error);
          this.loading = false;
          this.errorMessage = error.error?.message || 'Registration failed. This email might already exist.';
        }
      });
  }
  
// ------ Method 4: Get Form controls ------
  get f() {
    return this.registerForm.controls;
  }

// ------ Method 5: Clear error ------
  clearError(): void {
    this.errorMessage = '';
  }

// ------ Method 6: Clear Success ------
  clearSuccess(): void {
    this.successMessage = '';
  }  
}
