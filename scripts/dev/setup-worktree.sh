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
  elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q supabase_db; then
    # El stack local ya publica los tres valores. Generarlo es mas fiable que
    # copiarlo: el principal puede no tenerlo, como paso en la Fase 2.
    echo "→ .env.local ausente, generandolo desde 'supabase status'"
    npx supabase status --output json | node -e '
      let raw = "";
      process.stdin.on("data", c => raw += c);
      process.stdin.on("end", () => {
        const s = JSON.parse(raw);
        const need = ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"];
        const missing = need.filter(k => !s[k]);
        if (missing.length) {
          console.error("Faltan claves en supabase status: " + missing.join(", "));
          process.exit(1);
        }
        // La secreta NUNCA lleva NEXT_PUBLIC_: ese prefijo la manda al bundle
        // del navegador y con ella se saltan todas las policies de RLS.
        process.stdout.write(
          "NEXT_PUBLIC_SUPABASE_URL=" + s.API_URL + "\n" +
          "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=" + s.PUBLISHABLE_KEY + "\n" +
          "SUPABASE_SECRET_KEY=" + s.SECRET_KEY + "\n"
        );
      });
    ' > .env.local
    echo "  escrito con $(grep -c = .env.local) variables"
  else
    echo "⚠ .env.local ausente y el stack local esta abajo."
    echo "  Levanta Supabase y vuelve a correr este script."
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
