import { Route } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

import { Dashboard } from './pages/dashboard/dashboard';
import { Login } from './pages/login/login';
import { ResetPassword } from
  './pages/reset-password/reset-password';

import { Users } from './pages/users/users';
import { UserForm } from './pages/users/user-form';
import { UserDetail } from './pages/users/user-detail';

import { Practices } from './pages/practices/practices';
import { PracticeForm } from './pages/practices/practice-form';
import { PracticeDetail } from './pages/practices/practice-detail';

import { Assignments } from
  './pages/assignments/assignments';

import { AssignmentForm } from
  './pages/assignments/assignment-form';

import { AssignmentDetail } from
  './pages/assignments/assignment-detail';

import { Institutions } from
  './pages/institutions/institutions';

import { InstitutionDetail } from
  './pages/institutions/institution-detail';

import { StudentActivities } from
  './pages/student-activities/student-activities';

import { StudentActivityDetail } from
  './pages/student-activities/student-activity-detail';

import { Groups } from './pages/groups/groups';
import { GroupForm } from './pages/groups/group-form';
import { GroupDetail } from './pages/groups/group-detail';

import { Activities } from
  './pages/activities/activities';

import { ActivityForm } from
  './pages/activities/activity-form';

import { ActivityDetail } from
  './pages/activities/activity-detail';

import { FollowUp } from
  './pages/follow-up/follow-up';

import { FollowUpStudent } from
  './pages/follow-up/follow-up-student';

import { TutorAssignments } from
  './pages/tutor/tutor-assignments';

import { TutorAssignmentDetail } from
  './pages/tutor/tutor-assignment-detail';

import { PracticeHours } from
  './pages/practice-hours/practice-hours';
import { PracticeHoursDetail } from
  './pages/practice-hours/practice-hours-detail';
import { StudentFollowUp } from
  './pages/student-follow-up/student-follow-up';

export const appRoutes: Route[] = [

  // ==========================================
  // AUTENTICACIÓN
  // ==========================================

  {
    path: 'login',
    component: Login,
  },

  {
    path: 'reset-password',
    component: ResetPassword,
  },

  // ==========================================
  // DASHBOARD
  // ==========================================

  {
    path: 'dashboard',
    component: Dashboard,
    canActivate: [authGuard],
  },

  // ==========================================
  // CU01 - USUARIOS
  // ==========================================

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

  // ==========================================
  // CU02 - PRÁCTICAS
  // ==========================================

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

  // ==========================================
  // ASIGNACIONES INDIVIDUALES DE PRÁCTICA
  // ==========================================

  {
    path: 'asignaciones',
    component: Assignments,
    canActivate: [authGuard],
  },

  {
    path: 'asignaciones/nueva',
    component: AssignmentForm,
    canActivate: [authGuard],
  },

  {
    path: 'asignaciones/:id',
    component: AssignmentDetail,
    canActivate: [authGuard],
  },

  // ==========================================
  // INSTITUCIONES RECEPTORAS Y TUTORES
  // ==========================================

  {
    path: 'instituciones',
    component: Institutions,
    canActivate: [authGuard],
  },

  {
    path: 'instituciones/:id',
    component: InstitutionDetail,
    canActivate: [authGuard],
  },

  // ==========================================
  // COORDINADOR - REPORTES POR PERÍODO
  // ==========================================

  {
    path: 'reportes',
    // Carga diferida: la página y la exportación PDF no
    // pesan en el bundle inicial.
    loadComponent: () =>
      import('./pages/reports/reports').then((m) => m.Reports),
    canActivate: [authGuard],
  },
  // ==========================================
  // SEGUIMIENTO - HORAS DE PRÁCTICA
  // ==========================================
  {
    path: 'horas',
    component: PracticeHours,
    canActivate: [authGuard],
  },
  {
    path: 'horas/:id',
    component: PracticeHoursDetail,
    canActivate: [authGuard],
  },
  {
    path: 'mi-seguimiento',
    component: StudentFollowUp,
    canActivate: [authGuard],
  },

  // ==========================================
  // CU03 - GRUPOS
  // ==========================================

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

  // ==========================================
  // CU04 - ACTIVIDADES
  // ==========================================

{
  path: 'actividades',
  component: Activities,
  canActivate: [authGuard],
},

{
  path: 'actividades/nueva',
  component: ActivityForm,
  canActivate: [authGuard],
},

{
  path: 'actividades/:id/editar',
  component: ActivityForm,
  canActivate: [authGuard],
},

{
  path: 'actividades/:id',
  component: ActivityDetail,
  canActivate: [authGuard],
},

  // ==========================================
  // DOCENTE - HISTORIAL DE SEGUIMIENTO
  // ==========================================

  {
    path: 'seguimiento',
    component: FollowUp,
    canActivate: [authGuard],
  },

  {
    path: 'seguimiento/:idGrupo/estudiantes/:idEstudiante',
    component: FollowUpStudent,
    canActivate: [authGuard],
  },

  // ==========================================
  // TUTOR RECEPTOR - PRACTICANTES A CARGO
  // ==========================================

  {
    path: 'practicantes',
    component: TutorAssignments,
    canActivate: [authGuard],
  },

  {
    path: 'practicantes/:id',
    component: TutorAssignmentDetail,
    canActivate: [authGuard],
  },

  // ==========================================
  // ESTUDIANTE - ACTIVIDADES Y ENTREGAS
  // ==========================================

  {
    path: 'mis-actividades',
    component: StudentActivities,
    canActivate: [authGuard],
  },

  {
    path: 'mis-actividades/:id',
    component: StudentActivityDetail,
    canActivate: [authGuard],
  },

  // ==========================================
  // RUTAS POR DEFECTO
  // ==========================================

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
