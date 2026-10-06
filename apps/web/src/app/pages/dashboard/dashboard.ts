import { Component, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

interface Usuario {
  id_usuario: number;
  nombres: string;
  apellidos: string;
  estado: string;
  rol: string;
  correo: string,
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
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  usuarios = signal<Usuario[]>([]);
  practicas = signal<Practica[]>([]);
  grupos = signal<Grupo[]>([]);

  loading = signal(false);
  errorMessage = signal('');
  coordinatorName = signal('Coordinador');
  coordinatorInitial = signal('C');

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
    () => this.practicas().slice(0, 5)
  );

  gruposRecientes = computed(
    () => this.grupos().slice(0, 5)
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
    const [
      usersResponse,
      practicesResponse,
      groupsResponse,
      authResponse,
    ] = await Promise.all([
      this.api.get<{ data: Usuario[] }>('/users'),

      this.api.get<{ data: Practica[] }>('/practices'),

      this.api.get<{ data: Grupo[] }>('/groups'),

      this.api.get<{
        authenticated: boolean;
        id: string;
        email: string;
      }>('/auth/me'),
    ]);

    this.usuarios.set(usersResponse.data);
    this.practicas.set(practicesResponse.data);
    this.grupos.set(groupsResponse.data);

    const coordinator = usersResponse.data.find(
  (usuario) =>
    usuario.correo.toLowerCase() ===
    authResponse.email.toLowerCase()
);

if (coordinator) {
  const nombreCompleto =
    coordinator.nombres +
    ' ' +
    coordinator.apellidos;

  this.coordinatorName.set(nombreCompleto);

  this.coordinatorInitial.set(
    coordinator.nombres
      .charAt(0)
      .toUpperCase()
  );
}
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

  goToUsers() {
    this.router.navigate(['/usuarios']);
  }

  goToPractices() {
    this.router.navigate(['/practicas']);
  }

  goToGroups() {
    this.router.navigate(['/grupos']);
  }

  newUser() {
    this.router.navigate(['/usuarios/nuevo']);
  }

  newPractice() {
    this.router.navigate(['/practicas/nueva']);
  }

  newGroup() {
    this.router.navigate(['/grupos/nuevo']);
  }

  viewPractice(id: number) {
    this.router.navigate(['/practicas', id]);
  }

  viewGroup(id: number) {
    this.router.navigate(['/grupos', id]);
  }
}
