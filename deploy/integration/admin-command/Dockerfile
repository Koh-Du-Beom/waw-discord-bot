FROM node:24-bookworm-slim AS node_toolchain

FROM ubuntu:24.04

COPY --from=node_toolchain /usr/local /usr/local

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client procps util-linux \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 4100 waw-admin-command \
 && groupadd --gid 4104 waw-member-role \
 && useradd --uid 4101 --gid waw-member-role --groups waw-admin-command --no-create-home waw-bot \
 && useradd --uid 4102 --gid waw-admin-command --no-create-home waw-web \
 && useradd --uid 4103 --no-create-home unrelated

WORKDIR /opt/waw
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig*.json ./
COPY src ./src
COPY migrations ./migrations

CMD ["sleep", "infinity"]
