# Two targets share the dependency layer:
#
#   runner  the app — standalone Next server, non-root, ~150 MB
#   tools   full node_modules + sources, for `npm run db:*` (migrate, user,
#           import). Never serves traffic; deploy.sh runs it as a one-off.
#
# Build:  docker build --target runner --build-arg APP_COMMIT=$(git rev-parse HEAD) -t app .
#         docker build --target tools  --build-arg APP_COMMIT=$(git rev-parse HEAD) -t app-tools .

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ARG APP_COMMIT=unknown
ENV APP_COMMIT=$APP_COMMIT NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM deps AS tools
COPY . .
ARG APP_COMMIT=unknown
ENV APP_COMMIT=$APP_COMMIT NODE_ENV=production
# The db:* scripts pass --env-file=.env; configuration arrives from the
# container environment instead, so give node an empty file to satisfy it.
RUN touch .env
ENTRYPOINT ["npm", "run"]
CMD ["db:migrate"]

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
ARG APP_COMMIT=unknown
ENV APP_COMMIT=$APP_COMMIT
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
# Agent instructions are read from ./docs at runtime. Tracing happens to pick
# them up today; copying explicitly means a tracing change cannot drop them.
COPY --from=build --chown=app:app /app/docs ./docs
USER app
EXPOSE 3000
CMD ["node", "server.js"]
