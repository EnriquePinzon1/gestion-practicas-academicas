import { Route } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { Dashboard } from './pages/dashboard/dashboard';
import { Login } from './pages/login/login';
import { UserForm } from './pages/users/user-form';
import { Users } from './pages/users/users';
import { UserDetail } from './pages/users/user-detail';

export const appRoutes: Route[] = [
  {
    path: 'login',
    component: Login,
  },
  {
    path: 'dashboard',
    component: Dashboard,
    canActivate: [authGuard],
  },
  {
    path: 'usuarios',
    component: Users,
    canActivate: [authGuard],
  },
  {
    path: 'usuarios/nuevo',
    component: UserForm,
    canActivate: [authGuard],
  },
  {
    path: 'usuarios/:id/editar',
    component: UserForm,
    canActivate: [authGuard],
  },
{
  path: 'usuarios/:id',
  component: UserDetail,
  canActivate: [authGuard],
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
