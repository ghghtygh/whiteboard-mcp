import { WHITEBOARD_API_ORIGIN } from './config.js'

// whiteboard-server 의 { data: T } / { error: { code, message } } 응답 계약을 그대로 따른다
// (whiteboard-web 의 src/api/client.ts 와 동일한 unwrap 규약).
interface ApiSuccess<T> {
  data: T
}
interface ApiFailure {
  error: { code: string; message: string }
}

export class WhiteboardApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'WhiteboardApiError'
  }
}

/** MCP 요청의 Authorization 헤더에서 넘어온 토큰(PAT 또는 access JWT) 하나에 묶인 클라이언트. */
export class WhiteboardClient {
  constructor(private readonly token: string) {}

  private async request<T>(
    path: string,
    init?: { method?: string; body?: unknown; isMultipart?: FormData; raw?: boolean },
  ): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}` }
    let body: string | FormData | undefined
    if (init?.isMultipart) {
      body = init.isMultipart
      // fetch 가 FormData boundary 를 포함한 Content-Type 을 알아서 세팅하므로 직접 지정하지 않는다.
    } else if (init?.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(init.body)
    }

    const res = await fetch(`${WHITEBOARD_API_ORIGIN}/api/v1${path}`, {
      method: init?.method ?? 'GET',
      headers,
      body,
    })

    if (res.status === 204) return undefined as T

    // export 는 { data } 로 감싸지 않고 파일 바디를 그대로 내려준다(다운로드 응답이라)
    // — 나머지 모든 엔드포인트는 { data } / { error } 계약을 따른다.
    if (init?.raw) {
      if (!res.ok) {
        throw new WhiteboardApiError(`whiteboard-server request failed (${res.status})`, res.status)
      }
      return (await res.json()) as T
    }

    const payload = (await res.json().catch(() => null)) as ApiSuccess<T> | ApiFailure | null
    if (!res.ok) {
      const err = payload as ApiFailure | null
      throw new WhiteboardApiError(
        err?.error?.message ?? `whiteboard-server request failed (${res.status})`,
        res.status,
        err?.error?.code,
      )
    }
    return (payload as ApiSuccess<T>).data
  }

  // ── 인증 ──
  me() {
    return this.request<{ id: string; email: string; name: string }>('/auth/me')
  }

  // ── 보드 메타데이터 ──
  listBoards() {
    return this.request<BoardDto[]>('/boards')
  }
  getBoard(boardId: string) {
    return this.request<BoardDto>(`/boards/${encodeURIComponent(boardId)}`)
  }
  createBoard(title: string) {
    return this.request<BoardDto>('/boards', { method: 'POST', body: { title } })
  }
  renameBoard(boardId: string, title: string) {
    return this.request<BoardDto>(`/boards/${encodeURIComponent(boardId)}`, {
      method: 'PATCH',
      body: { title },
    })
  }
  deleteBoard(boardId: string) {
    return this.request<void>(`/boards/${encodeURIComponent(boardId)}`, { method: 'DELETE' })
  }

  // ── 카탈로그 ──
  listCatalog(type?: string) {
    return this.request<CatalogComponentDto[]>(type ? `/catalog/${encodeURIComponent(type)}` : '/catalog')
  }

  // ── 보드 문서(Yjs) export/import ──
  exportDocument(boardId: string) {
    return this.request<BoardDocumentFile>(`/boards/${encodeURIComponent(boardId)}/export`, { raw: true })
  }

  /** 전체 문서를 이 스냅샷 하나로 교체한다(증분 없이). 접속 중인 세션에도 실시간 반영된다. */
  async importDocument(boardId: string, snapshotBase64: string): Promise<void> {
    const file: BoardDocumentFile = {
      format: 'whiteboard-doc-v1',
      boardId,
      exportedAt: new Date().toISOString(),
      snapshot: snapshotBase64,
      updates: [],
    }
    const form = new FormData()
    form.set('file', new Blob([JSON.stringify(file)], { type: 'application/json' }), 'board.json')
    await this.request<void>(`/boards/${encodeURIComponent(boardId)}/import`, {
      method: 'POST',
      isMultipart: form,
    })
  }
}

export interface BoardDto {
  id: string
  title: string
  ownerId: string
  createdAt: string
  updatedAt: string
}

export interface CatalogComponentDto {
  type: string
  displayName: string
  category: string
  iconUrl: string
  defaultWidth: number
  defaultHeight: number
  anchors: string[]
  version: number
  deprecated: boolean
}

export interface BoardDocumentFile {
  format: string
  boardId: string
  exportedAt: string
  snapshot: string | null
  updates: string[]
}
