# Third-Party Notices

Markdown PMP is licensed under MIT. Fonts retain their original copyrights and licenses in `assets/licenses/fonts/`. Font binaries are complete original files: no subsetting, glyph changes or internal renaming. Names beginning with `Inkpage` in CSS are application aliases retained for compatibility.

| Font                  | Use                                | License                  | Upstream                                                |
| --------------------- | ---------------------------------- | ------------------------ | ------------------------------------------------------- |
| Latin Modern Roman 10 | Latin body text, bold and italic   | GUST Font License / LPPL | https://www.gust.org.pl/projects/e-foundry/latin-modern |
| LXGW WenKai GB        | Chinese body text                  | SIL OFL 1.1              | https://github.com/lxgw/LxgwWenKaiGB                    |
| Noto Sans             | Latin headings                     | SIL OFL 1.1              | https://github.com/notofonts/latin-greek-cyrillic       |
| Sarasa Fixed SC       | Chinese headings and code fallback | SIL OFL 1.1              | https://github.com/be5invis/Sarasa-Gothic               |
| Inconsolata           | Latin code, regular and bold       | SIL OFL 1.1              | https://github.com/googlefonts/Inconsolata              |

Original metadata, versions and SHA-256 values are in `assets/font-manifest.json`. Themed HTML embeds body-font notices; PDF embeds glyphs actually used. The build gathers notices for bundled dependencies in `assets/licenses/dependencies/`, with a machine-readable `index.json`.

Math parsing uses markdown-it-texmath 1.0.0 (MIT); rendering uses KaTeX 0.19.0 (MIT). Original math font binaries are in `assets/math/fonts/`, with the license in `assets/math/LICENSE.txt`, also embedded in math-enabled HTML. Derived CSS and rendered markup namespace `katex*` classes as `inkpage-katex*`, math counters and CSS font-family aliases to isolate other providers. Font binaries and URL filenames remain unchanged.

Default export uses basic Markdown and highlighting CSS snapshots from VS Code 1.142's built-in Markdown extension (MIT): `assets/native-markdown.css` and `assets/native-highlight.css`. The notice is `assets/licenses/vscode-markdown.txt`. Actual colors come from the current VS Code webview theme variables. Markdown PMP does not redistribute VS Code, browser binaries or VS Code language packs.

繁體中文：字型、公式引擎與相依套件保留各自授權；原始授權與版本記錄隨安裝包提供。未內含 VS Code、瀏覽器或 VS Code 語言套件。

简体中文：字体、公式引擎与依赖保留各自许可证；原始许可证和版本记录随安装包提供。未包含 VS Code、浏览器或 VS Code 语言包。
