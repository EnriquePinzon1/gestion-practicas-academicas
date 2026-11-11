// ======================================================
// DETECCIÓN DEL TIPO DE ARCHIVO DE UNA EVIDENCIA
//
// El tipo se decide por la firma del contenido (bytes
// iniciales) y debe coincidir con la extensión del nombre.
// Nunca se confía en el Content-Type enviado por el cliente.
// ======================================================

export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_FORMATS_LABEL =
  'PDF, JPG, PNG, WEBP, Word, Excel o PowerPoint';

type Signature =
  | 'pdf'
  | 'png'
  | 'jpeg'
  | 'webp'
  | 'zip'
  | 'ole';

const EXTENSIONS: Record<
  string,
  { signature: Signature; mime: string }
> = {
  pdf: { signature: 'pdf', mime: 'application/pdf' },
  png: { signature: 'png', mime: 'image/png' },
  jpg: { signature: 'jpeg', mime: 'image/jpeg' },
  jpeg: { signature: 'jpeg', mime: 'image/jpeg' },
  webp: { signature: 'webp', mime: 'image/webp' },
  docx: {
    signature: 'zip',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  xlsx: {
    signature: 'zip',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  pptx: {
    signature: 'zip',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  doc: { signature: 'ole', mime: 'application/msword' },
  xls: { signature: 'ole', mime: 'application/vnd.ms-excel' },
  ppt: { signature: 'ole', mime: 'application/vnd.ms-powerpoint' },
};

function startsWith(
  buffer: Buffer,
  bytes: number[],
  offset = 0
): boolean {
  return bytes.every(
    (byte, i) => buffer[offset + i] === byte
  );
}

function detectSignature(
  buffer: Buffer
): Signature | null {
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46])) {
    return 'pdf'; // %PDF
  }

  if (
    startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return 'png';
  }

  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return 'jpeg';
  }

  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && // RIFF
    startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8) // WEBP
  ) {
    return 'webp';
  }

  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    return 'zip'; // docx / xlsx / pptx
  }

  if (
    startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  ) {
    return 'ole'; // doc / xls / ppt
  }

  return null;
}

export interface DetectedFile {
  extension: string;
  mime: string;
}

// Devuelve null si la extensión no está permitida o si el
// contenido no corresponde a la extensión.
export function detectEvidenceType(
  fileName: string,
  buffer: Buffer
): DetectedFile | null {
  const extension = fileName
    .split('.')
    .pop()
    ?.toLowerCase() ?? '';

  const expected = EXTENSIONS[extension];

  if (!expected) {
    return null;
  }

  if (detectSignature(buffer) !== expected.signature) {
    return null;
  }

  return {
    extension,
    mime: expected.mime,
  };
}

// Nombre visible seguro: sin rutas, sin caracteres de
// control y con longitud acotada a la columna (255).
export function sanitizeFileName(
  raw: string
): string {
  const base = raw
    .split(/[\\/]/)
    .pop() ?? '';

  return base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(-255);
}
