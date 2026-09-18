import { z } from 'zod'

// 모든 도구가 공유하는 input/output 조각들. 여기서 한 번만 정의해 input/output schema 가
// 서로 어긋나지 않게 한다.

export const anchorSchema = z.enum(['top', 'right', 'bottom', 'left'])
export const edgeStyleSchema = z.enum(['solid', 'dashed', 'dotted'])
export const edgeDirectionSchema = z.enum(['forward', 'backward', 'both', 'none'])

export const nodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  x: z.number(),
  y: z.number(),
  groupId: z.string().nullable(),
  catalogVersion: z.number(),
})

export const edgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  fromAnchor: anchorSchema.nullable(),
  toAnchor: anchorSchema.nullable(),
  label: z.string().nullable(),
  style: edgeStyleSchema,
  direction: edgeDirectionSchema,
})

export const groupSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  color: z.string().nullable(),
})

/** 그래프를 건드리는 모든 도구가 공통으로 돌려주는 필드 — 다음 호출에 넘길 토큰 + 뷰어 링크. */
export const graphRefOutput = {
  graph: z.string(),
  url: z.string(),
}

/** 이전 호출이 돌려준 graph 토큰. create_graph 로만 처음 발급받을 수 있다 — 빈 문자열은
 * 더 이상 "새 그래프"로 취급하지 않는다(의도치 않게 빈 그래프에서 다시 시작하는 실수를 막음). */
export const graphArg = z
  .string()
  .min(1)
  .describe('Graph token from a previous call. Call create_graph first if you don’t have one yet.')

export const catalogComponentSchema = z.object({
  type: z.string(),
  displayName: z.string(),
  category: z.string(),
  iconUrl: z.string(),
  defaultWidth: z.number(),
  defaultHeight: z.number(),
  anchors: z.array(z.string()),
  version: z.number(),
  deprecated: z.boolean(),
})
