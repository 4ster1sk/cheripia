# Cheripia `feat/mahjong` CPU対戦・API/WebSocket検証レポート

> 追記 (2026-11-09): このレポートは**修正前**の検証記録です。指摘した不具合は以下のコミットで修正し、修正後に20ケースのターゲットテストと10ゲームの再対戦を実施して全項目パスを確認しました。修正後の結果は末尾「9. 修正後の再検証」を参照してください。

## 1. 実施条件

- 元ブランチ: `feat/mahjong` (`5b2bf49be2 fix: 次局で点数が席の移動に追従しない問題を修正`)
- 検証ブランチ: `test/mahjong-cpu-verify`
- worktree: `/home/ast/cheripia-dev/.worktrees/mahjong-verify`
- backend: 同worktreeをNode v26.12.1でビルドし、`http://127.0.0.1:3000` で起動
- DB: PostgreSQL 17 (127.0.0.1:5432)、Redis (127.0.0.1:6379)
- 対戦形式: 人間1人 + CPU 3人、東風4局、API (`mahjong/*`) と WebSocket (`mahjongRoom`) のみ使用
- 10ゲーム: `calls`戦略4局、`win`戦略3局、`mixed`戦略3局
- 追加のターゲットテスト: 19ケース（点数、鳴き、槓、反則操作）
- サブエージェント: 4本（calls 4局、win 3局、mixed 3局、独立コードレビュー）

## 2. 10ゲームの結果

| 項目 | 結果 |
|---|---|
| 完走 | 10/10 `ended=true`、error/timeout 0 |
| 鳴き | 146回（ポン95、カン5、チー46） |
| 自分の鳴き | 80回（ポン32、カン2、チー46） |
| CPUの鳴き | 66回（ポン63、カン3、チー0） |
| 鳴きの牌チェック | 失敗0（自分のポンは手牌に2枚、カンは3枚、チーは使用2牌を保持） |
| チーの下家制約 | 29/29 正常（`callee === prevHouse(caller)`） |
| 和了 | 17回（ロン14、ツモ3）。すべて人間側。CPUの和了は0 |
| 和了形・役 | shape失敗0、yakuError 0 |
| 点数の適用 | サーバー計算値と実際の点数移動の不一致0 |
| 標準麻雀との点数差 | 17和了中6件（符・ドラ・端数の問題） |
| 席移動 | 全ゲームで点数が席移動に追従 |
| 点数和 | 全ゲーム・全局で100000 |
| 既存ユニットテスト | 87件すべて成功（ただし符無視の簡易値も固定） |

CPUは10ゲームで和了0回だった。CPUは毎ターン「引いた牌をそのまま捨てる」実装で、リーチ・チーも行わないため、実戦ではほとんど和了に近づかない。ただしCPUのロン/ツモ経路自体は個別fixtureで正常動作を確認した（後述）。

## 3. 正常だった点

- 手牌にある牌だけを使ったポン（2枚）、大明槓（3枚）、チー（2枚）は正しく成立。
- チーは前のプレイヤーの捨て牌からのみ成立。
- 大明槓でドラ表示が1枚増え、嶺上牌が手牌に入る。
- ロン/ツモの和了形判定と役判定は、実ゲーム17和了で失敗なし。
- 和了による点数移動は、サーバー内部の計算値と完全に一致（`engineMatchesActual=true`）。
- 次局の席移動に点数が追従（`commit_nextKyoku` の修正は有効）。
- 点数和は常に100000。
- CPUのロン、CPUの通常ツモ、CPUの副露ありツモ（チー+順子+雀頭）はfixtureで正常動作。

## 4. 重大な不具合

### 4.1 点数計算が標準麻雀と一致しない（高）

`packages/misskey-mahjong/src/common.ts:316-350` の `fanToPoint` / `calcPoint` は**符を一切使わず、翻数だけで点数を決める**。`calcTsumoHoraPointDeltas` (`:379-413`) も同様。

