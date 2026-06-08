import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login';
import { RegisterComponent } from './pages/register/register';
import { HeaderComponent } from './pages/header/header';
import { DashboardComponent } from './pages/dashboard/dashboard';

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
    }

];
