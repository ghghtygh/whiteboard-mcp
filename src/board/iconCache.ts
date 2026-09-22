import { fetchIconSvg } from '../whiteboardClient.js'

// render_graph 위젯은 노드 아이콘을 data: URI 로 인라인해서 돌려준다 — ChatGPT 의 위젯
// iframe 이 외부 도메인 리소스 로딩을 CSP 로 막아도(정확한 허용 메커니즘을 검증할 방법이
// 없었다) data: URI 는 애초에 네트워크 요청 자체가 없어 이 문제를 피해간다. 아이콘은 타입당
// 하나뿐이고 거의 안 바뀌니 캐시로 매 render_graph 호출마다의 왕복을 없앤다.
const TTL_MS = 5 * 60_000
const cache = new Map<string, { dataUri: string; expiresAt: number }>()

export async function getIconDataUri(type: string): Promise<string | null> {
  const hit = cache.get(type)
  if (hit && hit.expiresAt > Date.now()) return hit.dataUri
  try {
    const svg = await fetchIconSvg(type)
    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`
    cache.set(type, { dataUri, expiresAt: Date.now() + TTL_MS })
    return dataUri
  } catch {
    // 아이콘 하나 못 가져온다고 렌더 전체를 실패시키지 않는다 — 그 노드는 아이콘 없이 보여준다.
    return null
  }
}
