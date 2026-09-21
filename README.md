# github-collection-meter

GitHub のプロフィール実績が、次のティアまであと何件かを SVG のメーターにする。

GitHub は獲得済みのバッジは見せてくれるが、次のティアまでどれだけ残っているかは表示しない。
これはそのゲージを作って README に貼るためのツール。GitHub Actions が毎日走って `output/` を更新する。

```
Pull Shark  ×3                    131 / 1,024   あと 893 PR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 対応している実績

ティアは「無印 → ×2（銅）→ ×3（銀）→ ×4（金）」の4段階。表示するのは **次のティアまでの残り** で、
バーの比率も直前に達成した閾値を起点にしている（0 起点にすると 128 → 1024 の帯でバーがほぼ動かないため）。

| 実績 | 条件 | 閾値 | 取得方法 |
|---|---|---|---|
| Pull Shark | 自分が開いてマージされた PR | 2 / 16 / 128 / 1024 | PR 全走査 |
| Pair Extraordinaire | 共著コミットを含むマージ済み PR | 1 / 10 / 24 / 48 | PR 全走査 |
| Starstruck | 自作リポジトリの最多スター | 16 / 128 / 512 / 4096 | 1 クエリ |
| Galaxy Brain | Discussions で採用された回答 | 2 / 8 / 16 / 32 | 1 クエリ |
| Quickdraw | 5分以内に閉じた issue / PR | 1 | PR + issue 走査 |
| YOLO | レビューなしでマージした PR | 1 | PR 全走査 |
| Public Sponsor | GitHub Sponsors での公開スポンサー | 1 | 1 クエリ |

実際のプロフィールのバッジと突き合わせて、7つすべてが一致することを確認済み。

Heart On Your Sleeve と Open Sourcerer は GitHub 側で無効化されていて閾値も不明なため、
Arctic Code Vault と Mars 2020 は新規取得できないため、いずれも対象外。

実績は **public リポジトリの活動しか数えない** ので、集計も public に絞っている。

## セットアップ

1. このリポジトリを自分のアカウントに置く
2. Settings → Actions → General → Workflow permissions を **Read and write permissions** にする
   （`output/` へのコミットに必要）
3. Actions タブから **Update meter** を `workflow_dispatch` で一度手動実行する
4. 生成された `output/` の SVG を README から参照する

トークンは Actions 既定の `GITHUB_TOKEN` で足りる。レート制限に余裕が欲しい場合だけ、
PAT を `PERSONAL_TOKEN` という名前のシークレットに入れると自動でそちらを使う。
**PAT にスコープは要らない**（public のデータしか読まないため、classic PAT でチェックを
一つも入れない状態で全7実績が取得できることを確認済み）。

> `GITHUB_TOKEN` の持ち主は `github-actions[bot]` なので、対象ユーザーの指定は省略できない。
> ワークフローでは `--user ${{ github.repository_owner }}` を渡している。

## README への貼り方

OS のテーマと GitHub のテーマは一致しないことがあるので、確実に合わせるなら `<picture>` を使う。

```html
<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="https://raw.githubusercontent.com/OWNER/github-collection-meter/main/output/meter-dark.svg">
  <img
    src="https://raw.githubusercontent.com/OWNER/github-collection-meter/main/output/meter-light.svg"
    alt="GitHub 実績メーター">
