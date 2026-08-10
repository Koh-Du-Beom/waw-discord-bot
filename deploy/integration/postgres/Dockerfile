FROM node:24-bookworm-slim AS node_toolchain

FROM postgres:17-bookworm

COPY --from=node_toolchain /usr/local /usr/local

WORKDIR /opt/waw
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY scripts ./scripts
COPY .github ./.github
COPY deploy ./deploy
COPY src ./src
COPY web ./web
COPY migrations ./migrations
COPY tsconfig.json tsconfig.build.json vite.config.ts ./

ENV WAW_REQUIRE_POSTGRES_INTEGRATION=1
USER postgres

CMD ["npm", "test"]
