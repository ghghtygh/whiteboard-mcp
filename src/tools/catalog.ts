import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { listCatalog } from '../whiteboardClient.js'
import { catalogComponentSchema } from './schemas.js'
import { jsonResult, withErrorHandling } from './util.js'

export function registerCatalogTools(server: McpServer) {
  server.registerTool(
    'list_catalog',
    {
      title: 'List catalog components',
      description:
        'List the component types available for nodes (e.g. "server", "database"). Use the `type` ' +
        'field returned here as the `type` argument to add_node — add_node rejects any type not in ' +
        'this list. Public data, no auth needed.',
      inputSchema: { type: z.string().optional().describe('Filter by a specific component type') },
      outputSchema: { components: z.array(catalogComponentSchema) },
    },
    withErrorHandling(async ({ type }) => jsonResult({ components: await listCatalog(type) })),
  )
}
