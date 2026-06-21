FROM node:22-alpine
RUN npm install -g pnpm@11.9.0
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
EXPOSE 7801
CMD ["pnpm", "--filter", "@mcpshield/mcp-server", "start"]
