import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { Router } from '@angular/router';

interface Usuario {
  id_usuario: number;
  nombres: string;
  apellidos: string;
  tipo_documento: string;
  numero_documento: string;
  correo: string;
  telefono: string | null;
  estado: string;
  rol: string;
}

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './users.html',
  styleUrl: './users.scss',
})
export class Users {
  usuarios = signal<Usuario[]>([]);
  loading = signal(false);
  errorMessage = signal('');

  search = signal('');
  roleFilter = signal('');
  statusFilter = signal('');

  constructor(
  private readonly api: ApiService,
  private readonly router: Router
) {
  this.loadUsers();
}

  filteredUsers = computed(() => {
    const search = this.search().trim().toLowerCase();
    const role = this.roleFilter();
    const status = this.statusFilter();

    return this.usuarios().filter((usuario) => {
      const matchesSearch =
        !search ||
        usuario.nombres.toLowerCase().includes(search) ||
        usuario.apellidos.toLowerCase().includes(search) ||
        usuario.correo.toLowerCase().includes(search) ||
        usuario.numero_documento.toLowerCase().includes(search);

      const matchesRole = !role || usuario.rol === role;
      const matchesStatus = !status || usuario.estado === status;

      return matchesSearch && matchesRole && matchesStatus;
    });
  });

  async loadUsers() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const response = await this.api.get<{ data: Usuario[] }>('/users');
      this.usuarios.set(response.data);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible consultar los usuarios'
      );
    } finally {
      this.loading.set(false);
    }
  }

  clearFilters() {
    this.search.set('');
    this.roleFilter.set('');
    this.statusFilter.set('');
  }

  newUser() {
  this.router.navigate(['/usuarios/nuevo']);
}

  editUser(usuario: Usuario) {
    console.log('Editar usuario:', usuario);
  }

  async toggleStatus(usuario: Usuario) {
  const nuevoEstado =
    usuario.estado === 'ACTIVO'
      ? 'INACTIVO'
      : 'ACTIVO';

  const accion =
    nuevoEstado === 'INACTIVO'
      ? 'desactivar'
      : 'activar';

  const confirmado = window.confirm(
    `¿Está seguro de que desea ${accion} a ${usuario.nombres} ${usuario.apellidos}?`
  );

  if (!confirmado) {
    return;
  }

  this.errorMessage.set('');

  try {
    await this.api.patch(
      `/users/${usuario.id_usuario}/status`,
      {
        estado: nuevoEstado,
      }
    );

    await this.loadUsers();
  } catch (error) {
    this.errorMessage.set(
      error instanceof Error
        ? error.message
        : 'No fue posible cambiar el estado del usuario.'
    );
  }
}
}
