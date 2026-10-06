import { Route } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

import { Dashboard } from './pages/dashboard/dashboard';
import { Login } from './pages/login/login';

import { Users } from './pages/users/users';
import { UserForm } from './pages/users/user-form';
import { UserDetail } from './pages/users/user-detail';

import { Practices } from './pages/practices/practices';
import { PracticeForm } from './pages/practices/practice-form';
import { PracticeDetail } from './pages/practices/practice-detail';

import { Groups } from './pages/groups/groups';
import { GroupForm } from './pages/groups/group-form';
import { GroupDetail } from './pages/groups/group-detail';

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
    path: 'practicas',
    component: Practices,
    canActivate: [authGuard],
  },
  {
    path: 'practicas/nueva',
    component: PracticeForm,
    canActivate: [authGuard],
  },
  {
    path: 'practicas/:id/editar',
    component: PracticeForm,
    canActivate: [authGuard],
  },
  {
    path: 'practicas/:id',
    component: PracticeDetail,
    canActivate: [authGuard],
  },
  {
  path: 'grupos',
  component: Groups,
  canActivate: [authGuard],
  },
  {
  path: 'grupos/nuevo',
  component: GroupForm,
  canActivate: [authGuard],
  },
  {
  path: 'grupos/:id/editar',
  component: GroupForm,
  canActivate: [authGuard],
  },
  {
  path: 'grupos/:id',
  component: GroupDetail,
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
