import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login';
import { RegisterComponent } from './pages/register/register';
import { HeaderComponent } from './pages/header/header';
import { DashboardComponent } from './pages/dashboard/dashboard';
import { PaymentInitiateComponent } from './pages/payment/payment-initiate/payment-initiate';
import { PaymentCompleteComponent } from './pages/payment/payment-complete/payment-complete';
import { TransactionHistoryComponent } from './pages/transaction-history/transaction-history';
import { authGuard } from './guards/auth-guard';
import { PendingTransactionsComponent } from './pages/pending-transactions/pending-transactions';

export const routes: Routes = [
  
  // ===== Public routes =====
    {
        path: 'login',
        component: LoginComponent
    },

    {
        path: 'register',
        component: RegisterComponent
    },

  // ===== Protected routes (with AuthGuard) =====

    {
        path: 'header',
        component: HeaderComponent,
        canActivate: [authGuard]
    },

    {
        path: 'dashboard',
        component: DashboardComponent,
        canActivate: [authGuard]
    },

    {
        path:'payment/initiate',
        component: PaymentInitiateComponent,
        canActivate: [authGuard]
    },

    {
        path:'payment/complete',
        component: PaymentCompleteComponent,
        canActivate: [authGuard]
    },

    {
        path:'transactions',
        component: TransactionHistoryComponent,
        canActivate: [authGuard]
    },

    {
        path: 'pending-transactions',
        component: PendingTransactionsComponent,
        canActivate: [authGuard]
    },

  // ===== Redirects ===== 
    {
        path: '',
        redirectTo: '/login',
        pathMatch: 'full'
    },

    {
        path: '**',
        redirectTo: '/login'
    }
];
