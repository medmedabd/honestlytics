import { Channel, Message } from 'amqplib';

export const safeAck = (channel: Channel, msg: Message) => {
    try {
        channel.ack(msg);
    } catch (err) {
        console.error('ACK failed:', err);
    }
};

export const safeNack = (channel: Channel, msg: Message) => {
    try {
        channel.nack(msg, false, true);
    } catch (err) {
        console.error('NACK failed:', err);
    }
};