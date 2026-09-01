#!/usr/bin/env bash
# Prepara un worktree recien creado para poder ejecutar y probar.
#
# Un worktree de git trae los archivos versionados y nada mas. Faltan dos cosas
# que el proyecto necesita y que no estan en git a proposito:
#
#   node_modules   pesa y se reconstruye desde el lockfile
#   .env.local     tiene la clave secreta de Supabase; esta en .gitignore
#
# Cuatro planes seguidos de la Fase 2 perdieron tiempo redescubriendo esto.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
PRIMARY=$(git worktree list --porcelain | awk '/^worktree /{print substr($0,10); exit}')

if [ ! -d node_modules ]; then
  echo "→ node_modules ausente, instalando desde el lockfile"
  npm ci --silent
else
  echo "✓ node_modules presente"
fi

if [ ! -f .env.local ]; then
  if [ -f "$PRIMARY/.env.local" ] && [ "$PRIMARY" != "$(pwd -P)" ]; then
    cp "$PRIMARY/.env.local" .env.local
    echo "→ .env.local copiado desde el worktree principal"
  else
    echo "⚠ .env.local ausente y no hay uno en $PRIMARY."
    echo "  Sacalo de 'npx supabase status' y escribelo a mano."
    echo "  La clave secreta NUNCA lleva el prefijo NEXT_PUBLIC_."
  fi
else
  echo "✓ .env.local presente"
fi

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q supabase_db; then
  echo "✓ Supabase local arriba"
else
  echo "⚠ Supabase local abajo. Levantalo con: npx supabase start"
  echo "  Ojo: 'supabase stop --no-backup' seguido de 'start' deja solo la base."
  echo "  Para los 12 contenedores: 'supabase stop' y luego 'supabase start'."
fi
