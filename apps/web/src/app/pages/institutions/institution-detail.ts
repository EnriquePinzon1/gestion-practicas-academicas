import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ActivatedRoute,
  Router,
} from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { TutorDisponible } from '../assignments/assignment.model';

interface Institucion {
  id_institucion: number;
  nombre: string;
}

interface TutorVinculado {
  id_institucion_tutor: number;
  id_institucion: number;
  id_tutor: number;
  activo: boolean;
  creado_en: string;
  nombres: string | null;
  apellidos: string | null;
  correo: string | null;
  cargo: string | null;
  tutor_activo: boolean;
}

@Component({
  selector: 'app-institution-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
  ],
  templateUrl: './institution-detail.html',
  styleUrl: './institution-detail.scss',
})
export class InstitutionDetail
  implements OnInit
{
  idInstitucion = 0;

  institucion = signal<Institucion | null>(
    null
  );

  vinculados = signal<TutorVinculado[]>([]);
  tutoresDisponibles = signal<TutorDisponible[]>([]);

  loading = signal(false);
  saving = signal(false);

  errorMessage = signal('');
  successMessage = signal('');

  idTutorSeleccionado: number | null = null;

  // Tutores activos que aún no tienen vínculo ACTIVO
  // con esta institución.
  tutoresParaVincular = computed(() => {
    const activos = new Set(
      this.vinculados()
        .filter((v) => v.activo)
        .map((v) => v.id_tutor)
    );

    return this.tutoresDisponibles().filter(
      (t) => !activos.has(t.id_tutor)
    );
  });

  constructor(
    private readonly api: ApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  ngOnInit() {
    this.idInstitucion = Number(
      this.route.snapshot.paramMap.get('id')
    );

    if (
      !Number.isInteger(this.idInstitucion) ||
      this.idInstitucion <= 0
    ) {
      this.errorMessage.set(
        'Institución receptora no válida.'
      );
      return;
    }

    this.loadData();
  }

  async loadData() {
    this.loading.set(true);

    try {
      const [
        institutionResponse,
        linkedResponse,
        tutorsResponse,
      ] = await Promise.all([
        this.api.get<{
          data: Institucion;
        }>('/institutions/' + this.idInstitucion),

        this.api.get<{
          data: TutorVinculado[];
        }>(
          '/institutions/' +
            this.idInstitucion +
            '/tutors'
        ),

        this.api.get<{
          data: TutorDisponible[];
        }>(
          '/practice-assignment-options/tutors'
        ),
      ]);

      this.institucion.set(
        institutionResponse.data
      );

      this.vinculados.set(
        linkedResponse.data
      );

      this.tutoresDisponibles.set(
        tutorsResponse.data
      );
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible consultar la institución receptora.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  nombre(v: TutorVinculado): string {
    return v.nombres
      ? `${v.nombres} ${v.apellidos ?? ''}`.trim()
      : `Tutor #${v.id_tutor}`;
  }

  async linkTutor() {
    this.errorMessage.set('');
    this.successMessage.set('');

    if (!this.idTutorSeleccionado) {
      this.errorMessage.set(
        'Seleccione el tutor receptor que desea vincular.'
      );
      return;
    }

    this.saving.set(true);

    try {
      const response =
        await this.api.post<{
          message: string;
        }>(
          '/institutions/' +
            this.idInstitucion +
            '/tutors',
          {
            id_tutor: this.idTutorSeleccionado,
          }
        );

      this.successMessage.set(
        response.message
      );

      this.idTutorSeleccionado = null;

      await this.loadData();
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible vincular el tutor receptor.'
      );
    } finally {
      this.saving.set(false);
    }
  }

  async setActive(
    vinculo: TutorVinculado,
    activo: boolean
  ) {
    const confirmed = window.confirm(
      activo
        ? '¿Desea reactivar la vinculación de ' +
            this.nombre(vinculo) +
            ' con esta institución?'
        : '¿Desea desactivar la vinculación de ' +
            this.nombre(vinculo) +
            '? Ya no podrá seleccionarse como tutor en nuevas asignaciones de esta institución; las asignaciones existentes se conservan.'
    );

    if (!confirmed) {
      return;
    }

    this.errorMessage.set('');
    this.successMessage.set('');
    this.saving.set(true);

    try {
      const response =
        await this.api.patch<{
          message: string;
        }>(
          '/institutions/' +
            this.idInstitucion +
            '/tutors/' +
            vinculo.id_tutor +
            '/status',
          { activo }
        );

      this.successMessage.set(
        response.message
      );

      await this.loadData();
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible actualizar la vinculación.'
      );
    } finally {
      this.saving.set(false);
    }
  }

  back() {
    this.router.navigate([
      '/instituciones',
    ]);
  }
}
