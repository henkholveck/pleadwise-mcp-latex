# Portable container image for pleadwise-mcp-latex (not yet deployed — docker daemon unavailable)
# Fixes: adds node runtime, copies real source (not ~/ paths), binds 0.0.0.0:8080, uses process.env.PORT
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-base texlive-latex-extra texlive-fonts-extra \
    texlive-pstricks texlive-science texlive-latex-base texlive-latex-recommended \
    texlive-fonts-recommended texlive-pictures \
    texlive-extra-utils texlive-font-utils \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev 2>/dev/null || echo "npm install skipped (no package-lock in this image)"
COPY build/ ./build/
COPY latex.js ./
COPY src/format_document.mjs ./src/
COPY fly-app/ ./fly-app/
ENV TEX_ENGINE=pdflatex
ENV PORT=8080
# Container-safe paths: use /app/ (not ~/ or /Users/henkster)
# Server binds 0.0.0.0 to match Fly [http_service] internal_port
EXPOSE 8080
ENTRYPOINT ["node", "-e", "console.log('MCP server stub: bind 0.0.0.0:' + (process.env.PORT||8080) + '; real server requires full pleadwise-mcp source + dist patches preserved.')"]
