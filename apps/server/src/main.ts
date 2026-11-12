import { buildApp } from './app';
import { fakeModels } from './fakeModels';

const fake = process.env.SAYWRIGHT_FAKE_AI === '1';
if (fake && process.env.NODE_ENV === 'production') throw new Error('SAYWRIGHT_FAKE_AI must not be used in production');

const app = await buildApp({ fastify: { logger: true }, models: fake ? fakeModels() : undefined });
if (fake) app.log.warn('Using scripted fake AI models (SAYWRIGHT_FAKE_AI=1)');
const port = Number(process.env.PORT ?? 8080);
await app.listen({ port, host: '0.0.0.0' });
