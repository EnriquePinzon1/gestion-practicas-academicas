import { CommonModule } from '@angular/common';
import {
  Component,
  input,
  output,
} from '@angular/core';
import {
  Evidencia,
  formatearTamano,
} from './evidence.model';

// Lista de evidencias de una entrega. Solo presenta: la
// descarga y la eliminación las resuelve la página padre.
@Component({
  selector: 'app-evidence-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './evidence-list.html',
  styleUrl: './evidence-list.scss',
})
export class EvidenceList {
  evidencias = input<Evidencia[]>([]);

  // Muestra el botón Eliminar (estudiante, en plazo)
  canRemove = input(false);

  // Evidencia con una operación en curso
  busyId = input<number | null>(null);

  download = output<Evidencia>();
  remove = output<Evidencia>();

  readonly tamano = formatearTamano;
}
