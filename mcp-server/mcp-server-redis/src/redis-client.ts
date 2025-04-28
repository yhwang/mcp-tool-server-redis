import { createClient, RedisClientType, RedisFunctions, RedisModules, RedisScripts } from 'redis';
import { z } from "zod";

// Configuration
const MAX_RETRIES = 5;
const MIN_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 30000; // 30 seconds

export async function createRedisClient(url: string = "redis://localhost:6379"): Promise<RedisClientType<RedisModules, RedisFunctions, RedisScripts>> {
    // Create Redis client with retry strategy
    const redisClient = createClient({
        url: url,
        socket: {
            reconnectStrategy: (retries) => {
                if (retries >= MAX_RETRIES) {
                    console.error(`[Redis Error] Maximum retries (${MAX_RETRIES}) reached. Giving up.`);
                    console.error(`[Redis Error] Connection: ${url}`);
                    return new Error('Max retries reached');
                }
                const delay = Math.min(Math.pow(2, retries) * MIN_RETRY_DELAY, MAX_RETRY_DELAY);
                console.error(`[Redis Retry] Attempt ${retries + 1}/${MAX_RETRIES} failed`);
                console.error(`[Redis Retry] Next attempt in ${delay}ms`);
                console.error(`[Redis Retry] Connection: ${url}`);
                return delay;
            }
        }
    });

    // Set up Redis event handlers
    redisClient.on('error', (err: Error) => {
        console.error(`[Redis Error] ${err.name}: ${err.message}`);
        console.error(`[Redis Error] Connection: ${url}`);
        console.error(`[Redis Error] Stack: ${err.stack}`);
    });

    redisClient.on('connect', () => {
        console.error(`[Redis Connected] Successfully connected to ${url}`);
    });

    redisClient.on('reconnecting', () => {
        console.error('[Redis Reconnecting] Connection lost, attempting to reconnect...');
    });

    redisClient.on('end', () => {
        console.error('[Redis Disconnected] Connection closed');
    });

    // Connect to Redis
    await redisClient.connect();
    return redisClient;
}

// Define Zod schemas for validation
export const SetArgumentsSchema = z.object({
    key: z.string(),
    value: z.string(),
    expireSeconds: z.number().optional(),
});

export const GetArgumentsSchema = z.object({
    key: z.string(),
});

export const DeleteArgumentsSchema = z.object({
    key: z.string().or(z.array(z.string())),
});

export const ListArgumentsSchema = z.object({
    pattern: z.string().default("*"),
});