</picture>
```

1枚で済ませたいなら `meter.svg`（`prefers-color-scheme` で自動切替）。

```markdown
![GitHub 実績メーター](https://raw.githubusercontent.com/OWNER/github-collection-meter/main/output/meter.svg)
```

実績ごとの小さいバッジも出る。

```markdown
![](https://raw.githubusercontent.com/OWNER/github-collection-meter/main/output/badges/pull-shark.svg)
```

GitHub は画像を camo でキャッシュするので、更新が反映されるまで少し時間がかかることがある。

## 出力

| パス | 中身 |
|---|---|
| `output/meter.svg` | 統合カード（テーマ自動切替） |
| `output/meter-light.svg` / `meter-dark.svg` | `<picture>` 用 |
| `output/badges/*.svg` | 実績ごとのバッジ |
| `output/meter.json` | 集計結果の生データ |
| `.cache/state.json` | 差分更新用のキャッシュ |

## ローカルで動かす

```bash
npm ci
npm run build
GITHUB_TOKEN=<your token> node dist/cli.js --user <login>
```

主なオプション:

| オプション | 既定 | 説明 |
|---|---|---|
| `--user <login>` | トークンの持ち主 | 対象ユーザー |
| `--out <dir>` | `output` | 出力先 |
| `--cache <path>` | `.cache/state.json` | キャッシュの場所 |
| `--full` | off | キャッシュを無視して全走査する |
| `--theme auto\|light\|dark` | `auto` | `meter.svg` のテーマ |
| `--no-avatar` | off | アバターを埋め込まない |

設定は `meter.config.json` で変えられる（表示する実績と並び順、`locale` の `ja` / `en`、アバターの有無）。

## 差分更新について

Pair Extraordinaire / Quickdraw / YOLO は、マージ済み PR を1件ずつ見てコミットの `Co-authored-by` や
レビュー数を調べないと数えられない。GitHub の検索 API は 1000 件で打ち止めになるので、
`user.pullRequests` を `UPDATED_AT` の降順で辿っている。

この順序のおかげで、前回の走査完了時刻より古い PR に到達した時点で「残りはすべて走査済み」と分かる。
結果を `.cache/state.json` に持っておけば、2回目以降は更新のあった PR だけを取り直せば済む。
Quickdraw は一度達成したら取り消されないので、`true` になった時点でキャッシュに焼いて以降は調べない。

キャッシュが壊れたり実績の数え方を変えたときは `--full` で作り直す。

`.cache/state.json` は public リポジトリにコミットされるので、**private リポジトリの PR は
そもそも保存しない**。実績は public しか数えないので集計には影響しないが、保存すると
非公開のリポジトリ名と PR 番号が公開リポジトリに載ってしまうため。

## 数値の精度

**ここに出るのは GitHub API から算出した推定値**で、GitHub 内部のカウントとは差が出ることがある。

- GitHub 側には不正防止のフィルタや反映ラグがあり、その詳細は公開されていない
- 1 PR あたり 50 コミットまでしか見ていないので、それを超える PR で共著コミットが後ろにある場合は
  取りこぼす。その場合は件数に `≈` が付く
- キャッシュに残っている PR が後から削除・非公開化されても気づけない（`--full` で直る）

### 実装時に踏んだ落とし穴

同じ数を出すつもりの API が違う値を返す箇所が2つあった。どちらも実際のプロフィールと
突き合わせて初めて分かったもので、ユニットテストでは検出できない。

**Pull Shark は検索 API を使わない。** 検索の `author:` は Copilot coding agent が作った PR も
本人のものとして拾う。GraphQL の `author` も REST の `user` も作成者を Bot と答えるのに、
検索インデックスだけが人間に帰属させている。Pull Shark の条件は「自分が開いた PR」なので、
作成者を確認できる `user.pullRequests` から数えている。検索の件数は `meter.json` の
`crossCheck` に残してあるので、食い違ったときは気づける。

**Pair Extraordinaire は PR 単位で数える。** 「共著コミットの数」なのか「共著コミットを含む
マージ済み PR の数」なのか、GitHub に公式の説明がなく、非公式の一覧も 食い違っている。
PR 単位と判断した根拠は3つ。実績を自動取得するツール群がいずれもティアを「10 PRs / 24 PRs /
48 PRs」と書き、共著コミット1つにつき PR を1本作る設計になっていること（コミット単位なら
48 個を1本の PR に詰めれば済むのに誰もそうしていない）。共著コミットを150件以上持つ利用者が
×3（24）で止まっているという報告があること。以上から PR 単位で実装している。

**Public Sponsor は `sponsoring` では取れない。** このフィールドは進行中のスポンサーしか返さず、
過去にスポンサーして今は停止している場合は 0 になる。バッジ自体は永続なので、
`sponsorshipsAsSponsor(activeOnly: false)` を使って終了したものも数えている。

## 開発

```bash
npm test        # node:test
npm run typecheck
```

`test/collect.test.ts` は `fetch` を差し替えて、差分更新が本当に効いているか
（2回目のリクエスト数が減るか、全走査と結果が一致するか）を検証している。
