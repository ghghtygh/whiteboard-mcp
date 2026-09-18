import { WHITEBOARD_API_ORIGIN } from './config.js'

// whiteboard-server 의 { data: T } / { error: { code, message } } 응답 계약.
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

/**
 * 이 클라이언트는 오직 save_as_board 도구(선택적 브릿지)에서만 쓰인다. 그래서 이 서버가
 * 고정으로 들고 있는 자격증명이 없다 — 호출자가 매번 자기 자신의 whiteboard-server 토큰
 * (PAT 또는 access token)을 인자로 건네고, 그 토큰의 권한으로 딱 그 한 번의 보드 생성만
 * 수행한다. 나머지 모든 그래프 mutation 도구는 이 클라이언트를 전혀 거치지 않는다.
 */
export class WhiteboardClient {
  constructor(private readonly token: string) {}

  private async request<T>(path: string, init?: { method?: string; body?: unknown; isMultipart?: FormData }): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}` }
    let body: string | FormData | undefined
    if (init?.isMultipart) {
      body = init.isMultipart
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

  createBoard(title: string) {
    return this.request<BoardDto>('/boards', { method: 'POST', body: { title } })
  }

  /** 전체 문서를 이 스냅샷 하나로 채운다(새로 만든 빈 보드에 한 번만 쓰는 용도). */
  async importDocument(boardId: string, snapshotBase64: string): Promise<void> {
    const file = {
      format: 'whiteboard-doc-v1',
      boardId,
      exportedAt: new Date().toISOString(),
      snapshot: snapshotBase64,
      updates: [] as string[],
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

/** 카탈로그(컴포넌트 타입 목록)는 whiteboard-server 에서 인증 없이 공개돼 있다(permitAll). */
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

export async function listCatalog(type?: string): Promise<CatalogComponentDto[]> {
  const res = await fetch(`${WHITEBOARD_API_ORIGIN}/api/v1${type ? `/catalog/${encodeURIComponent(type)}` : '/catalog'}`)
  const payload = (await res.json().catch(() => null)) as ApiSuccess<CatalogComponentDto[]> | ApiFailure | null
  if (!res.ok) {
    const err = payload as ApiFailure | null
    throw new WhiteboardApiError(err?.error?.message ?? `whiteboard-server request failed (${res.status})`, res.status)
  }
  return (payload as ApiSuccess<CatalogComponentDto[]>).data
}
