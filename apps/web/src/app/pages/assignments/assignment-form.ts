import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import {
  Asignacion,
  EstudianteDisponible,
  TutorDisponible,
} from './assignment.model';

interface Practica {
  id_practica: number;
  nombre: string;
  id_programa: number;
  programa: string;
  estado: string;
}

interface Institucion {
  id_institucion: number;
  nombre: string;
}

const FORMATO_PERIODO = /^\d{4}-[12]$/;

@Component({
  selector: 'app-assignment-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
  ],
  templateUrl: './assignment-form.html',
  styleUrl: './assignment-form.scss',
})
export class AssignmentForm implements OnInit {
  loading = signal(false);
  saving = signal(false);

  errorMessage = signal('');
  successMessage = signal('');

  practicas = signal<Practica[]>([]);
  estudiantes = signal<EstudianteDisponible[]>([]);
  instituciones = signal<Institucion[]>([]);
  tutores = signal<TutorDisponible[]>([]);

  // Signals para que los computed reaccionen a la selección
  idPractica = signal<number | null>(null);
  idEstudiante = signal<number | null>(null);

  idInstitucion: number | null = null;
  idTutor: number | null = null;
  periodoAcademico = this.periodoActual();

  practicasActivas = computed(() =>
    this.practicas().filter(
      (p) => p.estado === 'ACTIVA'
    )
  );

  practicaSeleccionada = computed(
    () =>
      this.practicas().find(
        (p) =>
          p.id_practica ===
          this.idPractica()
      ) ?? null
  );

  // Regla de negocio: el estudiante debe pertenecer
  // al mismo programa que la práctica.
  estudiantesDelPrograma = computed(() => {
    const practica =
      this.practicaSeleccionada();

    if (!practica) {
      return [];
    }

    return this.estudiantes().filter(
      (e) =>
        e.id_programa ===
        practica.id_programa
    );
  });

  constructor(
    private readonly api: ApiService,
    private readonly router: Router
  ) {}

  ngOnInit() {
    this.loadCatalogs();
  }

  async loadCatalogs() {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const [
        practicesResponse,
        studentsResponse,
        institutionsResponse,
        tutorsResponse,
      ] = await Promise.all([
        this.api.get<{
          data: Practica[];
        }>('/practices'),

        this.api.get<{
          data: EstudianteDisponible[];
        }>(
          '/practice-assignment-options/students'
        ),

        this.api.get<{
          data: Institucion[];
        }>('/institutions'),

        this.api.get<{
          data: TutorDisponible[];
        }>(
          '/practice-assignment-options/tutors'
        ),
      ]);

      this.practicas.set(
        practicesResponse.data
      );

      this.estudiantes.set(
        studentsResponse.data
      );

      this.instituciones.set(
        institutionsResponse.data
      );

      this.tutores.set(
        tutorsResponse.data
      );
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar la información para registrar la asignación.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  onPracticeChange(
    idPractica: number | null
  ) {
    this.idPractica.set(idPractica);

    // Si el estudiante elegido no es del programa
    // de la nueva práctica, se limpia la selección.
    const idEstudiante =
      this.idEstudiante();

    if (
      idEstudiante !== null &&
      !this.estudiantesDelPrograma().some(
        (e) =>
          e.id_estudiante === idEstudiante
      )
    ) {
      this.idEstudiante.set(null);
    }
  }

  async save() {
    this.errorMessage.set('');
    this.successMessage.set('');

    const periodo =
      this.periodoAcademico.trim();

    if (!this.idPractica()) {
      this.errorMessage.set(
        'Seleccione la práctica académica.'
      );
      return;
    }

    if (!this.idEstudiante()) {
      this.errorMessage.set(
        'Seleccione el estudiante.'
      );
      return;
    }

    if (!this.idInstitucion) {
      this.errorMessage.set(
        'Seleccione la institución receptora.'
      );
      return;
    }

    if (!FORMATO_PERIODO.test(periodo)) {
      this.errorMessage.set(
        'El periodo académico debe tener el formato AAAA-1 o AAAA-2.'
      );
      return;
    }

    this.saving.set(true);

    try {
      const response =
        await this.api.post<{
          data: Asignacion;
          message: string;
        }>('/practice-assignments', {
          id_estudiante:
            this.idEstudiante(),
          id_practica:
            this.idPractica(),
          id_institucion:
            this.idInstitucion,
          id_tutor: this.idTutor,
          periodo_academico: periodo,
        });

      this.successMessage.set(
        response.message ??
          'Asignación de práctica registrada correctamente.'
      );

      setTimeout(() => {
        this.router.navigate([
          '/asignaciones',
          response.data.id_asignacion,
        ]);
      }, 800);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible registrar la asignación de práctica.'
      );
    } finally {
      this.saving.set(false);
    }
  }

  cancel() {
    this.router.navigate([
      '/asignaciones',
    ]);
  }

  private periodoActual(): string {
    const hoy = new Date();

    return (
      hoy.getFullYear() +
      '-' +
      (hoy.getMonth() < 6 ? '1' : '2')
    );
  }
}
