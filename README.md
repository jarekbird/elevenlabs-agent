# elevenlabs-agent

Node.js/TypeScript service for ElevenLabs agent integration with cursor-runner.

## Overview

This service acts as a bridge between ElevenLabs voice agents and cursor-runner, handling:
- Webhook requests from ElevenLabs agents
- Session management and registration
- Async task execution coordination
- Callback handling for cursor-runner task completion

## Technology Stack

- **Node.js** - Runtime
- **TypeScript** - Type safety
- **Express** - HTTP server
- **Redis** - Session and callback queue storage
- **Jest** - Testing framework

## Development

### Prerequisites

- Node.js 18+
- npm or yarn
- Redis (for session storage)

### Installation

```bash
npm install
```

### Running Development Server

```bash
npm run dev
```

The service will be available at `http://localhost:3004`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

### Running Tests

```bash
npm test
```

## Configuration

Environment variables:

- `PORT` - Server port (default: 3004)
- `ELEVENLABS_AGENT_ENABLED` - Feature flag (default: false)
- `ELEVENLABS_API_KEY` - ElevenLabs API key
- `ELEVENLABS_AGENT_ID` - ElevenLabs agent ID
- `WEBHOOK_SECRET` - Secret for webhook authentication
- `CURSOR_RUNNER_URL` - URL for cursor-runner service (default: http://cursor-runner:3001)
- `REDIS_URL` - Redis connection URL (default: redis://redis:6379/0)

## Project Structure

```
elevenlabs-agent/
├── src/
│   ├── server.ts          # Express server setup
│   ├── index.ts           # Application entry point
│   ├── logger.ts          # Winston logger configuration
│   ├── routes/            # API route handlers
│   ├── services/          # Business logic services
│   └── types/             # TypeScript type definitions
├── tests/                 # Test files
├── package.json
├── tsconfig.json
└── jest.config.js
```

## API Endpoints

- `GET /health` - Health check endpoint
- `GET /signed-url` - Get signed URL for ElevenLabs agent (when implemented)
- `POST /agent-tools` - Webhook endpoint for ElevenLabs agent tools (when implemented)
- `POST /callback` - Callback endpoint for cursor-runner task completion (when implemented)

