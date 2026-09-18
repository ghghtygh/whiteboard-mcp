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
  async getBoard(boardId: string) {
    await this.assertMember(boardId)
    return this.request<BoardDto>(`/boards/${encodeURIComponent(boardId)}`)
  }
  createBoard(title: string) {
    return this.request<BoardDto>('/boards', { method: 'POST', body: { title } })
  }
  async renameBoard(boardId: string, title: string) {
    await this.assertMember(boardId)
    return this.request<BoardDto>(`/boards/${encodeURIComponent(boardId)}`, {
      method: 'PATCH',
      body: { title },
    })
  }
  async deleteBoard(boardId: string) {
    await this.assertMember(boardId)
    return this.request<void>(`/boards/${encodeURIComponent(boardId)}`, { method: 'DELETE' })
  }

  // ── 카탈로그 ──
  listCatalog(type?: string) {
    return this.request<CatalogComponentDto[]>(type ? `/catalog/${encodeURIComponent(type)}` : '/catalog')
  }

  // ── 보드 문서(Yjs) export/import ──
  async exportDocument(boardId: string) {
    await this.assertMember(boardId)
    return this.request<BoardDocumentFile>(`/boards/${encodeURIComponent(boardId)}/export`, { raw: true })
  }

  /** 전체 문서를 이 스냅샷 하나로 교체한다(증분 없이). 접속 중인 세션에도 실시간 반영된다. */
  async importDocument(boardId: string, snapshotBase64: string): Promise<void> {
    await this.assertMember(boardId)
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

  /**
   * whiteboard-server 의 GET /boards/{id} (그리고 이를 내부에서 재사용하는 export/import)
   * 는 "링크 공유" 기능 때문에 멤버가 아니어도 최초 조회 시 자동으로 editor 로 등록해준다.
   * MCP 는 클라이언트를 인증하지 않는 고정 서비스 계정이라 이 자동가입 경로를 그대로 두면
   * board id 하나만 알아도(추측/유출) 임의의 다른 사용자 보드를 열람·수정할 수 있게 된다.
   * 그래서 board 를 실제로 건드리기 전에 "이미 멤버인 보드인가" 를 먼저 확인해 차단한다 —
   * listBoards() 는 이 자동가입 경로를 타지 않으므로 신뢰할 수 있는 판단 기준이다.
   */
  private async assertMember(boardId: string): Promise<void> {
    const boards = await this.listBoards()
    if (!boards.some((b) => b.id === boardId)) {
      throw new WhiteboardApiError(
        'This board is not accessible to the whiteboard-mcp service account — it was not ' +
          'created through this MCP server and hasn’t been shared with it. Use create_board, ' +
          'or add the service account as a member from whiteboard-web first.',
        403,
        'BOARD_NOT_ACCESSIBLE',
      )
    }
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
