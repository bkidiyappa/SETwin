FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY apps apps
COPY packages packages
RUN pnpm install --frozen-lockfile
ENV SETWIN_ENV=production
ENV NODE_ENV=production
EXPOSE 8000
CMD ["node", "--experimental-strip-types", "apps/api/src/server.ts"]
