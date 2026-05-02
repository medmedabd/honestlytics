import express from 'express';
import dotenv from 'dotenv';
import eventRoutes from './routes/event.route';
import createRabbitMQChannel from './config/rabbitmq';
import { setChannel } from './config/channel';
import cors from 'cors';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
    origin: 'http://localhost:8081'
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/event', eventRoutes);

const start = async () => {
    const channel = await createRabbitMQChannel();
    setChannel(channel);

    app.listen(port, () => {
        console.log(`API running on port ${port}`);
    });
};

start();