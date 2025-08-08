/**
 * Railway-deployed MCP Sitecore Server
 * Provides HTTP/WebSocket endpoints for MCP communication
 */

import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import { createServer } from 'http';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SMART MCP Sitecore Server',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production'
  });
});

// MCP Tool execution endpoint
app.post('/mcp/execute', async (req, res) => {
  const { tool, arguments: args } = req.body;
  
  if (!tool) {
    return res.status(400).json({ error: 'Tool name is required' });
  }

  try {
    console.log(`Executing MCP tool: ${tool}`, args);
    
    // Execute the MCP server with the tool
    const result = await executeMcpTool(tool, args);
    
    res.json({
      success: true,
      tool,
      arguments: args,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('MCP execution error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      tool,
      arguments: args,
      timestamp: new Date().toISOString()
    });
  }
});

// List available MCP tools
app.get('/mcp/tools', async (req, res) => {
  try {
    const tools = await listMcpTools();
    res.json({
      success: true,
      tools,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error listing MCP tools:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Execute MCP tool using the @antonytm/mcp-sitecore-server package
 */
async function executeMcpTool(toolName, args) {
  return new Promise((resolve, reject) => {
    // Create a temporary configuration file for this specific request
    const tempConfig = {
      graphQL: {
        endpoint: args.graphqlEndpoint || `${args.instanceUrl}/sitecore/api/graph/`,
        apiKey: args.authToken || args.apiKey || '{6D3F291E-66A5-4703-887A-D549AF83D859}'
      },
      itemService: {
        domain: args.domain || 'sitecore',
        username: args.username,
        password: args.password,
        serverUrl: args.instanceUrl
      },
      powershell: {
        domain: args.domain || 'sitecore', 
        username: args.username,
        password: args.password,
        serverUrl: args.instanceUrl
      }
    };

    // Write config to a temporary file
    const configPath = `/tmp/mcp-config-${Date.now()}.json`;
    require('fs').writeFileSync(configPath, JSON.stringify(tempConfig, null, 2));
    
    console.log('Created MCP config file:', configPath);
    console.log('Config contents:', JSON.stringify(tempConfig, (key, value) => 
      key === 'password' ? '***' : value, 2));

    // Set up environment variables for MCP server
    // The MCP Sitecore server expects specific env var names based on config analysis
    const env = {
      ...process.env,
      // GraphQL configuration - override the defaults
      SITECORE_GRAPHQL_ENDPOINT: args.graphqlEndpoint || `${args.instanceUrl}/sitecore/api/graph/`,
      SITECORE_API_KEY: args.authToken || args.apiKey || '{6D3F291E-66A5-4703-887A-D549AF83D859}',
      
      // Item Service configuration - these might need different variable names
      SITECORE_ITEMSERVICE_URL: args.instanceUrl,
      SITECORE_ITEMSERVICE_USERNAME: args.username,  
      SITECORE_ITEMSERVICE_PASSWORD: args.password,
      SITECORE_ITEMSERVICE_DOMAIN: args.domain || 'sitecore',
      
      // Legacy/alternative variable names for Item Service  
      SITECORE_SERVER_URL: args.instanceUrl,
      SITECORE_USERNAME: args.username,
      SITECORE_PASSWORD: args.password,
      SITECORE_DOMAIN: args.domain || 'sitecore',
      
      // PowerShell configuration (this one works correctly)
      POWERSHELL_SERVER_URL: args.instanceUrl,
      POWERSHELL_USERNAME: args.username,
      POWERSHELL_PASSWORD: args.password,
      POWERSHELL_DOMAIN: args.domain || 'sitecore',
      
      // Additional settings
      SITECORE_DATABASE: args.database || 'master',
      SITECORE_INSTANCE_URL: args.instanceUrl
    };

    console.log('Starting MCP server with environment:', {
      SITECORE_SERVER_URL: env.SITECORE_SERVER_URL,
      SITECORE_DATABASE: env.SITECORE_DATABASE,
      SITECORE_USERNAME: env.SITECORE_USERNAME ? '***' : 'not set',
      SITECORE_DOMAIN: env.SITECORE_DOMAIN,
      HAS_PASSWORD: env.SITECORE_PASSWORD ? 'yes' : 'no'
    });

    // Try multiple approaches to configure the MCP server
    const mcpArgs = ['@antonytm/mcp-sitecore-server'];
    
    // Add potential configuration file argument
    mcpArgs.push('--config', configPath);

    console.log('Starting MCP server with args:', mcpArgs);

    // Spawn the MCP server process with enhanced environment
    const enhancedEnv = {
      ...env,
      // Add additional configuration approaches
      MCP_CONFIG_FILE: configPath,
      SITECORE_CONFIG_FILE: configPath
    };

    const mcpServer = spawn('npx', mcpArgs, {
      env: enhancedEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    // Handle stdout
    mcpServer.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log('MCP Server stdout:', chunk);
    });

    // Handle stderr
    mcpServer.stderr.on('data', (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      console.error('MCP Server stderr:', chunk);
    });

    // Send the MCP request
    const mcpRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };

    // Write the request to the MCP server
    mcpServer.stdin.write(JSON.stringify(mcpRequest) + '\n');
    mcpServer.stdin.end();

    // Handle process completion
    mcpServer.on('close', (code) => {
      // Clean up temporary config file
      try {
        require('fs').unlinkSync(configPath);
        console.log('Cleaned up config file:', configPath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup config file:', cleanupError.message);
      }

      if (code === 0) {
        try {
          // Parse the MCP response
          const response = JSON.parse(output);
          if (response.error) {
            reject(new Error(response.error.message || 'MCP tool execution failed'));
          } else {
            resolve(response.result);
          }
        } catch (parseError) {
          console.error('Failed to parse MCP response:', parseError);
          console.log('Raw output:', output);
          // Fallback: return raw output if JSON parsing fails
          resolve({
            rawOutput: output,
            tool: toolName,
            success: true
          });
        }
      } else {
        reject(new Error(`MCP server exited with code ${code}. Error: ${errorOutput}`));
      }
    });

    mcpServer.on('error', (error) => {
      // Clean up config file on error too
      try {
        require('fs').unlinkSync(configPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      console.error('Failed to start MCP server:', error);
      reject(new Error(`Failed to start MCP server: ${error.message}`));
    });

    // Timeout after 30 seconds
    const timeout = setTimeout(() => {
      mcpServer.kill('SIGTERM');
      // Clean up config file on timeout
      try {
        require('fs').unlinkSync(configPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      reject(new Error('MCP tool execution timed out'));
    }, 30000);
  });
}

/**
 * List available MCP tools
 */
async function listMcpTools() {
  return new Promise((resolve, reject) => {
    const mcpServer = spawn('npx', ['@antonytm/mcp-sitecore-server'], {
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';

    mcpServer.stdout.on('data', (data) => {
      output += data.toString();
    });

    // Send tools/list request
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list'
    };

    mcpServer.stdin.write(JSON.stringify(request) + '\n');
    mcpServer.stdin.end();

    mcpServer.on('close', (code) => {
      if (code === 0) {
        try {
          const response = JSON.parse(output);
          resolve(response.result?.tools || []);
        } catch (error) {
          resolve([
            { name: 'item-service-get-item', description: 'Get a Sitecore item' },
            { name: 'item-service-search', description: 'Search Sitecore items' },
            { name: 'template-analysis', description: 'Analyze Sitecore templates' },
            { name: 'media-analysis', description: 'Analyze media library' },
            { name: 'performance-analysis', description: 'Analyze performance' },
            { name: 'security-analysis', description: 'Analyze security' }
          ]);
        }
      } else {
        reject(new Error(`Failed to list tools: ${code}`));
      }
    });
  });
}

// Create HTTP server
const server = createServer(app);

// WebSocket support (optional, for future real-time features)
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.on('message', async (message) => {
    try {
      const request = JSON.parse(message.toString());
      if (request.method === 'mcp/execute') {
        const result = await executeMcpTool(request.tool, request.arguments);
        ws.send(JSON.stringify({
          id: request.id,
          success: true,
          data: result
        }));
      }
    } catch (error) {
      ws.send(JSON.stringify({
        id: request.id,
        success: false,
        error: error.message
      }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`🚀 SMART MCP Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP Tools: http://localhost:${PORT}/mcp/tools`);
  console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    process.exit(0);
  });
});