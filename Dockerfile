ARG NODE_IMAGE=docker.1ms.run/library/node:22-alpine
FROM ${NODE_IMAGE} AS cloud-builder
WORKDIR /build
RUN apk add --no-cache openjdk17-jdk
COPY runtime/cloud/src ./src
COPY runtime/cloud/lib ./lib
RUN mkdir -p /out/classes && javac --release 17 -encoding UTF-8 -cp '/build/lib/*' -d /out/classes $(find /build/src -name '*.java')
FROM ${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production PORT=9978 CONFIG_PATH=/data/config.json HOST=:: JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8 CAT_NODE_URL=http://127.0.0.1:9988 CAT_DATA_DIR=/data/cat-runtime
RUN apk add --no-cache openjdk17-jre ffmpeg
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY server.js ./
COPY public/index.html ./public/index.html
COPY runtime/*.mjs ./runtime/
COPY runtime/ali-source/util/service-error-code.js ./runtime/ali-source/util/service-error-code.js
COPY runtime/cloud/src ./runtime/cloud/src
COPY runtime/cloud/lib ./runtime/cloud/lib
COPY config/config.example.json ./config/config.example.json
COPY builtin ./builtin
COPY THIRD-PARTY-LICENSES ./THIRD-PARTY-LICENSES
COPY THIRD-PARTY.md ./THIRD-PARTY.md
COPY --from=cloud-builder /out/classes /app/runtime/cloud/classes
RUN mkdir -p /data && chown -R node:node /app /data
COPY tools/docker-entrypoint.mjs ./tools/docker-entrypoint.mjs
EXPOSE 9978
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "Promise.all(['http://127.0.0.1:9978/api/health','http://127.0.0.1:9988/health'].map(u=>fetch(u).then(r=>{if(!r.ok)throw Error()}))).catch(()=>process.exit(1))"
CMD ["node","tools/docker-entrypoint.mjs"]
