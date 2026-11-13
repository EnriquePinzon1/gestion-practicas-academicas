type Env = Record<string, string | undefined>;

/**
 * Resuelve la URL base de un microservicio desde una variable
 * de entorno. En desarrollo local se usa el valor por defecto
 * (localhost); en producción cada servicio vive en su propia URL.
 *
 * Devuelve la URL sin "/" final para concatenar rutas que
 * empiezan por "/api".
 */
export function resolveServiceUrl(
  envName: string,
  fallback: string,
  env: Env = process.env
): string {
  const raw = env[envName]?.trim() || fallback;

  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `${envName} no es una URL válida: "${raw}"`
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      `${envName} debe usar http o https: "${raw}"`
    );
  }

  return raw.replace(/\/+$/, '');
}
