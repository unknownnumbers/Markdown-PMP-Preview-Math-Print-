# Markdown PMP (Preview-Math-Print)

[English](#english) / [Traditional Chinese](#traditional-chinese) / [Simplified Chinese](#simplified-chinese)

## English

Markdown PMP adds reading themes, offline math and HTML / PDF / PNG / JPEG export to VS Code's built-in Markdown preview. Body fonts for the three PMP themes and math fonts are included.

### Getting started

1. In the Extensions view, choose **... -> Install from VSIX...** and select the `.vsix` file.
2. Open a Markdown file and press **Ctrl+K, then V** to open the side preview.
3. Run **Markdown PMP: Select Preview Theme**, or click the theme name in the status bar.
4. Use **Markdown PMP: Open Preview Sample** to see headings, links, tables and formulas.

Command menus and setting descriptions use English. Export forms and messages follow VS Code's display language, with English (`en`), Traditional Chinese (`zh-TC`) and Simplified Chinese (`zh-SC`) supported. Use **Configure Display Language** to change the display language.

### Large documents

With `Markdown-PMP.largePreview.enabled` enabled (the default), VS Code's preview buttons, preview commands and existing shortcuts automatically open continuous preview for Markdown files with at least 256,000 characters. Smaller files keep the native preview.

Set `Markdown-PMP.preview.usePmpForAllFiles` to `true` to use PMP preview for small files as well. This setting defaults to `false` and takes priority over `Markdown-PMP.largePreview.enabled`. Small preview tabs show the filename alone; large ones keep the `Long Preview-` prefix. Changing these settings also updates previews opened through VS Code's preview buttons and commands.

Content loads automatically as you scroll, keeping the page responsive for long lists and tables. **Find / Ctrl+F** searches the whole document, and **Headings** jumps between sections. The editor and preview follow each other's scrolling, controlled by VS Code's `markdown.preview.scrollPreviewWithEditor` and `markdown.preview.scrollEditorWithPreview` settings. Exports include the whole document.

**Markdown PMP: Toggle Source/Preview in Current Tab** (`Markdown-PMP.togglePreview`) switches the current tab in place. It follows the preview settings above and keeps previews in other editor groups open.

On Windows, `Markdown-PMP.nativePreview.suppressAltMenus` and `Markdown-PMP.preview.suppressAltMenus` default to `true`. They independently prevent Alt+E and Alt+S from also opening menus in native and PMP previews. Both keys continue to follow your VS Code keybindings; their menu mnemonics are unavailable in the corresponding view while enabled.

This view uses PMP's Markdown renderer, themes and math settings. Default follows VS Code's colors and Markdown preview fonts. Other extensions' preview scripts and additional syntax are supported in the native preview. Set both `Markdown-PMP.preview.usePmpForAllFiles` and `Markdown-PMP.largePreview.enabled` to `false` to use native preview through VS Code's standard preview buttons and commands.

### Editor commands

**Forward Search in PMP Preview** (`Markdown-PMP.forwardSearch`) opens or reuses a PMP preview to the right of the source editor. For ordinary text, it uses nearby text to locate the word around the source cursor. Formulas, tables and complex content use the corresponding source block. The theme-colored indicator briefly marks the target while source focus stays in the editor. This command explicitly opens PMP preview for files of any size; the automatic preview settings continue to control VS Code's preview buttons and commands.

`Markdown-PMP.preview.forwardSearchIndicator` selects the location indicator: `rectangle` (default) highlights the target word or block for about 1 second; `circle` shows an expanding ring that fades out over 0.5 seconds. Both follow the preview theme color.

**Export PDF Beside Markdown** (`Markdown-PMP.exportPdfBeside`) writes `filename_md.pdf` beside the Markdown file and updates that PDF on subsequent runs. It uses the current buffer, including unsaved edits, and the configured print settings. Untitled documents must be saved first. Export completion shows a notification with an option to open the PDF.

Optional bindings for Alt+B (PDF), Alt+E (current-tab toggle) and Alt+S (forward search) are provided in `examples/keybindings.json`. Replace any earlier Markdown Alt+S rule with the Alt+S entry, and append the other entries to your user keybindings array. Double-click navigation to source is enabled by default through `markdown.preview.doubleClickToSwitchToEditor`; an explicit `false` disables it. In PMP preview, ordinary text returns near the clicked word, centers the source cursor and marks its line for 0.5 seconds. Formulas and complex content return to the corresponding source block. Side previews stay open; same-tab previews reopen as text. PMP contributes commands without installing default keyboard bindings.

### Themes and settings

| Theme      | Setting value | Description              |
| ---------- | ------------- | ------------------------ |
| Default    | `default`     | VS Code default theme    |
| Purple     | `purple`      | Purple theme             |
| Blue-White | `blue`        | Blue theme               |
| Blue-Red   | `redblue`     | Blue theme & red accents |

Default is selected initially and follows the native preview's colors, fonts and layout. The three PMP themes use a white background, bundled body fonts, six heading levels and underlined links. One theme applies to the whole window. Math preview has a separate switch and is available in every theme.

Run **Markdown PMP: Open Extension Settings**, search for `Markdown-PMP` in Settings, or edit `settings.json`:

```json
{
  "Markdown-PMP.theme": "default",
  "Markdown-PMP.fontSize": 23,
  "Markdown-PMP.lineHeight": 1.7,
  "Markdown-PMP.maxWidth": 900,
  "Markdown-PMP.math.preview.enabled": true,
  "Markdown-PMP.math.export.enabled": true,
  "Markdown-PMP.math.delimiters": ["dollars", "brackets"],
  "Markdown-PMP.math.macros": { "\\RR": "\\mathbb{R}" }
}
```

`fontSize` (px), `lineHeight` and `maxWidth` (px) control the PMP themes. Default follows `markdown.preview.*` settings. PDF body size is set separately by `Markdown-PMP.pdf.fontSize` (pt).

### Math

Preview and export use KaTeX with shared math settings. The default delimiter array supports `$x$`, `$$x$$`, `\(x\)` and `\[x\]` together. A manual equation number can follow a display formula, for example `$$E=mc^2$$ (1)`. Code and escaped `\$` remain ordinary text.

- `Markdown-PMP.math.preview.enabled` controls PMP math in previews. When disabled, the native preview can use another math provider; the continuous preview shows formulas as ordinary Markdown.
- `Markdown-PMP.math.export.enabled` controls math rendering during export. Disabling it exports formulas as ordinary Markdown text.
- `Markdown-PMP.math.fallbackToCode` defaults to `true`: formulas that cannot render are shown as literal code, including their original delimiters, while preview and export continue. Set it to `false` for error details in preview and to stop export on a formula error.
- `Markdown-PMP.math.macros` stores custom macros.
- `Markdown-PMP.math.outerspace` requires spaces around single-dollar inline math when enabled; it defaults to `false`.

Delimiter modes also include `gitlab`, `julia` and `kramdown`, tried in array order. Use either `dollars` or `kramdown`, and either `gitlab` or `julia`, within one configuration.

To import an existing mdmath configuration, run **Markdown PMP: Import mdmath Settings**. This imports delimiters, macros and `outerspace`, including the contents of a configured macro file. Check the formulas, then keep one math preview provider enabled.

Wide formulas scroll horizontally in preview and HTML. PDF and image export can shrink them to 80%; formulas that still do not fit are kept as literal code. With `Markdown-PMP.math.fallbackToCode` set to `false`, export stops and reports the source line instead. Split the formula across lines or increase the page or image width to keep its rendered layout.

### Export

Use the **Markdown PMP Export** submenu or the Command Palette:

| Command                              | Output                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Export HTML                          | HTML with embedded styles, local images and fonts. Default uses the preview font family.                    |
| Export PDF                           | PDF with selectable text and clickable links. Defaults to A4 portrait, 20 mm margins and 12 pt body text.   |
| Export PNG Image / Export JPEG Image | Long image, laid out at 900 px and rendered at 2x resolution by default, giving an output width of 1800 px. |
| Export with Settings...              | Adjust options for one export, with an option to save them as defaults.                                     |

HTML can be generated directly. PDF and image export use a locally installed Edge or Chrome. If automatic detection fails, set `Markdown-PMP.browserPath` to its executable path.

Large PDFs are laid out in sections and assembled into one file with continuous page numbers, bookmarks and internal links. Progress shows the current section. Tables fit the printable width, and rows taller than one page can continue onto the next page.

Default exports follow the preview's colors and fonts, including dark backgrounds. Fonts for Default are supplied by the reading environment; the three PMP themes embed their body fonts in HTML. Local images are embedded, while remote images retain their URLs and require network access. A missing local image stops export and reports its path.

PNG is lossless; JPEG quality defaults to 90. Very long documents split into numbered images, with breaks placed between content blocks where possible.

Export includes unsaved edits and requires a trusted workspace. Preview themes remain available in Restricted Mode.

### Export settings

PDF options use the `Markdown-PMP.pdf.*` prefix:

| Setting            | Purpose                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `paper`            | A3, A4, A5, Letter, Legal, Tabloid or Custom                          |
| `width`, `height`  | Custom paper dimensions in mm                                         |
| `landscape`        | Landscape orientation                                                 |
| `margins`          | Top, right, bottom and left margins in mm                             |
| `fontSize`         | Body font size in pt; defaults to 12                                  |
| `scale`            | Overall print scale                                                   |
| `pageRanges`       | Pages to export, such as `1-5,8`; empty exports all pages             |
| `header`, `footer` | Arrays of `filename`, `date` and `pageNumber`; `[]` disables the area |

The footer shows page numbers by default. Headers and footers require at least 12 mm of margin on the corresponding side.

Image settings are `Markdown-PMP.image.width` (layout width in px), `Markdown-PMP.image.scale` (resolution multiplier) and `Markdown-PMP.image.jpegQuality` (1-100). PDF page settings and image dimensions are configured separately.

### Compatibility

Other preview themes or custom styles may override the preview's appearance. Export supports Markdown, tables, syntax highlighting, task lists, footnotes and KaTeX formulas. Third-party extensions' additional syntax and styles may not be fully supported by the exporter.

Currently verified only on Windows with VS Code 1.142 and 1.143.

### Files and source build

Inside the VSIX archive, the `extension/` directory contains:

| Path within `extension/` | Purpose                            |
| ------------------------ | ---------------------------------- |
| `assets/preview.css`     | Shared preview layout              |
| `assets/theme.css`       | Shared export layout               |
| `assets/fonts.css`       | Body font styles                   |
| `assets/math/math.css`   | Math styles                        |
| `dist/extension.cjs`     | Extension logic and theme palettes |
| `assets/licenses/`       | Font and dependency licenses       |

The three PMP themes share CSS layout rules. Their color palettes are defined in `src/theme.cjs` and bundled into `dist/extension.cjs`.

Build from source with Node.js 20.11+ and pnpm:

```text
pnpm install --frozen-lockfile
pnpm run build:l10n
pnpm run build
pnpm test
pnpm run package
```

## Traditional Chinese

Markdown PMP 為 VS Code 原生 Markdown 預覽提供閱讀主題、離線公式, 以及 HTML/PDF/PNG/JPEG 匯出. 三套 PMP 主題的正文字型與數學字型均已內含.

### 開始使用

1. 在擴充功能面板選擇 **... -> 從 VSIX 安裝...**, 選取 `.vsix` 檔案.
2. 開啟 Markdown 檔案, 按 **Ctrl+K, 再按 V** 開啟側邊預覽.
3. 執行 **Markdown PMP: Select Preview Theme**, 或點選狀態列的主題名稱.
4. 執行 **Markdown PMP: Open Preview Sample**, 查看標題、連結、表格與公式範例.

命令選單與設定說明使用英文. 匯出設定頁與訊息跟隨 VS Code 顯示語言, 支援 English (`en`)、Traditional Chinese (`zh-TC`) 和 Simplified Chinese (`zh-SC`). 可透過 **Configure Display Language** 切換顯示語言.

### 大檔案

`Markdown-PMP.largePreview.enabled` 預設開啟. 透過 VS Code 的預覽按鈕、預覽命令或原有快捷鍵開啟時, 達到 256,000 字元的 Markdown 檔案自動使用連續預覽; 小檔案維持原生預覽.

將 `Markdown-PMP.preview.usePmpForAllFiles` 設為 `true`, 小檔案也會使用 PMP 預覽. 此設定預設為 `false`, 優先於 `Markdown-PMP.largePreview.enabled`. 小檔案標籤僅顯示檔名, 大檔案保留 `長預覽-` 前綴. 變更這些設定也會切換透過 VS Code 預覽按鈕與命令開啟的預覽.

內容隨捲動自動載入, 讓長列表與大表格保持順暢. **Find/Ctrl+F** 搜尋全文, **Headings** 可跳至各節. 編輯器與預覽會互相隨動, 沿用 VS Code 的 `markdown.preview.scrollPreviewWithEditor` 和 `markdown.preview.scrollEditorWithPreview` 設定. 匯出仍包含全文.

**Markdown PMP: Toggle Source/Preview in Current Tab** (`Markdown-PMP.togglePreview`) 在目前標籤原位切換原文/預覽, 遵循上述預覽設定, 其他編輯器群組的預覽保持開啟.

Windows 的 `Markdown-PMP.nativePreview.suppressAltMenus` 與 `Markdown-PMP.preview.suppressAltMenus` 各自預設為 `true`, 分別避免在原生 Markdown 預覽與 PMP 預覽內按 Alt+E、Alt+S 時同時開啟選單. 兩個按鍵仍依你的 VS Code 快捷鍵設定執行; 開啟時, 對應檢視不使用它們的選單助記鍵.

此檢視使用 PMP 的 Markdown 解析、主題與公式設定; Default 跟隨 VS Code 配色與 Markdown 預覽字型. 其他擴充功能的預覽腳本與額外語法可在原生預覽使用. 將 `Markdown-PMP.preview.usePmpForAllFiles` 與 `Markdown-PMP.largePreview.enabled` 都設為 `false`, 透過 VS Code 原有預覽按鈕與命令開啟時會使用原生預覽.

### 編輯器命令

**Forward Search in PMP Preview** (`Markdown-PMP.forwardSearch`) 在源碼右側開啟或重用 PMP 預覽. 普通文字利用附近內容定位到光標所在字詞; 公式、表格及複雜內容定位到對應源碼塊. 以主題色短暫標記目標, 焦點保留在源碼. 此命令明確開啟 PMP 預覽, 適用於任何大小的檔案; 自動預覽設定仍控制 VS Code 的預覽按鈕與命令.

`Markdown-PMP.preview.forwardSearchIndicator` 選擇定位提示樣式: `rectangle` (預設) 高亮對應字詞或內容塊約 1 秒; `circle` 顯示擴散圓圈, 在 0.5 秒內淡出. 兩者都跟隨預覽主題顏色.

**Export PDF Beside Markdown** (`Markdown-PMP.exportPdfBeside`) 在 Markdown 同目錄產生 `檔名_md.pdf`, 後續執行更新該 PDF. 使用目前編輯器內容, 包含尚未儲存的修改, 並沿用列印設定. 未命名文件須先儲存. 完成後顯示通知, 可按需開啟 PDF.

`examples/keybindings.json` 提供 Alt+B (PDF)、Alt+E (目前標籤切換)、Alt+S (正向定位) 的可選繫結. 用其中的 Alt+S 項目替換既有的 Markdown Alt+S 規則, 其他項目加入使用者快捷鍵陣列末尾. 雙擊返回源碼預設透過 `markdown.preview.doubleClickToSwitchToEditor` 啟用, 明確設為 `false` 可關閉. 在 PMP 預覽中, 普通文字返回點擊字詞附近, 源碼光標置中並標記該行約 0.5 秒; 公式及複雜內容返回對應源碼塊. 右側預覽保持開啟, 同標籤預覽則原位恢復文字. PMP 提供命令, 快捷鍵由使用者配置.

### 主題與設定

| 主題       | 設定值    | 說明                |
| ---------- | --------- | ------------------- |
| Default    | `default` | VS Code 預設主題    |
| Purple     | `purple`  | 紫色主題            |
| Blue-White | `blue`    | 藍色主題            |
| Blue-Red   | `redblue` | 藍色主題 & 紅色裝飾 |

初始使用 Default, 跟隨原生預覽的配色、字型與版面. 三套 PMP 主題使用白底、內建正文字型、六級標題與帶底線的連結. 同一視窗統一使用一種主題, 公式預覽由獨立開關控制.

執行 **Markdown PMP: Open Extension Settings**、在設定中搜尋 `Markdown-PMP`, 或編輯 `settings.json`:

```json
{
  "Markdown-PMP.theme": "default",
  "Markdown-PMP.fontSize": 23,
  "Markdown-PMP.lineHeight": 1.7,
  "Markdown-PMP.maxWidth": 900,
  "Markdown-PMP.math.preview.enabled": true,
  "Markdown-PMP.math.export.enabled": true,
  "Markdown-PMP.math.delimiters": ["dollars", "brackets"],
  "Markdown-PMP.math.macros": { "\\RR": "\\mathbb{R}" }
}
```

`fontSize` (px)、`lineHeight` 與 `maxWidth` (px) 控制 PMP 主題的字號、行高與寬度; Default 使用 `markdown.preview.*` 設定. PDF 正文字號由 `Markdown-PMP.pdf.fontSize` (pt) 獨立控制.

### 數學公式

預覽與匯出使用 KaTeX, 並共用公式設定. 預設分隔符陣列同時支援 `$x$`、`$$x$$`、`\(x\)` 與 `\[x\]`. 獨立公式後可加上手動編號, 例如 `$$E=mc^2$$ (1)`. 程式碼與跳脫的 `\$` 保留為一般文字.

- `Markdown-PMP.math.preview.enabled`: 控制 PMP 公式預覽; 關閉時原生預覽可使用其他公式處理方式, 連續預覽則將公式顯示為一般 Markdown.
- `Markdown-PMP.math.export.enabled`: 控制匯出中的公式; 關閉後按一般 Markdown 文字處理.
- `Markdown-PMP.math.fallbackToCode`: 預設為 `true`, 無法渲染的公式保留原有分隔符並以程式碼顯示, 預覽與匯出繼續完成. 設為 `false` 時, 預覽顯示錯誤詳情, 匯出遇到公式錯誤則停止.
- `Markdown-PMP.math.macros`: 儲存自訂巨集.
- `Markdown-PMP.math.outerspace`: 啟用時, 要求單美元符號的行內公式前後留空格; 預設為 `false`.

分隔符亦支援 `gitlab`、`julia` 與 `kramdown`, 依陣列順序嘗試. `dollars` 與 `kramdown` 擇一使用, `gitlab` 與 `julia` 擇一使用.

匯入既有 mdmath 設定時, 執行 **Markdown PMP: Import mdmath Settings**, 可匯入分隔符、巨集與 `outerspace`, 也會讀取已設定的巨集檔案內容. 檢查公式後, 保留一套公式預覽功能啟用即可.

寬公式在預覽與 HTML 中可橫向捲動; PDF/圖片可縮至原大小的 80%, 仍放不下時保留為程式碼. 若將 `Markdown-PMP.math.fallbackToCode` 設為 `false`, 則停止匯出並提示位置. 若要保留公式排版, 可將公式分行, 或增加紙張/圖片寬度後再匯出.

### 匯出

使用 **Markdown PMP Export** 子選單或命令選擇區:

| 命令                                 | 輸出內容                                                            |
| ------------------------------------ | ------------------------------------------------------------------- |
| Export HTML                          | 內嵌樣式、本機圖片與字型的 HTML; Default 使用預覽字型設定.          |
| Export PDF                           | 文字可選取、連結可點擊的 PDF; 預設 A4 直向、四邊 20 mm、正文 12 pt. |
| Export PNG Image / Export JPEG Image | 長圖; 預設以 900 px 排版、2 倍解析度輸出, 實際寬度為 1800 px.       |
| Export with Settings...              | 調整單次匯出參數, 也可選擇儲存為預設值.                             |

HTML 可直接產生; PDF 與圖片透過本機已安裝的 Edge 或 Chrome 匯出. 自動偵測失敗時, 可在 `Markdown-PMP.browserPath` 填入瀏覽器執行檔路徑.

大型 PDF 會分段排版後合併為一份檔案, 保留連續頁碼、書籤與內部連結, 進度中會顯示目前段落. 表格配合可列印寬度, 超過一頁的表格行可接續至下一頁.

Default 匯出跟隨預覽的配色與字型, 包含深色背景; 其字型由閱讀環境提供, 三套 PMP 主題則會在 HTML 中內嵌正文字型. 本機圖片會內嵌, 網路圖片保留網址, 需要連線讀取; 缺少本機圖片時會停止匯出並提示路徑.

PNG 使用無損格式, JPEG 品質預設為 90. 過長的文件會拆成連續編號的圖片, 盡量在內容區塊之間分段.

匯出包含尚未儲存的修改, 並需要信任工作區; 受限模式仍可使用預覽主題.

### 匯出設定

PDF 設定使用 `Markdown-PMP.pdf.*` 前綴:

| 設定               | 用途                                                         |
| ------------------ | ------------------------------------------------------------ |
| `paper`            | A3、A4、A5、Letter、Legal、Tabloid 或 Custom                 |
| `width`、`height`  | 自訂紙張寬高, 單位 mm                                        |
| `landscape`        | 橫向紙張                                                     |
| `margins`          | 上、右、下、左邊界, 單位 mm                                  |
| `fontSize`         | 正文字號, 單位 pt, 預設 12                                   |
| `scale`            | 整體列印縮放                                                 |
| `pageRanges`       | 匯出頁碼, 例如 `1-5,8`; 留空匯出全部                         |
| `header`、`footer` | 以陣列組合 `filename`、`date`、`pageNumber`; `[]` 關閉該區域 |

頁尾預設顯示頁碼. 啟用頁首或頁尾時, 對應邊界至少需要 12 mm.

圖片設定為 `Markdown-PMP.image.width` (排版寬度, px)、`Markdown-PMP.image.scale` (解析度倍率) 及 `Markdown-PMP.image.jpegQuality` (1-100). PDF 分頁與圖片尺寸分開設定.

### 相容性

其他預覽主題或自訂樣式可能覆蓋預覽外觀. 匯出支援 Markdown、表格、程式碼高亮、任務清單、註腳及 KaTeX 公式; 第三方擴充功能的專用語法與樣式可能無法完整匯出.

目前僅驗證了 Windows、VS Code 1.142 與 1.143 環境.

### 檔案結構與原始碼建置

展開 VSIX 後, 可在 `extension/` 目錄找到:

| 目錄內路徑             | 用途                   |
| ---------------------- | ---------------------- |
| `assets/preview.css`   | 預覽共用排版           |
| `assets/theme.css`     | 匯出共用排版           |
| `assets/fonts.css`     | 正文字型樣式           |
| `assets/math/math.css` | 公式樣式               |
| `dist/extension.cjs`   | 擴充功能程式與主題配色 |
| `assets/licenses/`     | 字型與相依套件授權     |

三套 PMP 主題共用 CSS 排版規則, 配色定義於 `src/theme.cjs`, 打包後位於 `dist/extension.cjs`.

原始碼建置需要 Node.js 20.11+ 與 pnpm:

```text
pnpm install --frozen-lockfile
pnpm run build:l10n
pnpm run build
pnpm test
pnpm run package
```

## Simplified Chinese

Markdown PMP 为 VS Code 原生 Markdown 预览提供阅读主题、离线公式, 以及 HTML/PDF/PNG/JPEG 导出. 三套 PMP 主题的正文字体与数学字体均已内含.

### 开始使用

1. 在扩展面板选择 **... -> 从 VSIX 安装...**, 选择 `.vsix` 文件.
2. 打开 Markdown 文件, 按 **Ctrl+K, 然后 V** 打开侧边预览.
3. 运行 **Markdown PMP: Select Preview Theme**, 或点击状态栏的主题名称.
4. 运行 **Markdown PMP: Open Preview Sample**, 查看标题、链接、表格与公式示例.

命令菜单与设置说明使用英文. 导出设置页与消息跟随 VS Code 显示语言, 支持 English (`en`)、Traditional Chinese (`zh-TC`) 和 Simplified Chinese (`zh-SC`). 可通过 **Configure Display Language** 切换显示语言.

### 大文件

`Markdown-PMP.largePreview.enabled` 默认开启. 通过 VS Code 的预览按钮、预览命令或原有快捷键打开时, 达到 256,000 字符的 Markdown 文件自动使用连续预览; 小文件保持原生预览.

将 `Markdown-PMP.preview.usePmpForAllFiles` 设为 `true`, 小文件也会使用 PMP 预览. 此设置默认为 `false`, 优先于 `Markdown-PMP.largePreview.enabled`. 小文件标签只显示文件名, 大文件保留 `长预览-` 前缀. 更改这些设置也会切换通过 VS Code 预览按钮与命令打开的预览.

内容随滚动自动加载, 让长列表与大表格保持流畅. **Find/Ctrl+F** 搜索全文, **Headings** 可跳转到各节. 编辑器与预览会互相随动, 沿用 VS Code 的 `markdown.preview.scrollPreviewWithEditor` 和 `markdown.preview.scrollEditorWithPreview` 设置. 导出仍包含全文.

**Markdown PMP: Toggle Source/Preview in Current Tab** (`Markdown-PMP.togglePreview`) 在当前标签原位切换原文/预览, 遵循上述预览设置, 其他编辑器组的预览保持打开.

Windows 的 `Markdown-PMP.nativePreview.suppressAltMenus` 与 `Markdown-PMP.preview.suppressAltMenus` 各自默认为 `true`, 分别避免在原生 Markdown 预览与 PMP 预览内按 Alt+E、Alt+S 时同时打开菜单. 两个按键仍按你的 VS Code 快捷键设置执行; 开启时, 对应视图不使用它们的菜单助记键.

此视图使用 PMP 的 Markdown 解析、主题与公式设置; Default 跟随 VS Code 配色与 Markdown 预览字体. 其他扩展的预览脚本与额外语法可在原生预览使用. 将 `Markdown-PMP.preview.usePmpForAllFiles` 与 `Markdown-PMP.largePreview.enabled` 都设为 `false`, 通过 VS Code 原有预览按钮与命令打开时会使用原生预览.

### 编辑器命令

**Forward Search in PMP Preview** (`Markdown-PMP.forwardSearch`) 在源码右侧打开或复用 PMP 预览. 普通文字利用附近内容定位到光标所在字词; 公式、表格及复杂内容定位到对应源码块. 以主题色短暂标记目标, 焦点保留在源码. 此命令明确打开 PMP 预览, 适用于任何大小的文件; 自动预览设置仍控制 VS Code 的预览按钮与命令.

`Markdown-PMP.preview.forwardSearchIndicator` 选择定位提示样式: `rectangle` (默认) 高亮对应字词或内容块约 1 秒; `circle` 显示扩散圆圈, 在 0.5 秒内淡出. 两者都跟随预览主题颜色.

**Export PDF Beside Markdown** (`Markdown-PMP.exportPdfBeside`) 在 Markdown 同目录生成 `文件名_md.pdf`, 后续执行更新该 PDF. 使用当前编辑器内容, 包括尚未保存的修改, 并沿用打印设置. 未命名文档须先保存. 完成后显示通知, 可按需打开 PDF.

`examples/keybindings.json` 提供 Alt+B (PDF)、Alt+E (当前标签切换)、Alt+S (正向定位) 的可选绑定. 用其中的 Alt+S 条目替换现有的 Markdown Alt+S 规则, 其他条目加入用户快捷键数组末尾. 双击返回源码默认通过 `markdown.preview.doubleClickToSwitchToEditor` 启用, 明确设为 `false` 可关闭. 在 PMP 预览中, 普通文字返回点击字词附近, 源码光标置中并标记该行约 0.5 秒; 公式及复杂内容返回对应源码块. 右侧预览保持打开, 同标签预览则原位恢复文字. PMP 提供命令, 快捷键由用户配置.

### 主题与设置

| 主题       | 设置值    | 说明                |
| ---------- | --------- | ------------------- |
| Default    | `default` | VS Code 默认主题    |
| Purple     | `purple`  | 紫色主题            |
| Blue-White | `blue`    | 蓝色主题            |
| Blue-Red   | `redblue` | 蓝色主题 & 红色装饰 |

初始使用 Default, 跟随原生预览的配色、字体与版面. 三套 PMP 主题使用白底、内置正文字体、六级标题与带下划线的链接. 同一窗口统一使用一种主题, 公式预览由独立开关控制.

运行 **Markdown PMP: Open Extension Settings**、在设置中搜索 `Markdown-PMP`, 或编辑 `settings.json`:

```json
{
  "Markdown-PMP.theme": "default",
  "Markdown-PMP.fontSize": 23,
  "Markdown-PMP.lineHeight": 1.7,
  "Markdown-PMP.maxWidth": 900,
  "Markdown-PMP.math.preview.enabled": true,
  "Markdown-PMP.math.export.enabled": true,
  "Markdown-PMP.math.delimiters": ["dollars", "brackets"],
  "Markdown-PMP.math.macros": { "\\RR": "\\mathbb{R}" }
}
```

`fontSize` (px)、`lineHeight` 与 `maxWidth` (px) 控制 PMP 主题的字号、行高与宽度; Default 使用 `markdown.preview.*` 设置. PDF 正文字号由 `Markdown-PMP.pdf.fontSize` (pt) 独立控制.

### 数学公式

预览与导出使用 KaTeX, 并共用公式设置. 默认分隔符数组同时支持 `$x$`、`$$x$$`、`\(x\)` 与 `\[x\]`. 独立公式后可加上手工编号, 例如 `$$E=mc^2$$ (1)`. 代码与转义的 `\$` 保留为普通文本.

- `Markdown-PMP.math.preview.enabled`: 控制 PMP 公式预览; 关闭时原生预览可使用其他公式处理方式, 连续预览则将公式显示为普通 Markdown.
- `Markdown-PMP.math.export.enabled`: 控制导出中的公式; 关闭后按普通 Markdown 文本处理.
- `Markdown-PMP.math.fallbackToCode`: 默认为 `true`, 无法渲染的公式保留原有分隔符并以代码显示, 预览与导出继续完成. 设为 `false` 时, 预览显示错误详情, 导出遇到公式错误则停止.
- `Markdown-PMP.math.macros`: 保存自定义宏.
- `Markdown-PMP.math.outerspace`: 启用时, 要求单美元符号的行内公式前后留空格; 默认为 `false`.

分隔符也支持 `gitlab`、`julia` 与 `kramdown`, 按数组顺序尝试. `dollars` 与 `kramdown` 择一使用, `gitlab` 与 `julia` 择一使用.

导入已有 mdmath 设置时, 运行 **Markdown PMP: Import mdmath Settings**, 可导入分隔符、宏与 `outerspace`, 也会读取已设置的宏文件内容. 检查公式后, 保留一套公式预览功能启用即可.

宽公式在预览与 HTML 中可横向滚动; PDF/图片可缩至原大小的 80%, 仍放不下时保留为代码. 若将 `Markdown-PMP.math.fallbackToCode` 设为 `false`, 则停止导出并提示位置. 若要保留公式排版, 可将公式分行, 或增加纸张/图片宽度后再导出.

### 导出

使用 **Markdown PMP Export** 子菜单或命令面板:

| 命令                                 | 输出内容                                                            |
| ------------------------------------ | ------------------------------------------------------------------- |
| Export HTML                          | 内嵌样式、本地图片与字体的 HTML; Default 使用预览字体设置.          |
| Export PDF                           | 文字可选择、链接可点击的 PDF; 默认 A4 纵向、四边 20 mm、正文 12 pt. |
| Export PNG Image / Export JPEG Image | 长图; 默认以 900 px 排版、2 倍分辨率输出, 实际宽度为 1800 px.       |
| Export with Settings...              | 调整单次导出参数, 也可选择保存为默认值.                             |

HTML 可直接生成; PDF 与图片通过本机已安装的 Edge 或 Chrome 导出. 自动检测失败时, 可在 `Markdown-PMP.browserPath` 填入浏览器可执行文件路径.

大型 PDF 会分段排版后合并为一份文件, 保留连续页码、书签与内部链接, 进度中会显示当前段落. 表格适应可打印宽度, 超过一页的表格行可接续到下一页.

Default 导出跟随预览的配色与字体, 包含深色背景; 其字体由阅读环境提供, 三套 PMP 主题则会在 HTML 中内嵌正文字体. 本地图片会内嵌, 网络图片保留网址, 需要联网读取; 缺少本地图片时会停止导出并提示路径.

PNG 使用无损格式, JPEG 质量默认为 90. 过长的文档会拆成连续编号的图片, 尽量在内容区块之间分段.

导出包含尚未保存的修改, 并需要信任工作区; 受限模式仍可使用预览主题.

### 导出设置

PDF 设置使用 `Markdown-PMP.pdf.*` 前缀:

| 设置               | 用途                                                         |
| ------------------ | ------------------------------------------------------------ |
| `paper`            | A3、A4、A5、Letter、Legal、Tabloid 或 Custom                 |
| `width`、`height`  | 自定义纸张宽高, 单位 mm                                      |
| `landscape`        | 横向纸张                                                     |
| `margins`          | 上、右、下、左边距, 单位 mm                                  |
| `fontSize`         | 正文字号, 单位 pt, 默认 12                                   |
| `scale`            | 整体打印缩放                                                 |
| `pageRanges`       | 导出页码, 例如 `1-5,8`; 留空导出全部                         |
| `header`、`footer` | 用数组组合 `filename`、`date`、`pageNumber`; `[]` 关闭该区域 |

页脚默认显示页码. 启用页眉或页脚时, 对应边距至少需要 12 mm.

图片设置为 `Markdown-PMP.image.width` (排版宽度, px)、`Markdown-PMP.image.scale` (分辨率倍率) 和 `Markdown-PMP.image.jpegQuality` (1-100). PDF 分页与图片尺寸分开设置.

### 兼容性

其他预览主题或自定义样式可能覆盖预览外观. 导出支持 Markdown、表格、代码高亮、任务列表、脚注及 KaTeX 公式; 第三方扩展的专用语法与样式可能无法完整导出.

目前仅验证了 Windows、VS Code 1.142 和 1.143 环境.

### 文件结构与源码构建

展开 VSIX 后, 可在 `extension/` 目录找到:

| 目录内路径             | 用途               |
| ---------------------- | ------------------ |
| `assets/preview.css`   | 预览共用排版       |
| `assets/theme.css`     | 导出共用排版       |
| `assets/fonts.css`     | 正文字体样式       |
| `assets/math/math.css` | 公式样式           |
| `dist/extension.cjs`   | 扩展程序与主题配色 |
| `assets/licenses/`     | 字体与依赖包许可   |

三套 PMP 主题共用 CSS 排版规则, 配色定义于 `src/theme.cjs`, 打包后位于 `dist/extension.cjs`.

源码构建需要 Node.js 20.11+ 与 pnpm:

```text
pnpm install --frozen-lockfile
pnpm run build:l10n
pnpm run build
pnpm test
pnpm run package
```
