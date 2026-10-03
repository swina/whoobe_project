# MinIO server + mc (client), built from source at a pinned release.
#
# Why: MinIO no longer publishes its container images on Docker Hub / Quay (`minio/minio` answers "pull access
# denied", `quay.io/minio/minio` 401), so a machine that has never pulled the old image - a fresh server, a CI
# runner, a new workspace - cannot start the stack. The source is still public, so we build it here.
# MinIO is AGPL-3.0: running it internally is fine; if you ever distribute this image, publish its source.
#
# Bump: change MINIO_VERSION / MC_VERSION (release tags at https://github.com/minio/minio/releases and
# https://github.com/minio/mc/releases), rebuild with `docker compose build minio`. Data format is stable across
# these releases; the volume is not touched. Alternative worth evaluating later: another S3-compatible store
# (the services only use the S3 API, path-style).
FROM golang:1.25-bookworm@sha256:3b4a11519ad929d1e1d261a12cff056f0c85b735253d7d861346b9c6f8b36437 AS build
ARG MINIO_VERSION=RELEASE.2025-09-07T16-13-09Z
ARG MC_VERSION=RELEASE.2025-08-13T08-35-41Z
RUN CGO_ENABLED=0 go install -ldflags "-s -w" github.com/minio/minio@${MINIO_VERSION} \
 && CGO_ENABLED=0 go install -ldflags "-s -w" github.com/minio/mc@${MC_VERSION}

FROM debian:bookworm-slim@sha256:3783cc01769c7b2b1b83a5c5ad96c815348e28ed7da68e2e3687004faa906251
# curl: the compose healthcheck uses it
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /go/bin/minio /usr/bin/minio
COPY --from=build /go/bin/mc /usr/bin/mc
ENV MC_CONFIG_DIR=/tmp/.mc
EXPOSE 9000 9001
ENTRYPOINT ["/usr/bin/minio"]
