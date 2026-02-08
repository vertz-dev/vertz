import type { GeneratedFile } from '../config/defaults';

export function generateDockerConfig(runtime: 'bun' | 'node', port: number): GeneratedFile[] {
  const dockerfile = runtime === 'bun' ? generateBunDockerfile(port) : generateNodeDockerfile(port);

  const dockerignore = `node_modules
.git
.vertz
dist
*.log
.env
.env.*
`;

  return [
    { path: 'Dockerfile', content: dockerfile },
    { path: '.dockerignore', content: dockerignore },
  ];
}

function generateBunDockerfile(port: number): string {
  return `# Build stage
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# Production stage
FROM oven/bun:1-slim AS production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE ${port}
CMD ["bun", "run", "start"]
`;
}

function generateNodeDockerfile(port: number): string {
  return `# Build stage
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:22-slim AS production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE ${port}
CMD ["node", "dist/index.js"]
`;
}
