import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

interface Programa {
  id_programa: number;
  nombre: string;
}

interface Institucion {
  id_institucion: number;
  nombre: string;
}

interface PracticaDetalle {
  id_practica: number;
  nombre: string;
  descripcion: string;
  id_programa: number;
  id_institucion: number;
  periodo_academico: string;
  horas_requeridas: number;
  estado: string;
}

@Component({
  selector: 'app-practice-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  instituciones = signal<Institucion[]>([]);

  nombre = '';
  descripcion = '';
  idPrograma: number | null = null;
  idInstitucion: number | null = null;
  periodoAcademico = '';
  horasRequeridas: number | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly router: Router,
    private readonly route: ActivatedRoute
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');

    this.loadCatalogs();

    if (id) {
      this.idPractica = Number(id);
      this.editMode.set(true);
      this.loadPractice();
    }
  }

  async loadCatalogs() {
    try {
      const [programsResponse, institutionsResponse] =
        await Promise.all([
          this.api.get<{ data: Programa[] }>('/programs'),
          this.api.get<{ data: Institucion[] }>('/institutions'),
        ]);

      this.programas.set(programsResponse.data);
      this.instituciones.set(institutionsResponse.data);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar los datos del formulario.'
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
      const response = await this.api.get<{
        data: PracticaDetalle;
      }>('/practices/' + this.idPractica);

      const practica = response.data;

      this.nombre = practica.nombre;
      this.descripcion = practica.descripcion;
      this.idPrograma = practica.id_programa;
      this.idInstitucion = practica.id_institucion;
      this.periodoAcademico = practica.periodo_academico;
      this.horasRequeridas = practica.horas_requeridas;
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
      !this.idInstitucion ||
      !this.periodoAcademico.trim() ||
      !this.horasRequeridas
    ) {
      this.errorMessage.set(
        'Complete todos los campos obligatorios.'
      );
      return;
    }

    if (this.horasRequeridas <= 0) {
      this.errorMessage.set(
        'Las horas requeridas deben ser mayores que cero.'
      );
      return;
    }

    const body = {
      nombre: this.nombre.trim(),
      descripcion: this.descripcion.trim(),
      id_programa: this.idPrograma,
      id_institucion: this.idInstitucion,
      periodo_academico: this.periodoAcademico.trim(),
      horas_requeridas: this.horasRequeridas,
    };

    this.loading.set(true);

    try {
      if (this.editMode() && this.idPractica) {
        await this.api.patch(
          '/practices/' + this.idPractica,
          body
        );

        this.successMessage.set(
          'Práctica actualizada correctamente.'
        );
      } else {
        await this.api.post('/practices', body);

        this.successMessage.set(
          'Práctica registrada correctamente.'
        );
      }

      setTimeout(() => {
        this.router.navigate(['/practicas']);
      }, 800);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible guardar la práctica.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  cancel() {
    this.router.navigate(['/practicas']);
  }
}
