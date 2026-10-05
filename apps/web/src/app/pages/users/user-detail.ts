import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

interface UsuarioDetalle {
  id_usuario: number;
  nombres: string;
  apellidos: string;
  tipo_documento: string;
  numero_documento: string;
  correo: string;
  telefono: string | null;
  estado: string;
  rol: string;

  codigo_estudiante: string | null;
  semestre: number | null;
  id_programa: number | null;
}

interface Programa {
  id_programa: number;
  nombre: string;
}

@Component({
  selector: 'app-user-detail',
  standalone: true,
  imports: [],
  templateUrl: './user-detail.html',
  styleUrl: './user-detail.scss',
})
export class UserDetail implements OnInit {
  usuario = signal<UsuarioDetalle | null>(null);
  programaNombre = signal('');

  loading = signal(false);
  errorMessage = signal('');

  constructor(
    private readonly api: ApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  ngOnInit() {
    this.loadUser();
  }

  async loadUser() {
    const id = Number(
      this.route.snapshot.paramMap.get('id')
    );

    if (!id) {
      this.errorMessage.set('Usuario no válido.');
      return;
    }

    this.loading.set(true);

    try {
      const response = await this.api.get<{
        data: UsuarioDetalle;
      }>(`/users/${id}`);

      this.usuario.set(response.data);

      if (
        response.data.rol === 'ESTUDIANTE' &&
        response.data.id_programa
      ) {
        const programsResponse = await this.api.get<{
          data: Programa[];
        }>('/programs');

        const programa = programsResponse.data.find(
          (item) =>
            item.id_programa ===
            response.data.id_programa
        );

        this.programaNombre.set(
          programa?.nombre ?? 'Programa no encontrado'
        );
      }
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible consultar el usuario.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  edit() {
    const usuario = this.usuario();

    if (usuario) {
      this.router.navigate([
        '/usuarios',
        usuario.id_usuario,
        'editar',
      ]);
    }
  }

  back() {
    this.router.navigate(['/usuarios']);
  }
}
