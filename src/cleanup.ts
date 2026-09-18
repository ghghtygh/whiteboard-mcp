import { WhiteboardClient } from './whiteboardClient.js'
import { BOARD_TTL_MINUTES, CLEANUP_INTERVAL_MINUTES, WHITEBOARD_SERVICE_TOKEN } from './config.js'

/**
 * 보드를 1회용으로 유지하기 위한 백그라운드 정리. list_boards 도구가 없어 "발견"은 막았지만,
 * id 를 아는 상태로 무기한 남아있으면 로그·대화 이력 유출 등으로 뒤늦게 노출될 수 있다.
 * 그래서 일정 시간 아무도 손대지 않은(updatedAt 기준) 서비스 계정 보드는 주기적으로 지운다.
 */
export function startBoardCleanup(): void {
  const client = new WhiteboardClient(WHITEBOARD_SERVICE_TOKEN)
  const ttlMs = BOARD_TTL_MINUTES * 60_000
  const intervalMs = CLEANUP_INTERVAL_MINUTES * 60_000

  async function sweep(): Promise<void> {
    let boards
    try {
      boards = await client.listBoards()
    } catch (err) {
      console.error('board cleanup: failed to list boards', err)
      return
    }

    const now = Date.now()
    for (const board of boards) {
      const age = now - new Date(board.updatedAt).getTime()
      if (age < ttlMs) continue
      try {
        await client.deleteBoard(board.id)
        console.log(`board cleanup: deleted stale board ${board.id} (idle ${Math.round(age / 60_000)}m)`)
      } catch (err) {
        console.error(`board cleanup: failed to delete board ${board.id}`, err)
      }
    }
  }

  void sweep()
  setInterval(() => void sweep(), intervalMs)
}
