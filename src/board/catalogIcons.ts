import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

// whiteboard-web(src/canvas/icons.ts)이 쓰는 devicon/simple-icons 매핑을 그대로 옮겨왔다 —
// 두 파일이 서로 다른 런타임(Vite 번들 vs Node)이라 공유 패키지로 뽑지 않고 수동 동기화한다.
// whiteboard-web 쪽 매핑이 바뀌면 이 파일도 같이 갱신해야 한다.
//
// 처음엔 jsdelivr CDN에서 아이콘을 직접 fetch(런타임 또는 위젯 iframe에서)했는데, ChatGPT
// 위젯 iframe 안에서 실제로 테스트해보니 외부 URL 이미지가 (CSP 로는 허용된 도메인인데도)
// 그냥 빈 흰 칸으로만 뜨는 문제가 있었다 — 반면 data: URI 로 인라인한 아이콘은 확실히 렌더링
// 되는 걸 이미 확인했다. 그래서 devicon/simple-icons 를 이 서버의 실제 npm 의존성으로 번들해
// (whiteboard-web 이 자기 프론트엔드 번들에 넣는 것과 동일한 방식) 빌드에 포함된 로컬 파일을
// 읽어 data: URI 로 인라인한다 — 런타임 네트워크 호출이 전혀 없다(빠르고, 외부 CDN 가용성에
// 의존하지 않음). 두 패키지 다 MIT 라이선스라 이렇게 번들하는 데 별도 라이선스 문제 없다.

// simple-icons 는 package.json 의 exports 맵이 "./icons/*" 서브패스만 노출하고
// "./package.json" 자체는 막아둬서, 패키지 루트 디렉터리를 먼저 구하는 방식이 아니라
// 아이콘 파일마다 그 서브패스로 직접 resolve 한다(devicon 은 exports 제한이 없어 상관없음).
const require = createRequire(import.meta.url)

const DEV_PATHS: Record<string, string> = {
  jenkins: 'jenkins/jenkins-original.svg',
  'github-actions': 'githubactions/githubactions-original.svg',
  'gitlab-ci': 'gitlab/gitlab-original.svg',
  argocd: 'argocd/argocd-original.svg',
  mysql: 'mysql/mysql-original.svg',
  postgresql: 'postgresql/postgresql-original.svg',
  mongodb: 'mongodb/mongodb-original.svg',
  redis: 'redis/redis-original.svg',
  elasticsearch: 'elasticsearch/elasticsearch-original.svg',
  cassandra: 'cassandra/cassandra-original.svg',
  'spring-web': 'spring/spring-original.svg',
  'spring-boot': 'spring/spring-original.svg',
  react: 'react/react-original.svg',
  vue: 'vuejs/vuejs-original.svg',
  angular: 'angular/angular-original.svg',
  fastapi: 'fastapi/fastapi-original.svg',
  express: 'express/express-original.svg',
  nextjs: 'nextjs/nextjs-original.svg',
  kafka: 'apachekafka/apachekafka-original.svg',
  rabbitmq: 'rabbitmq/rabbitmq-original.svg',
  nats: 'nats/nats-original.svg',
  nginx: 'nginx/nginx-original.svg',
  docker: 'docker/docker-original.svg',
  kubernetes: 'kubernetes/kubernetes-original.svg',
  terraform: 'terraform/terraform-original.svg',
  // AWS — devicon 은 통합 로고만 있어서 EC2/S3/Lambda/RDS/SQS/Kinesis/DynamoDB 모두 같은 마크.
  'aws-ec2': 'amazonwebservices/amazonwebservices-original-wordmark.svg',
  'aws-s3': 'amazonwebservices/amazonwebservices-original-wordmark.svg',
  'aws-lambda': 'amazonwebservices/amazonwebservices-original-wordmark.svg',
  'aws-rds': 'amazonwebservices/amazonwebservices-original-wordmark.svg',
  sqs: 'amazonwebservices/amazonwebservices-original-wordmark.svg',
  kinesis: 'amazonwebservices/amazonwebservices-original-wordmark.svg',
  dynamodb: 'amazonwebservices/amazonwebservices-original-wordmark.svg',
  'gcp-cloud-run': 'googlecloud/googlecloud-original.svg',
  'azure-functions': 'azure/azure-original.svg',
  grafana: 'grafana/grafana-original.svg',
  prometheus: 'prometheus/prometheus-original.svg',
  datadog: 'datadog/datadog-original.svg',
  sentry: 'sentry/sentry-original.svg',
  okta: 'okta/okta-original.svg',
  slack: 'slack/slack-original.svg',
  jira: 'jira/jira-original.svg',
  github: 'github/github-original.svg',
  gitlab: 'gitlab/gitlab-original.svg',
}

const SIMPLE_ICONS: Record<string, { slug: string; hex: string }> = {
  circleci: { slug: 'circleci', hex: '343434' },
  django: { slug: 'django', hex: '092E20' },
  istio: { slug: 'istio', hex: '466BB0' },
  jaeger: { slug: 'jaeger', hex: '66CFE3' },
  elk: { slug: 'elastic', hex: '005571' },
  keycloak: { slug: 'keycloak', hex: '4D4D4D' },
  auth0: { slug: 'auth0', hex: 'EB5424' },
  minio: { slug: 'minio', hex: 'C72E49' },
  ceph: { slug: 'ceph', hex: 'EF5C55' },
}

const dataUriCache = new Map<string, string | null>()

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`
}

/** devicon 은 이미 브랜드 색이 입혀진 파일이라 그대로 인라인한다. */
export function devIconDataUri(type: string): string | null {
  const hit = dataUriCache.get(`dev:${type}`)
  if (hit !== undefined) return hit
  const path = DEV_PATHS[type]
  if (!path) return null
  try {
    const svg = readFileSync(require.resolve(`devicon/icons/${path}`), 'utf-8')
    const dataUri = svgToDataUri(svg)
    dataUriCache.set(`dev:${type}`, dataUri)
    return dataUri
  } catch {
    dataUriCache.set(`dev:${type}`, null)
    return null
  }
}

/** simple-icons 파일 자체는 무채색이라 브랜드 hex 를 fill 로 입힌 뒤 인라인한다. */
export function simpleIconDataUri(type: string): string | null {
  const hit = dataUriCache.get(`si:${type}`)
  if (hit !== undefined) return hit
  const entry = SIMPLE_ICONS[type]
  if (!entry) return null
  try {
    const svg = readFileSync(require.resolve(`simple-icons/icons/${entry.slug}.svg`), 'utf-8')
    const colored = svg.replace(/<svg([^>]*)>/, `<svg$1 fill="#${entry.hex}">`)
    const dataUri = svgToDataUri(colored)
    dataUriCache.set(`si:${type}`, dataUri)
    return dataUri
  } catch {
    dataUriCache.set(`si:${type}`, null)
    return null
  }
}
