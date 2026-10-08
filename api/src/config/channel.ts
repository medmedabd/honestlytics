import { ConfirmChannel } from 'amqplib';
import { once } from 'events';

const queue = process.env.RABBITMQ_QUEUE ?? 'events';

let channel: ConfirmChannel;

const setChannel = (ch: ConfirmChannel) => {
  channel = ch;
};

const getChannel = (): ConfirmChannel => {
  if (!channel) throw new Error('RabbitMQ channel not initialized');
  return channel;
};

// Publishes persistent messages and resolves only once the broker has confirmed
// every one of them (so a 202 means the events are safely queued). Honors
// backpressure by waiting for 'drain' when the channel buffer is full.
const publishEvents = async (events: object[]): Promise<void> => {
  const ch = getChannel();
  const confirms: Promise<void>[] = [];

  for (const event of events) {
    let flushed = true;
    confirms.push(new Promise<void>((resolve, reject) => {
      flushed = ch.sendToQueue(
        queue,
        Buffer.from(JSON.stringify(event)),
        { persistent: true },
        (err) => (err ? reject(err) : resolve()),
      );
    }));
    if (!flushed) await once(ch, 'drain');
  }

  await Promise.all(confirms);
};

export { setChannel, getChannel, publishEvents };