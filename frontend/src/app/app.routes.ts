import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login';
import { RegisterComponent } from './pages/register/register';
import { HeaderComponent } from './pages/header/header';
import { DashboardComponent } from './pages/dashboard/dashboard';
import { PaymentInitiateComponent } from './pages/payment/payment-initiate/payment-initiate';
import { PaymentCompleteComponent } from './pages/payment/payment-complete/payment-complete';

export const routes: Routes = [
    {
        path: 'login',
        component: LoginComponent
    },

    {
        path: 'register',
        component: RegisterComponent
    },

    {
        path: 'header',
        component: HeaderComponent
    },

    {
        path: 'dashboard',
        component: DashboardComponent
    },

    {
        path:'payment/initiate',
        component: PaymentInitiateComponent
    },

    {
        path:'payment/complete',
        component: PaymentCompleteComponent
    }

];
