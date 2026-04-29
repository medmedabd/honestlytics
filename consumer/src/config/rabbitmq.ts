import amqp from 'amqplib';
import { Channel } from 'amqplib';

const url = process.env.RABBITMQ_URL ?? 'amqp://admin:admin@rabbitmq:5672';
const queue = process.env.RABBITMQ_QUEUE ?? 'events';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const createRabbitMQChannel = async (retries = 5, delay = 3000): Promise<Channel> => {
  for (let i = 0; i < retries; i++) {
    try {
      const connection = await amqp.connect(url);
      const channel = await connection.createChannel();
      await channel.assertQueue(queue, { durable: true });
      console.log('RabbitMQ connected, queue ready'); 
      return channel;
      
    } catch (error) {
      console.log(`RabbitMQ not ready, retrying in ${delay/1000}s... (${i + 1}/${retries})`);
      await wait(delay);
    }
  }
  console.error('RabbitMQ connection failed after all retries');
  process.exit(1);
};

export default createRabbitMQChannel;