実測例（ターゲットテスト、すべてサーバーAPI/WS経由）:

| 手 | 標準 | サーバー |
|---|---:|---:|
| 親2翻30符ロン | 2900 | **3000** |
| 子2翻40符ロン | 2600 | **2000** |
| 子3翻40符ロン | 5200 | **4000** |
| 親3翻30符ロン | 5800 | **6000** |
| 子1翻40符ツモ | 親700/子400（計1500） | **親500/子250（計1000）** |
| 子2翻40符ツモ | 親1300/子700（計2700） | **親1000/子500（計2000）** |
| 子4翻30符ロン（切り上げなし） | 7700 | **8000**（切り上げ満貫相当） |

特に子1翻40符ツモでは**250点**という100点単位でない支払いが発生する（`Math.ceil(point/4)` をそのまま使用）。実ゲームでも `verify-calls-A-game3` の1翻30符ツモで、標準1100点のところ1000点（子250点ずつ）を確認。

### 4.2 副露内の通常ドラが常に0（高）

`common.ts:352-363` の `calcOwnedDoraCount` は、`huros` の `tiles` が**TileId（数値）**なのに、`doras` の**TileType（文字列）**と比較している。このため、ポン・チー・明槓・暗槓に入った通常ドラはすべて0枚と計算される。

- 公式10ゲームの例: `verify-calls-A-game1` 東1、親eのロン。
  - 役: 場風e + 自風e = 2翻、ドラ表示牌 n → ドラ e。
  - 副露: e のポン（3枚）＝ドラ3枚。
  - 標準: 5翻40符の親ロン = **12000点**。
  - 実際: **3000点**（エンジンは2翻・ドラ0として計算）。
- ターゲットテスト `meld-dora-pon`: ポンしたm5がドラ3枚、役2翻+ドラ3=5翻の標準**8000点**が、実際は**2000点**。
- デバッグゲームでも `debug-calls-game1` 東3、`debug-par-game2` 東2 で、副露ドラ1枚分が抜けて標準4000点が2000点になる例を確認。

### 4.3 加槓（kakan）で元のポンが残る（高）

`packages/misskey-mahjong/src/engine.master.ts:629-651` は、`minkan` を `push` するだけで元の `pon` を削除していない。加槓後の `huros` は「ポン + ミンカン」の2面子になり、手牌枚数と面子数の合計が17枚相当になる。

- 加槓後のツモ和了は `Not an agari hand` / `Invalid tile count` で失敗。
- UI/観戦では同じ牌のポンとミンカンが重複表示される。
- ドラ計算修正後はポン3枚+ミンカン4枚の二重計上、赤ドラも二重計上になる。

API/WS fixture `kakan-duplicate-pon` で実際に再現:

```text
huros = [
  { type: "pon",    tiles: [18,19,20],       from: "e" },
  { type: "minkan", tiles: [17,18,19,20],    from: "e" }
]
```

### 4.4 暗槓/加槓に手番チェックがない（高）

`engine.master.ts:629-683` の `commit_kakan` / `commit_ankan` には `turn === house` のチェックがない。さらに `rinshanTsumo()` は `this.$state.turn` の手牌に嶺上牌を追加するため、他家の手番中に暗槓すると**嶺上牌が現在の手番プレイヤーに入る**。

API/WS fixture `out-of-turn-ankan`（turn=e の状態で s が暗槓）:

```text
実行前: e手牌13, s手牌14, turn=e
実行後: e手牌14, s手牌10, turn=e
```

槓した本人の手牌が4枚減り、無関係なeの手牌が1枚増える。ゲーム状態が破壊される。

### 4.5 リーチ中でもポン/チー/カンが受理される（高）

`MahjongService.ts:588-597` はリーチ中の回答を `false` で初期化しているが、`updateAnswerLocked` (`:831-844`) と `commit_pon/cii/kan` (`:855-880`) はリーチ状態を再チェックせず、`true` に上書きできる。

API/WS fixture:

