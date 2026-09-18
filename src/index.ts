import express from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createGraphMcpServer } from './server.js'
import { PORT } from './config.js'

const app = express()
app.use(express.json())

// 인증이 필요 없다 — 이 서버는 아무 상태도 들고 있지 않는다. 그래프는 도구 호출 사이를
// 오가는 opaque 토큰(URL 로도 열어볼 수 있음) 안에만 존재하고, 서버에 "누구의 그래프인가"
// 라는 개념 자체가 없다. 그래서 다른 MCP 이용자가 만든 그래프도 원천적으로 노출되지 않는다
// — 목록도, 계정도, 저장소도 없기 때문이다. 유일하게 인증을 쓰는 도구는 save_as_board 뿐이고,
// 그것도 호출자가 매번 자기 자신의 토큰을 인자로 건네는 방식이다(tools/save.ts).
//
// Stateless mode: a fresh McpServer + transport per request. No session map to manage.
app.post('/mcp', async (req, res) => {
  try {
    const server = createGraphMcpServer()
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

// 이 서버는 자체 DB/상태가 없어 liveness == readiness.
app.get('/healthz', (_req, res) => res.status(200).send('ok'))
app.get('/readyz', (_req, res) => res.status(200).send('ok'))

app.listen(PORT, () => {
  console.log(`whiteboard-mcp listening on :${PORT}`)
})
