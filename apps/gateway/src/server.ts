import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { createRouter } from './router.js';
import { GATEWAY_PORT } from './config.js';
import { logger } from './log-error.js';

const app: Express = express();
const port = GATEWAY_PORT;

app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

app.use('/', createRouter());

app.listen(port, () => {
  logger.info({ port, coreApiUrl: process.env.GATEWAY_CORE_API_URL, assetProcessorUrl: process.env.GATEWAY_ASSET_PROCESSOR_URL }, 'API Gateway started');
});

export default app;