- `illegal-riichi-pon`: リーチ中のsがポンに成功し、`huros.s` にポンが追加された。
- `illegal-riichi-chi`: リーチ中のsがチーに成功した。

リーチ+副露の状態になると、以後の他家の `commit_dahai` が `Invalid riichi state with call huros` で失敗し、ゲームが停止し得る。

### 4.6 不正なチーパターンでゲームが停止する（中）

`engine.master.ts:855-902` は指定された `x__/_x_/__x` の牌が手牌にない場合に `throw new Error()` する。`MahjongService` の asking 解決は例外をcatchしてログを出すだけで、`turn=null` / `askings.cii` を残したままにする。

API/WS fixture `invalid-chi-pattern`:

```text
送信: cii { pattern: "x__" }（手牌にm5がない）
結果: ciiedイベントなし
状態: turn=null, askings.cii={callee:"e", caller:"s"} のまま
```

改造クライアントが1回不正なパターンを送るだけで、その局が進行不能になる。

## 5. その他の確認事項（コード/エンジンレベル）

- `commit_dahai` は門前チェックなしでリーチを受け付ける（副露済みでも `riichis=true` にできる）。`engine.master.ts:486-510`。
- `commit_kakan` は手牌にない牌IDを渡すと `indexOf` が `-1` になり、`splice(-1, 1)` で手牌末尾が消える（`engine.master.ts:634`）。
- ポン/チー直後、まだツモっていない11枚の手牌でも `commit_tsumoHora` が和了形なら成功する（状態遷移の検証不足）。
- `isAgarikei` は14枚を要求せず、11/8/5/2枚でも「3n面子+雀頭」なら true になる。このためCPUの副露ありツモは偶然正しく動くが、加槓で `huros` が壊れた場合は誤検知する。
- 槓後の `PlayerGameEngine`（クライアント側）は `doraIndicateTiles` を更新しないため、槓直後のドラ表示が古いままになる。
- `ankanned` イベントは他家にも実際の暗槓牌IDを送っている（表示上は伏せているが、WebSocketメッセージには含まれる）。
- 槍槓、リーチ供託、本場、流局罰符、食い替え、一時振聴などは未実装または簡略化。

## 6. サブエージェント結果との整合

- calls担当（4ゲーム）: 79鳴き、失敗0。自分のポン20/20で2枚、カン2/2で3枚、チー29/29で下家制約と使用牌を確認。カン4回のドラ増加と嶺上牌も確認。
- win担当（3ゲーム）: 6和了、shape/yaku失敗0。符を独立補正すると1翻40符ロンの2件が標準1300点に対し1000点。
- mixed担当（3ゲーム）: 41鳴き、失敗0。5和了就中2件が標準と不一致（親2翻30符、子4翻30符）。
- 独立コードレビュー担当: 符無視、1翻ツモの250点、副露ドラ0、加槓のポン残留、暗槓/加槓の手番チェック欠如、リーチ中の副露受理、副露リーチなどを独立に確認。`isAgarikei` の「副露ありでツモ不可」という当初の疑いは**再現せず**、CPUの副露ありツモは正常と判定。

## 7. 成果物

- 10ゲーム集計:
  - `/tmp/opencode/mahjong-test/results/verify-calls-A-aggregate.json` (4 games)
  - `/tmp/opencode/mahjong-test/results/verify-win-B-aggregate.json` (3 games)
  - `/tmp/opencode/mahjong-test/results/verify-mixed-C-aggregate.json` (3 games)
  - `/tmp/opencode/mahjong-test/results/combined-10games.json`
- 各ゲーム詳細: `/tmp/opencode/mahjong-test/results/verify-*-game*.json`
- ログ: `/tmp/opencode/mahjong-test/logs/verify-*.log`
- ターゲットテスト: `/tmp/opencode/mahjong-test/fixture-results/final4.log`
- ハーネス: `/tmp/opencode/mahjong-test/harness/`
- 独立検証スクリプト: `/tmp/opencode/mahjong-verify/score.mjs`, `/tmp/opencode/mahjong-verify/state.mjs`
- サーバーログ: `/tmp/opencode/mahjong-test/server.log`

