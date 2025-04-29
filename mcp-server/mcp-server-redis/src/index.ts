#!/usr/bin/env node

import express from "express";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
    createRedisClient,
    SetArgumentsSchema,
    GetArgumentsSchema,
    DeleteArgumentsSchema,
    ListArgumentsSchema
} from './redis-client.js';
import { z } from "zod";
import { RedisClientType, RedisModules, RedisFunctions, RedisScripts } from "redis";

// Get Redis URI
const REDIS_URL = process.argv[2] || "redis://localhost:6379";

// Create Redis client with retry strategy
const redisClient = await createRedisClient(REDIS_URL);
console.log('redis client is created');

// Create a MCP server with tools primitives serving 4 functions, including set, get, delete and list.
function createServer(redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>): Server {
    // Create server instance
    const server = new Server(
        {
            name: "redis",
            version: "0.0.1"
        },
        {
            capabilities: {
                tools: {}
            }
        }
    );

    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: "set",
                    description: "Set a Redis key-value pair with optional expiration",
                    inputSchema: {
                        type: "object",
                        properties: {
                            key: {
                                type: "string",
                                description: "Redis key",
                            },
                            value: {
                                type: "string",
                                description: "Value to store",
                            },
                            expireSeconds: {
                                type: "number",
                                description: "Optional expiration time in seconds",
                            },
                        },
                        required: ["key", "value"],
                    },
                },
                {
                    name: "get",
                    description: "Get value by key from Redis",
                    inputSchema: {
                        type: "object",
                        properties: {
                            key: {
                                type: "string",
                                description: "Redis key to retrieve",
                            },
                        },
                        required: ["key"],
                    },
                },
                {
                    name: "delete",
                    description: "Delete one or more keys from Redis",
                    inputSchema: {
                        type: "object",
                        properties: {
                            key: {
                                oneOf: [
                                    { type: "string" },
                                    { type: "array", items: { type: "string" } }
                                ],
                                description: "Key or array of keys to delete",
                            },
                        },
                        required: ["key"],
                    },
                },
                {
                    name: "list",
                    description: "List Redis keys matching a pattern",
                    inputSchema: {
                        type: "object",
                        properties: {
                            pattern: {
                                type: "string",
                                description: "Pattern to match keys (default: *)",
                            },
                        },
                    },
                },
            ],
        };
    });

    // Handle tool execution
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
            if (name === "set") {
                const { key, value, expireSeconds } = SetArgumentsSchema.parse(args);

                if (expireSeconds) {
                    await redisClient.setEx(key, expireSeconds, value);
                } else {
                    await redisClient.set(key, value);
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: `Successfully set key: ${key}`,
                        },
                    ],
                };
            } else if (name === "get") {
                const { key } = GetArgumentsSchema.parse(args);
                const value = await redisClient.get(key);

                if (value === null) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Key not found: ${key}`,
                            },
                        ],
                    };
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: `${value}`,
                        },
                    ],
                };
            } else if (name === "delete") {
                const { key } = DeleteArgumentsSchema.parse(args);

                if (Array.isArray(key)) {
                    await redisClient.del(key);
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Successfully deleted ${key.length} keys`,
                            },
                        ],
                    };
                } else {
                    await redisClient.del(key);
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Successfully deleted key: ${key}`,
                            },
                        ],
                    };
                }
            } else if (name === "list") {
                const { pattern } = ListArgumentsSchema.parse(args);
                const keys = await redisClient.keys(pattern);

                return {
                    content: [
                        {
                            type: "text",
                            text: keys.length > 0
                                ? `Found keys:\n${keys.join('\n')}`
                                : "No keys found matching pattern",
                        },
                    ],
                };
            } else {
                throw new Error(`Unknown tool: ${name}`);
            }
        } catch (error) {
            if (error instanceof z.ZodError) {
                throw new Error(
                    `Invalid arguments: ${error.errors
                        .map((e) => `${e.path.join(".")}: ${e.message}`)
                        .join(", ")}`
                );
            }
            throw error;
        }
    });
    return server;
}

const app = express();
app.use(express.json());

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Handle POST requests for client-to-server communication
app.post('/mcp', async (req, res) => {
    // Check for existing session ID
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;
    if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            // enableJsonResponse: true,
            onsessioninitialized: (sessionId) => {
                console.log(`new transport: ${sessionId}`);
                // Store the transport by session ID
                transports[sessionId] = transport;
            }
        });

        // Clean up transport when closed
        transport.onclose = () => {
            if (transport.sessionId) {
                console.log(`clean up transport: ${transport.sessionId}`);
                delete transports[transport.sessionId];
            }
        };
        const server = createServer(redisClient);
        // Connect to the MCP server
        await server.connect(transport);
    } else {
        // Invalid request
        res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Bad Request: No valid session ID provided',
            },
            id: null,
        });
        return;
    }

    // Handle the request
    await transport.handleRequest(req, res, req.body);
});

// Reusable handler for GET and DELETE requests
const handleSessionRequest = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
};

// Handle GET requests for server-to-client notifications via SSE
app.get('/mcp', handleSessionRequest);

// Handle DELETE requests for session termination
app.delete('/mcp', handleSessionRequest);

async function handleTermination() {
    console.log('Shutting down server...');
    // Close all active transports to properly clean up resources
    for (const sessionId in transports) {
        try {
            console.log(`Closing transport for session ${sessionId}`);
            await transports[sessionId].close();
            delete transports[sessionId];
        } catch (error) {
            console.error(`Error closing transport for session ${sessionId}:`, error);
        }
    }
    // Then the redis connection
    await redisClient.quit().catch(() => { });
    console.log('Server shut down successfully');
}

// Handle process termination
process.on('SIGINT', async () => {
    await handleTermination();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await handleTermination();
    process.exit(0);
});

app.listen(3000, (error) => {
    if (error) {
        console.log(`failed to bind to 3000: ${error}`);
        return;
    }
    console.log('mcp server is listening on 3000');
});