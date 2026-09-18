import express from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createBoardMcpServer } from './server.js'
import { PORT, WHITEBOARD_SERVICE_TOKEN } from './config.js'

const app = express()
app.use(express.json())

// 이 MCP 엔드포인트 자체는 인증을 요구하지 않는다 — 누구나 바로 붙을 수 있다.
// 대신 whiteboard-server 호출에는 이 서버 전용 서비스 계정의 고정 PAT 을 쓴다(config.ts).
// 그 계정이 멤버가 아닌 보드는 여전히 볼 수 없으므로, "인증 없는 MCP 접속"과
// "다른 사용자 보드로부터의 격리"는 서로 다른 문제이고 둘 다 만족된다.
//
// Stateless mode: a fresh McpServer + transport per request. No session map to manage.
app.post('/mcp', async (req, res) => {
  try {
    const server = createBoardMcpServer(WHITEBOARD_SERVICE_TOKEN)
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
