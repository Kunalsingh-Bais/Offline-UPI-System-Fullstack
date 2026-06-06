import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth';
import { UserService } from '../../services/user';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class HeaderComponent implements OnInit{

  // Properties
  userName: string | null = null;
  userUpiId: string | null = null;
  walletBalance: number | null = null;
  mobileMenuOpen = false;           // Mobile menu toggle
  loadingBalance = false;

  constructor(private authService: AuthService, private userService: UserService, private router: Router) {}

  ngOnInit(): void {
    console.log('HeaderComponent initialized');
    this.loadUserInfo();
    this.loadWalletBalance();
  }

// ------ Method 1: Load User Info ------
  // Load user's name and UPI id from localStorage
  private loadUserInfo(): void {
    console.log('Loading user info...');

    // Get from UserService helper methods
    this.userName = this.userService.getUserNameFromStorage();
    this.userUpiId = this.userService.getUpiIdFromStorage();

    console.log('User info loaded');
    console.log('Name: ', this.userName);
    console.log('UPI Id: ', this.userUpiId);
  }  

// ------ Method 2: Load Wallet Balance ------
  private loadWalletBalance() {
    console.log('Loading Wallet balance...');

    // Get profile from storage
    const profileId = this.userService.getProfileIdFromStorage();

    // If no profileId, can't load balance
    if(!profileId) {
      console.warn('No profileId found');
      return;
    }

    this.loadingBalance = true;

    // Call Api to get balance
      this.userService.getBalance(profileId).subscribe({
      // Success
      next: (response) => {
        if(response.success) {
          this.walletBalance = response.balance;
          console.log('Balance loaded: ₹' + this.walletBalance);
        }
        this.loadingBalance = false
      },

      error: (error) => {
        console.log('Error loading balance: ', error);
        this.loadingBalance = false;
      }
    });
  }  

// ------ Method 3: Toggle mobile menu ------
  // Toggle mobile menu open/closed
  toggleMobileMenu(): void {                    // Hamburger menu icon call this
    this.mobileMenuOpen = !this.mobileMenuOpen;
    console.log('Mobile menu toggled: ', this.mobileMenuOpen);
  }

// ------ Method 4: Close mobile menu ------  
  // Called when user clicks a link , menu automatically closes after navigation
  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

// ------ Method 5: Navigate to page ------  
  navigateTo(path: string): void {
    this.closeMobileMenu();
    this.router.navigate([path]);
  }

// ------ Method 6: Handle logout user ------
  onLogout(): void {
    console.log('Logging out...');

    // Close menu first
    this.closeMobileMenu();
 
    // Logout from auth service
    this.authService.logout();

    // Clear profile data from user service
    this.userService.clearProfileData();

    alert('Logged out successfully');

    // Redirect to login
    this.router.navigate(['/login']);
  }

// ------ Method 7: Refresh balance ------
  refreshBalance(): void {
    console.log('Refreshing balance...');
    this.loadWalletBalance();
  }  

// ------ Method 8: Format currency ------
  // Format number as currency (₹X.XX)  
  formatCurrency(amount: number | null): string {
    if(amount === null || amount === undefined) {
      return '₹0.00';
    }

    return '₹' + amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
}
