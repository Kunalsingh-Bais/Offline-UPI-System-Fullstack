import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { AuthService } from './services/auth';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { HeaderComponent } from './pages/header/header';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone:true,
  imports: [CommonModule,RouterOutlet,HeaderComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {

  private authService = inject(AuthService);
  private router = inject(Router);
  isLoggedIn$ = this.authService.isLoggedIn$;
  title = 'UPI Payment System';

  showHeader = true;

  constructor() {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.showHeader = this.router.url !== '/login' && 
                          this.router.url !== '/register';
      });
  }
}
