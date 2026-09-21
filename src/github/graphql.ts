const ENDPOINT = 'https://api.github.com/graphql';
const MAX_ATTEMPTS = 4;

export type ClientStats = {
  /** 実際に送った HTTP リクエスト数。差分更新が効いているかの確認に使う */
  requests: number;
  /** リトライした回数 */
  retries: number;
  /** レスポンスヘッダから読んだ残りレート */
  rateLimitRemaining: number | null;
};

export type GraphQLClient = {
  request<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
  readonly stats: Readonly<ClientStats>;
};

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

type Options = {
  token: string;
  /** 進捗ログの出力先。省略時は何も出さない */
  log?: (message: string) => void;
};

export function createClient({ token, log }: Options): GraphQLClient {
  if (!token) {
    throw new GitHubApiError(
      'GitHub トークンがありません。環境変数 GITHUB_TOKEN を設定してください。',
    );
  }

  const stats: ClientStats = { requests: 0, retries: 0, rateLimitRemaining: null };

  async function request<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 1) stats.retries += 1;

      let response: Response;
      try {
        stats.requests += 1;
        response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            authorization: `bearer ${token}`,
            'content-type': 'application/json',
            accept: 'application/vnd.github+json',
            'user-agent': 'github-collection-meter',
          },
          body: JSON.stringify({ query, variables }),
        });
      } catch (cause) {
        // ネットワーク断。リトライ対象
        lastError = cause;
        await sleep(backoffMs(attempt));
        continue;
      }

      const remaining = response.headers.get('x-ratelimit-remaining');
      if (remaining !== null) stats.rateLimitRemaining = Number(remaining);

      if (response.status === 401) {
        throw new GitHubApiError('トークンが無効です (401)。', 401);
      }
      if (isRetryableStatus(response.status)) {
        const waitMs = retryAfterMs(response) ?? backoffMs(attempt);
        log?.(`HTTP ${response.status} を受けたので ${Math.round(waitMs / 1000)}秒 待って再試行します`);
        lastError = new GitHubApiError(`HTTP ${response.status}`, response.status);
        await sleep(waitMs);
        continue;
      }
      if (!response.ok) {
        throw new GitHubApiError(
          `GitHub API がエラーを返しました (HTTP ${response.status}): ${await safeText(response)}`,
          response.status,
        );
      }

      const body = (await response.json()) as {
        data?: T | null;
        errors?: { type?: string; message: string }[];
      };

      if (body.errors?.length) {
        const rateLimited = body.errors.some((e) => e.type === 'RATE_LIMITED');
        const detail = body.errors.map((e) => e.message).join(' / ');

        if (rateLimited) {
          const waitMs = retryAfterMs(response) ?? backoffMs(attempt);
          log?.(`レート制限に当たりました。${Math.round(waitMs / 1000)}秒 待って再試行します`);
          lastError = new GitHubApiError(detail);
          await sleep(waitMs);
          continue;
        }
        // data が返っていれば部分的な失敗。握りつぶさず警告だけ出して続行する
        if (body.data == null) throw new GitHubApiError(`GraphQL エラー: ${detail}`);
        log?.(`警告: 一部のフィールドが取得できませんでした: ${detail}`);
      }

      if (body.data == null) throw new GitHubApiError('GraphQL レスポンスに data がありません。');
      return body.data;
    }

    throw new GitHubApiError(
      `${MAX_ATTEMPTS} 回試しましたが GitHub API に到達できませんでした: ${String(lastError)}`,
    );
  }

  return { request, stats };
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (header === null) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

function backoffMs(attempt: number): number {
  // 1秒, 2秒, 4秒 … にジッタを足す
  return 2 ** (attempt - 1) * 1000 + Math.floor(Math.random() * 250);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '(本文を読めませんでした)';
  }
}
