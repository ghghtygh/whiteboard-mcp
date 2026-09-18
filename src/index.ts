import express from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createBoardMcpServer } from './server.js'
import { PORT } from './config.js'

const app = express()
app.use(express.json())

function bearerToken(req: express.Request): string | null {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  return token || null
}

// Stateless mode: a fresh McpServer + transport per request, with the caller's whiteboard-server
// token bound via closure (see server.ts). No session map to manage, and each tool call re-checks
// permission on whiteboard-server itself.
app.post('/mcp', async (req, res) => {
  const token = bearerToken(req)
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization: Bearer <whiteboard-server token> header.' })
    return
  }

  try {
    const server = createBoardMcpServer(token)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      void transport.close()
      void server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (err) {
    console.error('MCP request failed', err)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
})

// Stateless server keeps no sessions to stream to or terminate.
app.get('/mcp', (_req, res) => {
  res.status(405).json({ error: 'Method not allowed: this server does not keep sessions open.' })
})
app.delete('/mcp', (_req, res) => {
  res.status(405).json({ error: 'Method not allowed: this server does not keep sessions open.' })
})

// 이 서버는 자체 DB/상태가 없어(모든 상태는 whiteboard-server 에 있다) liveness == readiness.
app.get('/healthz', (_req, res) => res.status(200).send('ok'))
app.get('/readyz', (_req, res) => res.status(200).send('ok'))

app.listen(PORT, () => {
  console.log(`whiteboard-mcp listening on :${PORT}`)
})
