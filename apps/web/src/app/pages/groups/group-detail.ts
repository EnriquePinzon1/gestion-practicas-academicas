import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

interface Docente {
  nombres: string;
  apellidos: string;
  correo: string;
}

interface Estudiante {
  id_estudiante: number;
  nombres: string;
  apellidos: string;
  codigo_estudiante: string;
  semestre: number;
}

interface GrupoDetalle {
  id_grupo: number;
  nombre: string;
  practica: string;
  semestre: number | null;
  id_docente: number;
  estado: string;
  docente: Docente | null;
  integrantes: Estudiante[];
}

@Component({
  selector: 'app-group-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './group-detail.html',
  styleUrl: './group-detail.scss',
})
export class GroupDetail implements OnInit {
  grupo = signal<GrupoDetalle | null>(null);
  loading = signal(false);
  errorMessage = signal('');

  constructor(
    private readonly api: ApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  ngOnInit() {
    this.loadGroup();
  }

  async loadGroup() {
    const id = Number(
      this.route.snapshot.paramMap.get('id')
    );

    if (!id) {
      this.errorMessage.set('Grupo no válido.');
      return;
    }

    this.loading.set(true);

    try {
      const response = await this.api.get<{
        data: GrupoDetalle;
      }>('/groups/' + id);

      this.grupo.set(response.data);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible consultar el grupo.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  edit() {
    const grupo = this.grupo();

    if (grupo) {
      this.router.navigate([
        '/grupos',
        grupo.id_grupo,
        'editar',
      ]);
    }
  }

  async closeGroup() {
    const grupo = this.grupo();

    if (!grupo || grupo.estado !== 'ACTIVO') {
      return;
    }

    const confirmed = window.confirm(
      '¿Está seguro de que desea cerrar este grupo?'
    );

    if (!confirmed) {
      return;
    }

    try {
      await this.api.patch(
        '/groups/' + grupo.id_grupo + '/status',
        {
          estado: 'CERRADO',
        }
      );

      await this.loadGroup();
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cerrar el grupo.'
      );
    }
  }

  back() {
    this.router.navigate(['/grupos']);
  }
}
