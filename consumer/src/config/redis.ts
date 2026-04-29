import Redis, { RedisOptions } from 'ioredis';

const redisConfig: RedisOptions = {
  host: process.env.REDIS_HOST || 'redis',
  port: Number(process.env.REDIS_PORT) || 6379,

  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
};


const redis = new Redis(redisConfig);

redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err) => console.error('Redis Error', err));

export default redis;