# Face Detection Backend

Stage 1 offline face-auth backend built with Go and Gin.

## Run locally

```bash
go run ./cmd/server
```

Defaults:

- `PORT=8080`
- `STORE_BACKEND=file`
- `FILE_STORE_DIR=data`
- File storage creates `tenants.json`, `users.json`, `clients.json`, and `auth_events.json` inside `FILE_STORE_DIR`.

The default file store is intended for local demos and the hackathon zip flow. It does not require Docker or MongoDB.

## Run with MongoDB

```bash
docker compose up -d mongo
STORE_BACKEND=mongo go run ./cmd/server
```

MongoDB defaults:

- `MONGO_URI=mongodb://localhost:27017`
- `MONGO_DATABASE=face_detection`

## Test

```bash
go test ./...
```

The test suite uses an in-memory store through the same handlers and services, so it does not require a running Mongo instance.

## API docs

OpenAPI contract: [openapi.yaml](openapi.yaml)
