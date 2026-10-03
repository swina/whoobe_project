# Garage S3 store + automatic first-run setup (entrypoint.sh). The official image is `scratch` (no shell), so the
# static binary is copied onto a minimal alpine. Bump: change the Garage tag/digest, rebuild (data format is
# versioned by Garage; read its release notes for major upgrades).
FROM dxflrs/garage:v2.4.1@sha256:9c96caa2612d3411acc5b0e6701fb238dbfba33e533a6d7d3d811a4b12d0d020 AS garage

FROM alpine:3@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6
RUN apk upgrade --no-cache
COPY --from=garage /garage /usr/local/bin/garage
COPY garage.toml /etc/garage.toml.tpl
COPY entrypoint.sh /entrypoint.sh
# (the container exits when Garage exits, so "ready file exists" is a sufficient health signal)
# /var/lib/garage is a volume: a fresh (root-owned) volume is handed over by the compose `garage-perms` one-shot
RUN mkdir -p /var/lib/garage/meta /var/lib/garage/data && chown -R 10001:10001 /var/lib/garage && chmod 0755 /entrypoint.sh
USER 10001:10001
EXPOSE 3900
HEALTHCHECK --interval=5s --timeout=5s --start-period=15s --retries=12 \
  CMD ["test", "-f", "/tmp/ready"]
ENTRYPOINT ["/entrypoint.sh"]
