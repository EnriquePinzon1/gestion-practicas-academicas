import express from 'express';
import * as path from 'path';

const app = express();

app.use(express.json());
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Health del API Gateway
app.get('/api', (_req, res) => {
  res.json({
    message: 'API Gateway - Gestión de Prácticas Académicas',
  });
});

// Comunicación Gateway -> User Service
app.get('/api/users/health', async (_req, res) => {
  try {
    const response = await fetch('http://localhost:3334/api');

    if (!response.ok) {
      return res.status(502).json({
        gateway: 'ok',
        service: 'user-service',
        status: 'error',
        message: 'El User Service respondió con error',
      });
    }

    const data = await response.json();

    return res.json({
      gateway: 'ok',
      service: 'user-service',
      status: 'ok',
      response: data,
    });
  } catch (error) {
    console.error('Error connecting to user-service:', error);

    return res.status(503).json({
      gateway: 'ok',
      service: 'user-service',
      status: 'unavailable',
      message: 'No fue posible comunicarse con User Service',
    });
  }
});

// Comunicación Gateway -> Practice Service
app.get('/api/practices/health', async (_req, res) => {
  try {
    const response = await fetch('http://localhost:3335/api');

    if (!response.ok) {
      return res.status(502).json({
        gateway: 'ok',
        service: 'practice-service',
        status: 'error',
        message: 'El Practice Service respondió con error',
      });
    }

    const data = await response.json();

    return res.json({
      gateway: 'ok',
      service: 'practice-service',
      status: 'ok',
      response: data,
    });
  } catch (error) {
    console.error('Error connecting to practice-service:', error);

    return res.status(503).json({
      gateway: 'ok',
      service: 'practice-service',
      status: 'unavailable',
      message: 'No fue posible comunicarse con Practice Service',
    });
  }
});

app.get('/api/activities/health', async (_req, res) => {
  try {
    const response = await fetch('http://localhost:3336/api');

    if (!response.ok) {
      return res.status(502).json({
        gateway: 'ok',
        service: 'activity-service',
        status: 'error',
        message: 'El Activity Service respondió con error',
      });
    }

    const data = await response.json();

    return res.json({
      gateway: 'ok',
      service: 'activity-service',
      status: 'ok',
      response: data,
    });
  } catch (error) {
    console.error('Error connecting to activity-service:', error);

    return res.status(503).json({
      gateway: 'ok',
      service: 'activity-service',
      status: 'unavailable',
      message: 'No fue posible comunicarse con Activity Service',
    });
  }
});

const port = process.env.PORT || 3333;

const server = app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}/api`);
});

server.on('error', console.error);
