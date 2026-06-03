# Face Detection Backend

Stage 1 offline face-auth backend built with Go, Gin, and MongoDB.

## Run locally

```bash
docker compose up -d mongo
go run ./cmd/server
```

Defaults:

- `PORT=8080`
- `MONGO_URI=mongodb://localhost:27017`
- `MONGO_DATABASE=face_detection`

## Test

```bash
go test ./...
```

The test suite uses an in-memory store through the same handlers and services, so it does not require a running Mongo instance.

## API docs

OpenAPI contract: [openapi.yaml](openapi.yaml)
