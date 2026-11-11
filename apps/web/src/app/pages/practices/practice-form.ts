import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ActivatedRoute,
  Router,
} from '@angular/router';
import { ApiService } from '../../core/services/api.service';

interface Programa {
  id_programa: number;
  nombre: string;
}

interface PracticaDetalle {
  id_practica: number;
  nombre: string;
  descripcion: string;
  id_programa: number;
  horas_requeridas: number;
  estado: string;
}

@Component({
  selector: 'app-practice-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
  ],
  templateUrl: './practice-form.html',
  styleUrl: './practice-form.scss',
})
export class PracticeForm implements OnInit {
  idPractica: number | null = null;

  editMode = signal(false);
  loading = signal(false);

  errorMessage = signal('');
  successMessage = signal('');

  programas = signal<Programa[]>([]);

  nombre = '';
  descripcion = '';
  idPrograma: number | null = null;
  horasRequeridas: number | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly router: Router,
    private readonly route: ActivatedRoute
  ) {}

  ngOnInit() {
    const id =
      this.route.snapshot.paramMap.get('id');

    this.loadCatalogs();

    if (id) {
      this.idPractica = Number(id);
      this.editMode.set(true);
      this.loadPractice();
    }
  }

  async loadCatalogs() {
    try {
      const response =
        await this.api.get<{
          data: Programa[];
        }>('/programs');

      this.programas.set(
        response.data
      );
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar los programas académicos.'
      );
    }
  }

  async loadPractice() {
    if (!this.idPractica) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const response =
        await this.api.get<{
          data: PracticaDetalle;
        }>(
          '/practices/' +
            this.idPractica
        );

      const practica =
        response.data;

      this.nombre =
        practica.nombre;

      this.descripcion =
        practica.descripcion;

      this.idPrograma =
        practica.id_programa;

      this.horasRequeridas =
        practica.horas_requeridas;
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

  async save() {
    this.errorMessage.set('');
    this.successMessage.set('');

    if (
      !this.nombre.trim() ||
      !this.descripcion.trim() ||
      !this.idPrograma ||
      !this.horasRequeridas
    ) {
      this.errorMessage.set(
        'Nombre, descripción, programa y horas requeridas son obligatorios.'
      );
      return;
    }

    if (
      this.horasRequeridas <= 0
    ) {
      this.errorMessage.set(
        'Las horas requeridas deben ser mayores que cero.'
      );
      return;
    }

    const body = {
      nombre:
        this.nombre.trim(),

      descripcion:
        this.descripcion.trim(),

      id_programa:
        this.idPrograma,

      horas_requeridas:
        this.horasRequeridas,
    };

    this.loading.set(true);

    try {
      if (
        this.editMode() &&
        this.idPractica
      ) {
        await this.api.patch(
          '/practices/' +
            this.idPractica,
          body
        );

        this.successMessage.set(
          'Práctica académica actualizada correctamente.'
        );
      } else {
        await this.api.post(
          '/practices',
          body
        );

        this.successMessage.set(
          'Práctica académica registrada correctamente.'
        );
      }

      setTimeout(() => {
        this.router.navigate([
          '/practicas',
        ]);
      }, 800);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible guardar la práctica académica.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  cancel() {
    this.router.navigate([
      '/practicas',
    ]);
  }
}
