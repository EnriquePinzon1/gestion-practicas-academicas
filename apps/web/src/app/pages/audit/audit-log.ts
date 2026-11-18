import {
  Component,
  computed,
  signal,
} from '@angular/core';

import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ApiService } from
  '../../core/services/api.service';

import {
  AuditEvent,
  AuditOptions,
  AuditPage,
  ENTIDADES,
  ETIQUETAS_MODULO,
  ETIQUETAS_ROL,
  detailItems,
} from './audit.model';

const PAGE_SIZE = 25;

// Auditoría (Coordinador): eventos de negocio registrados por
// el Gateway en el Audit Service (MongoDB). Solo lectura; los
// filtros se aplican en el servidor.
@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
  ],
  templateUrl: './audit-log.html',
  styleUrls: [
    '../follow-up/follow-up.scss',
    '../tutor/tutor.scss',
    './audit-log.scss',
  ],
})
export class AuditLog {

  events = signal<AuditEvent[]>([]);
  total = signal(0);
  page = signal(1);
  options = signal<AuditOptions | null>(null);

  loading = signal(false);
  errorMessage = signal('');

  // Filtros del formulario (se aplican con "Buscar").
  search = signal('');
  module = signal('');
  type = signal('');
  role = signal('');
  from = signal('');
  to = signal('');

  readonly moduleLabels = ETIQUETAS_MODULO;
  readonly roleLabels = ETIQUETAS_ROL;
  readonly details = detailItems;

  totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / PAGE_SIZE))
  );

  // Acciones disponibles según el módulo elegido.
  types = computed(() => {
    const module = this.module();

    return (this.options()?.tipos ?? []).filter(
      (t) => !module || t.modulo === module
    );
  });

  pageStart = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * PAGE_SIZE + 1
  );

  pageEnd = computed(() =>
    Math.min(this.page() * PAGE_SIZE, this.total())
  );

  constructor(private readonly api: ApiService) {
    void this.loadOptions();
    void this.load(1);
  }

  async loadOptions() {
    try {
      const response = await this.api.get<{ data: AuditOptions }>(
        '/audit/options'
      );

      this.options.set(response.data);
    } catch {
      // Sin opciones se puede seguir consultando: solo falta
      // la lista de acciones (el error principal lo muestra load).
    }
  }

  async load(page: number) {
    if (this.from() && this.to() && this.from() > this.to()) {
      this.errorMessage.set(
        'La fecha inicial no puede ser posterior a la final.'
      );
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });

    const filters: [string, string][] = [
      ['q', this.search().trim()],
      ['modulo', this.module()],
      ['tipo', this.type()],
      ['rol', this.role()],
      ['desde', this.from()],
      ['hasta', this.to()],
    ];

    for (const [key, value] of filters) {
      if (value) {
        params.set(key, value);
      }
    }

    try {
      const response = await this.api.get<AuditPage>(
        '/audit/events?' + params.toString()
      );

      this.events.set(response.data ?? []);
      this.total.set(response.total ?? 0);
      this.page.set(response.page ?? page);
    } catch (error) {
      this.events.set([]);
      this.total.set(0);
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'No fue posible consultar el registro de auditoría.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  apply() {
    void this.load(1);
  }

  changeModule(value: string) {
    this.module.set(value);

    // La acción elegida puede no pertenecer al nuevo módulo.
    if (
      this.type() &&
      !this.types().some((t) => t.tipo === this.type())
    ) {
      this.type.set('');
    }
  }

  clearFilters() {
    this.search.set('');
    this.module.set('');
    this.type.set('');
    this.role.set('');
    this.from.set('');
    this.to.set('');
    void this.load(1);
  }

  hasFilters(): boolean {
    return Boolean(
      this.search().trim() ||
        this.module() ||
        this.type() ||
        this.role() ||
        this.from() ||
        this.to()
    );
  }

  previous() {
    if (this.page() > 1) {
      void this.load(this.page() - 1);
    }
  }

  next() {
    if (this.page() < this.totalPages()) {
      void this.load(this.page() + 1);
    }
  }

  entityLabel(event: AuditEvent): string {
    const label =
      ENTIDADES[event.entidad.tipo]?.etiqueta ?? event.entidad.tipo;

    return event.entidad.id ? `${label} #${event.entidad.id}` : label;
  }

  entityLink(event: AuditEvent): string[] | null {
    const route = ENTIDADES[event.entidad.tipo]?.ruta;

    return route && event.entidad.id
      ? [route, String(event.entidad.id)]
      : null;
  }

  roleLabel(role: string | null): string {
    return role ? (ETIQUETAS_ROL[role] ?? role) : 'Sin rol';
  }

  moduleLabel(module: string): string {
    return ETIQUETAS_MODULO[module] ?? module;
  }
}
