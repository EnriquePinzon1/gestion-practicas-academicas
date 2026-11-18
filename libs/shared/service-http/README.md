# service-http

Comunicación HTTP entre el API Gateway y los microservicios.

- `resolveServiceUrl(env, porDefecto)`: URL base de un servicio desde una variable de entorno (por defecto `localhost` en desarrollo).
- `readInternalToken()` / `requireInternalToken(token)` / `createInternalFetch(token)`: secreto compartido `INTERNAL_API_TOKEN` en la cabecera `x-internal-token`. Los servicios rechazan con 401 lo que no venga del Gateway u otro servicio.
- `readAllowedOrigins()` / `createCors(origenes)`: CORS del Gateway según `CORS_ALLOWED_ORIGINS`.

Pruebas: `pnpm nx test service-http`.
