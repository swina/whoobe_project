import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { createRouter } from './router.js';
import { GATEWAY_PORT } from './config.js';

const app: Express = express();
const port = GATEWAY_PORT;

app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

app.use('/', createRouter());

app.listen(port, () => {
  console.log('');
  console.log(`=== API Gateway ===`);
  console.log(`  Port: ${port}`);
  console.log(`  Core API: ${process.env.GATEWAY_CORE_API_URL || 'http://localhost:3003'}`);
  console.log(`  Asset Processor: ${process.env.GATEWAY_ASSET_PROCESSOR_URL || 'http://localhost:3002'}`);
  console.log('===================\n');
});

export default app;