# SMART MCP Sitecore Server for Railway

This is the MCP (Model Context Protocol) Sitecore server component of the SMART Platform, deployed on Railway.

## Features

- HTTP REST API for MCP tool execution
- WebSocket support for real-time communication
- Built-in health checks
- CORS enabled for cross-origin requests
- Environment-based configuration

## API Endpoints

### Health Check
```
GET /health
```

### List Available Tools
```
GET /mcp/tools
```

### Execute MCP Tool
```
POST /mcp/execute
Content-Type: application/json

{
  "tool": "item-service-search",
  "arguments": {
    "instanceUrl": "https://your-sitecore.com",
    "username": "admin",
    "password": "password",
    "database": "master",
    "query": "*"
  }
}
```

## Available MCP Tools

- `item-service-get-item` - Get a specific Sitecore item
- `item-service-search` - Search Sitecore items
- `template-analysis` - Analyze Sitecore templates
- `media-analysis` - Analyze media library
- `performance-analysis` - Analyze performance metrics
- `security-analysis` - Analyze security settings

## Environment Variables

Set these in Railway dashboard:

- `SITECORE_INSTANCE_URL` - Default Sitecore URL
- `SITECORE_USERNAME` - Default username
- `SITECORE_PASSWORD` - Default password
- `SITECORE_DATABASE` - Default database (usually 'master')
- `NODE_ENV` - Environment (production/development)

## Deployment

This server is designed to run on Railway with automatic deployment from Git.

## Connection from SMART Platform

The main SMART Platform (deployed on Vercel) connects to this MCP server via HTTP API calls.