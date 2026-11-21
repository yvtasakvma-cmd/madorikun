# まどりくん v1.0.0

- ソースのタグは `v1.0.0`、コミットは `5b51772f464a065510fd9c48e3ce3bfc2b7210f6`。
- 公開ビルドのタグは `v1.0.0-pages`、コミットは `5ab0534bcc9920c9e97edb510e0ec997fb687cde`。
- ビルドの ZIP を展開すると、公開時の `index.html` と静的ファイルが得られます。GitHub Pages と同様に HTTP で配信できます。
- サンプル図面には床、壁、窓、アコーディオンカーテン、キッチン、浴槽、トイレ、文字が入っています。窓の右側にある壁の継ぎ目をまたいで、ハサミの動作を比較できます。

## 公開版を戻すとき

復元用タグのツリーを、現在の `gh-pages` に続く新しいコミットとして公開します。実行前に `origin` がまどりくんの GitHub リポジトリを指すことを確認してください。

```bash
git fetch origin refs/heads/gh-pages:refs/remotes/origin/gh-pages
git fetch origin refs/tags/v1.0.0-pages:refs/tags/v1.0.0-pages
madori_current_pages="$(git rev-parse refs/remotes/origin/gh-pages)"
madori_saved_tree="$(git rev-parse 'v1.0.0-pages^{tree}')"
madori_restore="$(git commit-tree "$madori_saved_tree" -p "$madori_current_pages" -m 'Restore madorikun v1.0.0')"
git push origin "$madori_restore:refs/heads/gh-pages"
```
