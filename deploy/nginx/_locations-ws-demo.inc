# Shared location blocks for a workspace vhost - included (via nginx
# `include`) from both the plain-HTTP server block
# (workspace.conf.template / workspace-redirect.conf.template once TLS is
# on) and the HTTPS one (workspace-ssl.conf.template), so the routing
# rules only exist in one place regardless of whether TLS is enabled.
#
# Rendered by scripts/provision-workspace.sh into
# deploy/nginx/_locations-<slug>.inc (the leading underscore and .inc
# extension keep it out of nginx conf.d's `include *.conf` autoload - it
# must only ever be pulled in explicitly via `include`, never parsed as
# its own top-level config file).
#
# Named .inc (not .conf) is deliberate: nginx:alpine's default conf.d
# `include *.conf` would otherwise try to load this fragment directly,
# which fails immediately (bare `location {}` blocks outside a `server{}`
# context are a syntax error at that scope).

# Admin dashboard (Vue SPA)
location / {
    proxy_pass http://127.0.0.1:3010;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# /whoobe-one API routes -> core-api (must be before the SPA catch-all)
location ~ ^/whoobe-one/(websites|themes|pages|snippets|templates|kits|website-paths|search|settings)(/.*)?$ {
    proxy_pass http://127.0.0.1:3013;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Whoobe One editor (embedded in admin dashboard, direct access)
# Trailing slash on proxy_pass DOES strip the /whoobe-one/ prefix here -
# deliberately the opposite of docs/release/operations/deployment.md's reference nginx
# config, which fronts `vite preview` (base-aware, expects the full
# /whoobe-one/... path). This workspace's whoobe-one-spike instead runs
# as a Docker image (Dockerfile's `whoobe-one-spike` target: a generic
# nginx:alpine serving the static dist/ via nginx/admin-spa.conf / nginx/editor-spa.conf.template,
# which has no idea what prefix it's reverse-proxied under) - its actual
# files live at the container's own root (/assets/*.js, /editor, ...),
# so the prefix must come off before forwarding or every asset request
# 404s into the SPA fallback (index.html, wrong MIME type - blank canvas,
# Vue never mounts).
location /whoobe-one/ {
    proxy_pass http://127.0.0.1:3016/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# core-api routes
location ~ ^/(auth|documents|snippets|data-classes|data-components|data-objects|mail-settings|mail-log|mail-templates|migration-sources|health|search|themes|public|ai|figma|preview|sites|pages|settings|workflows|users|roles)(/.*)?$ {
    proxy_pass http://127.0.0.1:3013;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# gateway API routes (must come before the /api/v1/ block below)
location /api/v1/gateway/ {
    proxy_pass http://127.0.0.1:3011/api/v1/gateway/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /api/remote/ {
    proxy_pass http://127.0.0.1:3011/api/remote/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# asset-processor API routes
location /api/v1/ {
    proxy_pass http://127.0.0.1:3012;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    client_max_body_size 100M;
}

# DAM public asset proxy
location /dam-asset/ {
    proxy_pass http://127.0.0.1:3012/dam-asset/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    expires 1y;
    add_header Cache-Control "public, immutable";
}
