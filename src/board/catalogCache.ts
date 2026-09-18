import { listCatalog } from '../whiteboardClient.js'
import { GraphError } from './errors.js'

// add_node/apply_operations validate `type` against the real catalog instead of accepting any
// string. The catalog barely changes, so a short-lived in-memory cache (this process survives
// across stateless MCP requests, just not across pod restarts) avoids a round trip per call.
const TTL_MS = 5 * 60_000
let cache: { types: Set<string>; expiresAt: number } | null = null

async function loadTypes(): Promise<Set<string>> {
  if (cache && cache.expiresAt > Date.now()) return cache.types
  const components = await listCatalog()
  const types = new Set(components.map((c) => c.type))
  cache = { types, expiresAt: Date.now() + TTL_MS }
  return types
}

export async function assertValidType(type: string): Promise<void> {
  const types = await loadTypes()
  if (!types.has(type)) {
    throw new GraphError(
      `Unknown component type "${type}". Call list_catalog to see valid types.`,
      'UNKNOWN_COMPONENT_TYPE',
    )
  }
}
