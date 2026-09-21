/**
 * GraphQL のレート制限は「リクエストしたコネクションのノード数 / 100」でコストが決まる。
 * first に指定した値が実際の件数より多くてもその値で課金されるので、
 * 全走査クエリのページサイズは意図的に小さめにしてある。
 */

/** PR の1ページあたり件数。commits とのネストでノード数が掛け算になるので控えめに */
export const PR_PAGE_SIZE = 25;
/** 1 PR あたり何コミットまで見るか。これを超える PR は近似扱いになる */
export const COMMIT_PAGE_SIZE = 50;
/** issue は入れ子がないので大きめで良い */
export const ISSUE_PAGE_SIZE = 100;

export const VIEWER_QUERY = /* GraphQL */ `
  query Viewer {
    viewer {
      login
    }
  }
`;

/**
 * 1 クエリで取れる実績をまとめて取得する。
 * Pull Shark / Starstruck / Galaxy Brain / Public Sponsor とプロフィール情報。
 */
export const PROFILE_QUERY = /* GraphQL */ `
  query Profile($login: String!, $mergedPrQuery: String!) {
    user(login: $login) {
      login
      name
      avatarUrl(size: 128)
      # Starstruck: 自分が作った public リポジトリのうち最多スター
      repositories(
        ownerAffiliations: [OWNER]
        isFork: false
        privacy: PUBLIC
        orderBy: { field: STARGAZERS, direction: DESC }
        first: 1
      ) {
        nodes {
          nameWithOwner
          stargazerCount
        }
      }
      # Galaxy Brain: 採用された Discussions の回答数
      repositoryDiscussionComments(onlyAnswers: true, first: 1) {
        totalCount
      }
      # Public Sponsor: バッジは永続なので、既に終了したスポンサーも数える必要がある。
      # sponsorshipsAsSponsor は既定が activeOnly: true なので明示的に false にする
      # （sponsoring だと現在進行中のものしか返らず、過去のスポンサーを取りこぼす）
      sponsorshipsAsSponsor(first: 1, activeOnly: false) {
        totalCount
      }
    }
    # 突き合わせ用。検索インデックスは Copilot などの Bot が作った PR も
    # author: として拾うことがあり、走査で数えた件数と一致しないことがある。
    # Pull Shark の値そのものには使わず、meter.json に差分として残すだけ。
    search(type: ISSUE, query: $mergedPrQuery, first: 1) {
      issueCount
    }
  }
`;

/**
 * マージ済み PR の全走査。
 * search を使わないのは 1000 件上限があるため。user.pullRequests は上限なく辿れる。
 * UPDATED_AT の降順にしているのは、前回スキャン時刻に到達したら打ち切れるようにするため。
 */
export const MERGED_PRS_QUERY = /* GraphQL */ `
  query MergedPullRequests($login: String!, $cursor: String) {
    user(login: $login) {
      pullRequests(
        states: [MERGED]
        orderBy: { field: UPDATED_AT, direction: DESC }
        first: ${PR_PAGE_SIZE}
        after: $cursor
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          number
          createdAt
          closedAt
          updatedAt
          repository {
            nameWithOwner
            isPrivate
          }
          # YOLO: レビューが 0 件で、かつ自分でマージしたもの
          mergedBy {
            login
          }
          reviews(first: 1) {
            totalCount
          }
          # Pair Extraordinaire: authors は git author と Co-authored-by トレーラーを
          # 合成した一覧なので、totalCount > 1 なら共著コミット
          commits(first: ${COMMIT_PAGE_SIZE}) {
            totalCount
            nodes {
              commit {
                authors(first: 1) {
                  totalCount
                }
              }
            }
          }
        }
      }
    }
  }
`;

/** Quickdraw 判定用。PR 側で見つからなかった場合だけ使う。 */
export const CLOSED_ISSUES_QUERY = /* GraphQL */ `
  query ClosedIssues($login: String!, $cursor: String) {
    user(login: $login) {
      issues(
        states: [CLOSED]
        orderBy: { field: UPDATED_AT, direction: DESC }
        first: ${ISSUE_PAGE_SIZE}
        after: $cursor
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          createdAt
          closedAt
          updatedAt
          repository {
            isPrivate
          }
        }
      }
    }
  }
`;
