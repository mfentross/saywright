import { buildApp } from './app';

const app = await buildApp({ logger: true });
const port = Number(process.env.PORT ?? 8080);
await app.listen({ port, host: '0.0.0.0' });
