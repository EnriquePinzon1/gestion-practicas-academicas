import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ActivatedRoute,
  Router,
} from '@angular/router';
import { ApiService } from '../../core/services/api.service';

interface Practica {
  id_practica: number;
  nombre: string;
  estado: string;
}

interface Docente {
  id_docente: number;
  nombres: string;
  apellidos: string;
}

interface Estudiante {
  id_estudiante: number;
  nombres: string;
  apellidos: string;
  codigo_estudiante: string;
  semestre: number;
  id_programa: number;
}

interface Programa {
  id_programa: number;
  nombre: string;
}

interface GrupoDetalle {
  id_grupo: number;
  nombre: string;
  id_practica: number;
  practica: string;
  semestre: number | null;
  id_docente: number;
  estado: string;
  integrantes: Estudiante[];
}

@Component({
  selector: 'app-group-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './group-form.html',
  styleUrl: './group-form.scss',
})
export class GroupForm implements OnInit {
  idGrupo: number | null = null;

  editMode = signal(false);
  loading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  practicas = signal<Practica[]>([]);
  docentes = signal<Docente[]>([]);
  estudiantes = signal<Estudiante[]>([]);
  programas = signal<Programa[]>([]);

  selectedStudents = signal<Estudiante[]>([]);
  initialStudentIds = new Set<number>();

  studentSearch = signal('');
  programFilter = signal('');
  semesterFilter = signal('');

  nombre = '';
  idPractica: number | null = null;
  semestre: number | null = null;
  idDocente: number | null = null;

  constructor(
    private readonly api: ApiService,
    private readonly router: Router,
    private readonly route: ActivatedRoute
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');

    this.loadCatalogs().then(() => {
      if (id) {
        this.idGrupo = Number(id);
        this.editMode.set(true);
        this.loadGroup();
      }
    });
  }

  activePractices = computed(() =>
    this.practicas().filter(
      (practica) => practica.estado === 'ACTIVA'
    )
  );

  availableStudents = computed(() => {
    const search =
      this.studentSearch().trim().toLowerCase();

    const program = this.programFilter();
    const semester = this.semesterFilter();

    const selectedIds = new Set(
      this.selectedStudents().map(
        (item) => item.id_estudiante
      )
    );

    return this.estudiantes().filter((student) => {
      if (selectedIds.has(student.id_estudiante)) {
        return false;
      }

      const matchesSearch =
        !search ||
        student.nombres.toLowerCase().includes(search) ||
        student.apellidos.toLowerCase().includes(search) ||
        student.codigo_estudiante.toLowerCase().includes(search);

      const matchesProgram =
        !program ||
        student.id_programa === Number(program);

      const matchesSemester =
        !semester ||
        student.semestre === Number(semester);

      return (
        matchesSearch &&
        matchesProgram &&
        matchesSemester
      );
    });
  });

  async loadCatalogs() {
    this.loading.set(true);

    try {
      const [
        practicesResponse,
        teachersResponse,
        studentsResponse,
        programsResponse,
      ] = await Promise.all([
        this.api.get<{ data: Practica[] }>('/practices'),
        this.api.get<{ data: Docente[] }>('/group-options/teachers'),
        this.api.get<{ data: Estudiante[] }>('/group-options/students'),
        this.api.get<{ data: Programa[] }>('/programs'),
      ]);

      this.practicas.set(practicesResponse.data);
      this.docentes.set(teachersResponse.data);
      this.estudiantes.set(studentsResponse.data);
      this.programas.set(programsResponse.data);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible cargar la información necesaria.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  async loadGroup() {
    if (!this.idGrupo) {
      return;
    }

    this.loading.set(true);

    try {
      const response = await this.api.get<{
        data: GrupoDetalle;
      }>('/groups/' + this.idGrupo);

      const grupo = response.data;

      this.nombre = grupo.nombre;
      this.idPractica = grupo.id_practica;
      this.semestre = grupo.semestre;
      this.idDocente = grupo.id_docente;

      this.selectedStudents.set(
        grupo.integrantes ?? []
      );

      this.initialStudentIds = new Set(
        (grupo.integrantes ?? []).map(
          (item) => item.id_estudiante
        )
      );
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

  programName(idPrograma: number) {
    return (
      this.programas().find(
        (item) => item.id_programa === idPrograma
      )?.nombre ?? 'Sin programa'
    );
  }

  addStudent(student: Estudiante) {
    this.selectedStudents.update(
      (items) => [...items, student]
    );
  }

  removeStudent(student: Estudiante) {
    this.selectedStudents.update(
      (items) =>
        items.filter(
          (item) =>
            item.id_estudiante !==
            student.id_estudiante
        )
    );
  }

  clearStudentFilters() {
    this.studentSearch.set('');
    this.programFilter.set('');
    this.semesterFilter.set('');
  }

  async save() {
    this.errorMessage.set('');
    this.successMessage.set('');

    if (
      !this.nombre.trim() ||
      !this.idPractica ||
      !this.idDocente
    ) {
      this.errorMessage.set(
        'Nombre, práctica y Docente Asesor son obligatorios.'
      );
      return;
    }

    if (
      this.semestre !== null &&
      (
        this.semestre < 1 ||
        this.semestre > 20
      )
    ) {
      this.errorMessage.set(
        'El semestre no es válido.'
      );
      return;
    }

    if (
      !this.editMode() &&
      this.selectedStudents().length === 0
    ) {
      this.errorMessage.set(
        'Seleccione al menos un estudiante.'
      );
      return;
    }

    this.loading.set(true);

    try {
      const groupBody = {
        nombre: this.nombre.trim(),
        id_practica: this.idPractica,
        semestre: this.semestre,
        id_docente: this.idDocente,
      };

      if (this.editMode() && this.idGrupo) {
        await this.api.patch(
          '/groups/' + this.idGrupo,
          groupBody
        );

        const currentIds = new Set(
          this.selectedStudents().map(
            (item) => item.id_estudiante
          )
        );

        const toAdd = [...currentIds].filter(
          (id) => !this.initialStudentIds.has(id)
        );

        const toRemove = [...this.initialStudentIds].filter(
          (id) => !currentIds.has(id)
        );

        for (const idEstudiante of toAdd) {
          await this.api.patch(
            '/groups/' + this.idGrupo + '/students',
            {
              id_estudiante: idEstudiante,
              action: 'ADD',
            }
          );
        }

        for (const idEstudiante of toRemove) {
          await this.api.patch(
            '/groups/' + this.idGrupo + '/students',
            {
              id_estudiante: idEstudiante,
              action: 'REMOVE',
            }
          );
        }

        this.successMessage.set(
          'Grupo actualizado correctamente.'
        );
      } else {
        await this.api.post('/groups', {
          ...groupBody,
          estudiantes: this.selectedStudents().map(
            (item) => item.id_estudiante
          ),
        });

        this.successMessage.set(
          'Grupo registrado correctamente.'
        );
      }

      setTimeout(() => {
        this.router.navigate(['/grupos']);
      }, 800);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible guardar el grupo.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  cancel() {
    this.router.navigate(['/grupos']);
  }
}