## 8. 判定

- 鳴き・和了の基本動作: **概ねOK**（合法手の牌チェック、チーの下家制約、大明槓のドラ/嶺上、ロン/ツモの和了形・役）。
- 点数計算: **NG**（符無視、1翻ツモの端数、副露ドラ0）。標準麻雀の点数を提供する要件なら修正必須。
- 状態管理: **NG**（加槓のポン残留、暗槓/加槓の手番チェック欠如、リーチ中の副露受理、不正チーパターンでの停止）。
- CPU対戦: 10ゲーム完走。CPUのロン/ツモ経路は動作するが、実戦では毎ツモ切り・リーチなし・チーなしのため和了0回。AIの打牌戦略は改善余地が大きい。

優先修正候補:
1. 符計算を実装し、`PointFactor` に符を追加して `calcPoint` / `calcTsumoHoraPointDeltas` を標準式に変更。
2. `calcOwnedDoraCount` の副露牌をTileId→TileTypeに変換。
3. `commit_kakan` で元のポンを削除してミンカンに置換。
4. `commit_ankan` / `commit_kakan` に手番チェックを追加し、嶺上牌を実行者に配る。
5. リーチ中のポン/チー/カンと副露リーチをサーバー側で拒否。
6. チーパターンを解決前に検証し、不正時は安全に拒否。
7. CPUの打牌をシャンテン/受入に基づく選択に変更（現状は常にツモ切り）。
8. 既存テストに符・副露ドラ・加槓・手番外槓・リーチ中鳴きのケースを追加。

## 9. 修正後の再検証

修正コミット:

| コミット | 内容 |
|---|---|
| `623e9081ff` | 符ベースの標準点数計算、副露ドラの修正 |
| `92311f0767` | 加槓・暗槓・リーチ・チーの状態管理修正 |
| `66ee093e56` | カン後のドラ表示更新 |
| `f537b5ee7d` | 流局前の最終捨て牌を `dahai` として通知 |
| `cdd81ee4a3` | ロン/ポン/チー/カンの回答排他 |
| `cc4c85995c` | 鳴き10秒・次局確認15秒の共有定数とUIタイマー |
| `1f98fdfd94` | リーチ中のポン/チー/カン選択肢を非表示 |

修正後の確認:

- ターゲットテスト: **20/20 pass**
  - 点数: 親2翻30符=2900、子2翻40符=2600、子3翻40符=5200、親3翻30符=5800、子1翻40符ツモ=1500、子2翻40符ツモ=2700、子4翻30符=7700、副露ドラ=8000
  - 状態: 加槓のポン置換、手番外暗槓の拒否、リーチ中鳴きの拒否、不正チーの安全な不成立、リーチ中選択肢の非表示
  - カン: 大明槓のドラ表示牌増加とクライアントイベント
  - 流局: `dahai` → `ryuukyoku` の順で最終捨て牌を通知
  - ロン: ロン+チー可能な状態でロンだけ送信 → 約503msで成立
  - CPU: CPUロン、通常ツモ、副露ありツモ
- 10ゲーム再対戦: **10/10完走、0エラー**
  - 鳴き137回（ポン87、チー47、カン3）、call検証失敗0
  - 和了14回（ロン10、ツモ4）、和了形・役失敗0
  - 点数の適用不一致0、標準点数不一致0
  - 席移動失敗0、点数和失敗0
- ユニットテスト: `misskey-mahjong` 143件、backend `MahjongService` 7件、frontend typecheck成功

再検証の成果物:
- `/tmp/opencode/mahjong-test/fixture-results/final-last.log`
- `/tmp/opencode/mahjong-test/results/postfix-10games-combined.json`
- `/tmp/opencode/mahjong-test/results/postfix-*-aggregate.json`
