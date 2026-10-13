import {
  Component,
  computed,
  signal,
} from '@angular/core';

import { Router } from '@angular/router';

import { ApiService } from
  '../../core/services/api.service';

interface AuthProfile {
  authenticated: boolean;
  auth_user_id: string;
  id_usuario: number;
  nombres: string;
  apellidos: string;
  correo: string;
  estado: string;
  rol: string;
}

interface Usuario {
  id_usuario: number;
  nombres: string;
  apellidos: string;
  estado: string;
  rol: string;
  correo: string;
}

interface Practica {
  id_practica: number;
  nombre: string;
  programa: string;
  institucion: string;
  periodo_academico: string;
  estado: string;
}

interface Grupo {
  id_grupo: number;
  nombre: string;
  practica: string;
  estado: string;
  total_estudiantes: number;

  semestre?: number;
  periodo_academico?: string;
}

interface Actividad {
  id_actividad: number;
  id_grupo: number;
  titulo: string;
  descripcion?: string;
  fecha_limite: string;
  hora_limite: string;
  estado: string;
  total_preguntas?: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {

  role = signal<string | null>(null);

  profileName = signal('');
  profileInitial = signal('');

  usuarios = signal<Usuario[]>([]);
  practicas = signal<Practica[]>([]);
  grupos = signal<Grupo[]>([]);
  actividades = signal<Actividad[]>([]);

  loading = signal(false);
  errorMessage = signal('');

  isCoordinator = computed(
    () => this.role() === 'COORDINADOR'
  );

  isTeacher = computed(
    () => this.role() === 'DOCENTE'
  );

  // ==========================================
  // MÉTRICAS COORDINADOR
  // ==========================================

  totalEstudiantes = computed(
    () =>
      this.usuarios().filter(
        (usuario) =>
          usuario.rol === 'ESTUDIANTE' &&
          usuario.estado === 'ACTIVO'
      ).length
  );

  totalDocentes = computed(
    () =>
      this.usuarios().filter(
        (usuario) =>
          usuario.rol === 'DOCENTE' &&
          usuario.estado === 'ACTIVO'
      ).length
  );

  practicasActivas = computed(
    () =>
      this.practicas().filter(
        (practica) =>
          practica.estado === 'ACTIVA'
      ).length
  );

  gruposActivos = computed(
    () =>
      this.grupos().filter(
        (grupo) =>
          grupo.estado === 'ACTIVO'
      ).length
  );

  practicasRecientes = computed(
    () =>
      this.practicas().slice(0, 5)
  );

  gruposRecientes = computed(
    () =>
      this.grupos().slice(0, 5)
  );

  // ==========================================
  // MÉTRICAS DOCENTE
  // ==========================================

  gruposActivosDocente = computed(
    () =>
      this.grupos().filter(
        (grupo) =>
          grupo.estado === 'ACTIVO'
      ).length
  );

  estudiantesAsignados = computed(
    () =>
      this.grupos()
        .filter(
          (grupo) =>
            grupo.estado === 'ACTIVO'
        )
        .reduce(
          (total, grupo) =>
            total +
            grupo.total_estudiantes,
          0
        )
  );

  actividadesAbiertas = computed(
    () =>
      this.actividades().filter(
        (actividad) =>
          actividad.estado === 'ABIERTA'
      ).length
  );

  actividadesCerradas = computed(
    () =>
      this.actividades().filter(
        (actividad) =>
          actividad.estado === 'CERRADA'
      ).length
  );

  actividadesRecientes = computed(
    () =>
      this.actividades().slice(0, 5)
  );

  constructor(
    private readonly api: ApiService,
    private readonly router: Router
  ) {
    this.loadDashboard();
  }

  async loadDashboard() {

    this.loading.set(true);
    this.errorMessage.set('');

    try {

      // Primero identificamos al usuario.
      const profile =
        await this.api.get<AuthProfile>(
          '/auth/me'
        );

      this.role.set(profile.rol);

      this.profileName.set(
        `${profile.nombres} ${profile.apellidos}`
      );

      this.profileInitial.set(
        profile.nombres
          .charAt(0)
          .toUpperCase()
      );

      // ======================================
      // COORDINADOR
      // ======================================

      if (
        profile.rol === 'COORDINADOR'
      ) {

        const [
          usersResponse,
          practicesResponse,
          groupsResponse,
        ] = await Promise.all([

          this.api.get<{
            data: Usuario[];
          }>('/users'),

          this.api.get<{
            data: Practica[];
          }>('/practices'),

          this.api.get<{
            data: Grupo[];
          }>('/groups'),

        ]);

        this.usuarios.set(
          usersResponse.data
        );

        this.practicas.set(
          practicesResponse.data
        );

        this.grupos.set(
          groupsResponse.data
        );

        return;
      }

      // ======================================
      // DOCENTE
      // ======================================

      if (
        profile.rol === 'DOCENTE'
      ) {

        const [
          groupsResponse,
          activitiesResponse,
        ] = await Promise.all([

          this.api.get<{
            data: Grupo[];
          }>('/teacher/groups'),

          this.api.get<{
            data: Actividad[];
          }>('/activities'),

        ]);

        this.grupos.set(
          groupsResponse.data
        );

        this.actividades.set(
          activitiesResponse.data
        );

        return;
      }

      throw new Error(
        'El rol del usuario no tiene un panel configurado.'
      );

    } catch (error) {

      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar el panel principal.'
      );

    } finally {

      this.loading.set(false);

    }
  }

  // ==========================================
  // NAVEGACIÓN COORDINADOR
  // ==========================================

  goToUsers() {
    this.router.navigate([
      '/usuarios',
    ]);
  }

  goToPractices() {
    this.router.navigate([
      '/practicas',
    ]);
  }

  goToGroups() {
    this.router.navigate([
      '/grupos',
    ]);
  }

  newUser() {
    this.router.navigate([
      '/usuarios/nuevo',
    ]);
  }

  newPractice() {
    this.router.navigate([
      '/practicas/nueva',
    ]);
  }

  newGroup() {
    this.router.navigate([
      '/grupos/nuevo',
    ]);
  }

  viewPractice(id: number) {
    this.router.navigate([
      '/practicas',
      id,
    ]);
  }

  viewGroup(id: number) {
    this.router.navigate([
      '/grupos',
      id,
    ]);
  }
}
