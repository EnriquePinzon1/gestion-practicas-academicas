import { Route } from '@angular/router';
import { Login } from './pages/login/login';

export const appRoutes: Route[] = [
  {
    path: 'login',
    component: Login,
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
