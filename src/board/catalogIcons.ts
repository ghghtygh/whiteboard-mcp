// whiteboard-web(src/canvas/icons.ts)이 쓰는 devicon/simple-icons 매핑을 그대로 옮겨왔다 —
// 두 파일이 서로 다른 런타임(Vite 번들 vs Node)이라 공유 패키지로 뽑지 않고 수동 동기화한다.
// whiteboard-web 쪽 매핑이 바뀌면 이 파일도 같이 갱신해야 한다.
//
// devicon 은 브랜드 색이 이미 입혀진 "-original.svg" 파일을 jsdelivr CDN에서 직접 참조한다 —
// 위젯 iframe 이 그 요청을 직접 쏘고(CSP img-src 에 cdn.jsdelivr.net 허용돼 있음), 이 서버는
// 전혀 관여하지 않는다. simple-icons 는 파일 자체가 무채색이라 이 서버가 대신 가져와 브랜드
// hex 색을 입힌 뒤 data: URI 로 인라인한다(whiteboard-web 이 클라이언트에서 하는 것과 동일한
// 방식을 서버에서 수행).

const DEVICON_VERSION = '2.17.0'
const SIMPLE_ICONS_VERSION = '16.19.0'

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

export function devIconUrl(type: string): string | null {
  const path = DEV_PATHS[type]
  return path ? `https://cdn.jsdelivr.net/npm/devicon@${DEVICON_VERSION}/icons/${path}` : null
}

const simpleIconCache = new Map<string, { dataUri: string; expiresAt: number }>()
const TTL_MS = 5 * 60_000

/** simple-icons 는 무채색 svg라 브랜드 hex를 fill로 입힌 뒤 data: URI로 돌려준다. */
export async function simpleIconDataUri(type: string): Promise<string | null> {
  const entry = SIMPLE_ICONS[type]
  if (!entry) return null
  const hit = simpleIconCache.get(type)
  if (hit && hit.expiresAt > Date.now()) return hit.dataUri
  try {
    const res = await fetch(`https://cdn.jsdelivr.net/npm/simple-icons@${SIMPLE_ICONS_VERSION}/icons/${entry.slug}.svg`)
    if (!res.ok) return null
    const svg = await res.text()
    const colored = svg.replace(/<svg([^>]*)>/, `<svg$1 fill="#${entry.hex}">`)
    const dataUri = `data:image/svg+xml;base64,${Buffer.from(colored, 'utf-8').toString('base64')}`
    simpleIconCache.set(type, { dataUri, expiresAt: Date.now() + TTL_MS })
    return dataUri
  } catch {
    return null
  }
}
