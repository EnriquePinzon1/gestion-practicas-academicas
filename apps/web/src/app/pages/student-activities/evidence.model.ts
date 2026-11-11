// ======================================================
// EVIDENCIAS DE ENTREGA
// Archivos adjuntos a una entrega. Las reglas reales se
// validan en el backend; aquí solo se anticipan al usuario.
// ======================================================

export interface Evidencia {
  id_evidencia: number;
  id_entrega: number;
  nombre_archivo: string;
  tipo_mime: string;
  tamano_bytes: number;
  subido_en: string;
}

export const MAX_EVIDENCIAS = 5;
export const MAX_EVIDENCIA_BYTES = 10 * 1024 * 1024;

// Extensiones aceptadas por el backend (atributo accept)
export const EVIDENCIA_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx';

export const EVIDENCIA_FORMATOS =
  'PDF, imágenes (JPG, PNG, WEBP), Word, Excel o PowerPoint';

export function formatearTamano(bytes: number): string {
  if (bytes < 1024) {
    return bytes + ' B';
  }

  if (bytes < 1024 * 1024) {
    return Math.round(bytes / 1024) + ' KB';
  }

  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
