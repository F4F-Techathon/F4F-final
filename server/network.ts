import http from 'node:http'

const PROXY_VARIABLES = ['HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy']

// Upstream APIs may only be reachable through a proxy (TypeSafe answers 451 in some regions), but
// Node's fetch ignores HTTP(S)_PROXY unless told to. Proxy settings from the environment or the
// .env files are applied to Node's global agents and fetch alike.
export function applyProxySettings(env: Record<string, string | undefined>) {
  for (const name of PROXY_VARIABLES) if (env[name] && !process.env[name]) process.env[name] = env[name]
  const setGlobalProxyFromEnv = (http as { setGlobalProxyFromEnv?: () => void }).setGlobalProxyFromEnv
  if (PROXY_VARIABLES.some((name) => process.env[name])) setGlobalProxyFromEnv?.()
}
