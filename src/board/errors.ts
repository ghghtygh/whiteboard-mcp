/** Thrown for any invalid reference or request inside a graph mutation — always caught by
 * tools/util.ts's withErrorHandling and surfaced to the MCP client as a clear tool error,
 * never silently swallowed into an `{ ok: false }`. */
export class GraphError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = 'GraphError'
  }
}

export function notFound(kind: 'node' | 'edge' | 'group', id: string): never {
  throw new GraphError(`No ${kind} with id "${id}" in this graph.`, `${kind.toUpperCase()}_NOT_FOUND`)
}
