import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

interface PracticaDetalle {
  id_practica: number;
  nombre: string;
  descripcion: string;
  id_programa: number;
  programa: string;
  id_institucion: number;
  institucion: string;
  periodo_academico: string;
  horas_requeridas: number;
  estado: string;
}

@Component({
  selector: 'app-practice-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './practice-detail.html',
  styleUrl: './practice-detail.scss',
})
export class PracticeDetail implements OnInit {
  practica = signal<PracticaDetalle | null>(null);

  loading = signal(false);
  errorMessage = signal('');

  constructor(
    private readonly api: ApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  ngOnInit() {
    this.loadPractice();
  }

  async loadPractice() {
    const id = Number(
      this.route.snapshot.paramMap.get('id')
    );

    if (!id) {
      this.errorMessage.set('Práctica no válida.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const response = await this.api.get<{
        data: PracticaDetalle;
      }>('/practices/' + id);

      this.practica.set(response.data);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible consultar la práctica.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  edit() {
    const practica = this.practica();

    if (practica) {
      this.router.navigate([
        '/practicas',
        practica.id_practica,
        'editar',
      ]);
    }
  }

  async closePractice() {
    const practica = this.practica();

    if (!practica || practica.estado !== 'ACTIVA') {
      return;
    }

    const confirmed = window.confirm(
      '¿Está seguro de que desea cerrar esta práctica?'
    );

    if (!confirmed) {
      return;
    }

    try {
      await this.api.patch(
        '/practices/' + practica.id_practica + '/status',
        {
          estado: 'CERRADA',
        }
      );

      await this.loadPractice();
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cerrar la práctica.'
      );
    }
  }

  back() {
    this.router.navigate(['/practicas']);
  }
}
