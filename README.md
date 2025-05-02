# mcp-tool-server-redis
A MCP server which provides tools function to get/set key-value pairs data backed by Redis

## Run MCP Server

Use docker compose to start up the server
```bash
docker compose up -d
```

This starts a MCP server with Redis as the backend. The server will be available at `http://localhost:3000`.

## Interact with MCP server

### Option 1: streamable HTTP client from the typescript-sdk
You can interact with the MCP server using the simple streamable HTTP client from the MCP typescript-sdk repo:
https://github.com/modelcontextprotocol/typescript-sdk.git

Here is the usage:
```
git clone https://github.com/modelcontextprotocol/typescript-sdk.git
cd typescript-sdk
npm install
npx tsx src/examples/client/simpleStreamableHttp.ts
```

By default, the client will connect to `http://localhost:3000` and you should see the following outputs:
```
MCP Interactive Client
=====================
Connecting to http://localhost:3000/mcp...
Transport created with session ID: 44dff10f-89bc-4965-b280-e1df3eb56a51
Connected to MCP server

Available commands:
  connect [url]              - Connect to MCP server (default: http://localhost:3000/mcp)
  disconnect                 - Disconnect from server
  terminate-session          - Terminate the current session
  reconnect                  - Reconnect to the server
  list-tools                 - List available tools
  call-tool <name> [args]    - Call a tool with optional JSON arguments
  greet [name]               - Call the greet tool
  multi-greet [name]         - Call the multi-greet tool with notifications
  start-notifications [interval] [count] - Start periodic notifications
  list-prompts               - List available prompts
  get-prompt [name] [args]   - Get a prompt with optional JSON arguments
  list-resources             - List available resources
  help                       - Show this help
  quit                       - Exit the program

>
```

Then you are in the interactive prompt mode. To connect to different MCP server, just type `connect [url]` and press enter.

Use the `list-tools` command to list all available tools. There are 4 available tools:
```
> list-tools
Available tools:
  - set: Set a Redis key-value pair with optional expiration
  - get: Get value by key from Redis
  - delete: Delete one or more keys from Redis
  - list: List Redis keys matching a pattern
```

Use the `call-tool <name>` command to call a tool with optional JSON arguments. For example, you can add a key-value pair to Redis using the `set` tool:

```
> call-tool set {"key": "this is a new key", "value": "value for the new key"}
Calling tool 'set' with args: { key: 'this is a new key', value: 'value for the new key' }
Tool result:
  Successfully set key: this is a new key

```

### Option2: MCP-Cli

You can also use the `mcp-cli` command line tool to interact with your MCP server. To use it, run the following command:
```
npx @wong2/mcp-cli --url http://localhost:3000/mcp
```

This will connect to the MCP server via streamable HTTP. It will prompt you the list of available tools and allow you to call them with JSON arguments. For example:
```
$ npx @wong2/mcp-cli --url http://localhost:3000/mcp
✔ Connected, server capabilities: tools
? Pick a primitive ›
❯   tool(set) - Set a Redis key-value pair with optional expiration
    tool(get) - Get value by key from Redis
    tool(delete) - Delete one or more keys from Redis
    tool(list) - List Redis keys matching a pattern
```
You can use cursor to navigate the list and select the desired primitive. Then, you will be prompted to enter the arguments for the selected primitive.
