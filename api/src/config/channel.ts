import { Channel } from 'amqplib';

let channel: Channel;

const setChannel = (ch: Channel) => {
  channel = ch;
};

const getChannel = (): Channel => {
  if (!channel) throw new Error('RabbitMQ channel not initialized');
  return channel;
};

export { setChannel, getChannel };