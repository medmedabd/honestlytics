import express from 'express';
import dotenv from 'dotenv';
import cluster from 'cluster';
import os from 'os';
import eventRoutes from './routes/event.route';
import analyticsRoutes from './routes/analytics.route';
import createRabbitMQChannel from './config/rabbitmq';
import { setChannel } from './config/channel';
import cors from 'cors';

dotenv.config();

const startWorker = async () => {
    const app = express();
    const port = process.env.PORT || 3000;

    app.use(cors({
        origin: 'http://localhost:8081'
    }));

    app.use(express.text());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use('/event', eventRoutes);
    app.use('/analytics', analyticsRoutes);

    const channel = await createRabbitMQChannel();
    setChannel(channel);

    app.listen(port, () => {
        console.log(`Worker ${process.pid} running on port ${port}`);
    });
};

if (cluster.isPrimary) {
    const cores = Math.min(os.cpus().length, 4);
    console.log(`Primary ${process.pid} running — forking ${cores} workers`);

    for (let i = 0; i < cores; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.warn(`Worker ${worker.process.pid} died (${signal || code}) — restarting`);
        cluster.fork();
    });
} else {
    startWorker();
}