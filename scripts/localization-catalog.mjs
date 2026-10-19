import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");

// English, Traditional Chinese, Simplified Chinese. Theme names stay English.
export const manifest = [
  [
    "extension.displayName",
    "Markdown PMP (Preview-Math-Print)",
    "Markdown PMP (Preview-Math-Print)",
    "Markdown PMP (Preview-Math-Print)",
  ],
  [
    "extension.description",
    "Four Markdown preview modes, offline math and fonts, and HTML, PDF, PNG and JPEG export.",
    "四種 Markdown 預覽模式、離線公式與字型，以及 HTML、PDF、PNG、JPEG 匯出。",
    "四种 Markdown 预览模式、离线公式与字体，以及 HTML、PDF、PNG、JPEG 导出。",
  ],
  ["extension.category", "Markdown PMP", "Markdown PMP", "Markdown PMP"],
  [
    "capability.untrusted",
    "Preview themes and fonts work in Restricted Mode. Export requires a trusted workspace.",
    "受限模式仍可使用預覽主題與字型；匯出需要信任工作區。",
    "受限模式仍可使用预览主题与字体；导出需要信任工作区。",
  ],
  [
    "capability.virtual",
    "Preview is supported. PDF and image export require a locally installed Edge or Chrome.",
    "支援預覽；PDF 與圖片匯出需要本機已安裝的 Edge 或 Chrome。",
    "支持预览；PDF 与图片导出需要本机已安装的 Edge 或 Chrome。",
  ],
  [
    "command.selectTheme",
    "Select Preview Theme",
    "選擇預覽主題",
    "选择预览主题",
  ],
  ["command.exportHtml", "Export HTML", "匯出 HTML", "导出 HTML"],
  ["command.exportPdf", "Export PDF", "匯出 PDF", "导出 PDF"],
  ["command.exportPng", "Export PNG Image", "匯出 PNG 長圖", "导出 PNG 长图"],
  [
    "command.exportJpeg",
    "Export JPEG Image",
    "匯出 JPEG 長圖",
    "导出 JPEG 长图",
  ],
  ["command.openSample", "Open Preview Sample", "開啟預覽範例", "打开预览示例"],
  [
    "command.openSettings",
    "Open Extension Settings",
    "開啟擴充功能設定",
    "打开扩展设置",
  ],
  [
    "command.exportWithSettings",
    "Export with Settings…",
    "調整設定後匯出…",
    "调整设置后导出…",
  ],
  [
    "command.migrateMdmathSettings",
    "Import mdmath Settings",
    "匯入 mdmath 設定",
    "导入 mdmath 设置",
  ],
  [
    "menu.export",
    "Markdown PMP Export",
    "Markdown PMP 匯出",
    "Markdown PMP 导出",
  ],
  [
    "theme.default",
    "VS Code default theme",
    "VS Code 預設主題",
    "VS Code 默认主题",
  ],
  ["theme.purple", "Purple theme", "紫色主題", "紫色主题"],
  ["theme.blue", "Blue theme", "藍色主題", "蓝色主题"],
  [
    "theme.redblue",
    "Blue theme & red accents",
    "藍色主題 & 紅色裝飾",
    "蓝色主题 & 红色装饰",
  ],
  [
    "setting.theme",
    "Preview mode for this window. Default exports follow the actual VS Code colors and Markdown preview fonts.",
    "此視窗的預覽模式。Default 匯出會跟隨實際 VS Code 配色與 Markdown 預覽字型。",
    "此窗口的预览模式。Default 导出会跟随实际 VS Code 配色与 Markdown 预览字体。",
  ],
  [
    "setting.fontSize",
    "Preview body font size in px. Default uses the native Markdown preview setting.",
    "預覽正文字號，單位 px。Default 使用原生 Markdown 預覽設定。",
    "预览正文字号，单位 px。Default 使用原生 Markdown 预览设置。",
  ],
  [
    "setting.lineHeight",
    "Body line height for preview and export. Default uses the native Markdown preview setting.",
    "預覽與匯出共用的正文行高。Default 使用原生 Markdown 預覽設定。",
    "预览与导出共用的正文行高。Default 使用原生 Markdown 预览设置。",
  ],
  [
    "setting.maxWidth",
    "Maximum preview width in px; adapts to narrow windows. Default uses the native preview layout.",
    "預覽最大寬度，單位 px；會配合窄視窗調整。Default 使用原生預覽版面。",
    "预览最大宽度，单位 px；会适应窄窗口。Default 使用原生预览布局。",
  ],
  [
    "setting.pdf.fontSize",
    "PDF body font size in pt, independent of the preview and image font size.",
    "PDF 正文字號，單位 pt，與預覽及圖片字號分開設定。",
    "PDF 正文字号，单位 pt，与预览及图片字号分开设置。",
  ],
  [
    "setting.pdf.browserPath",
    "Legacy browser path. Leave empty to find Chrome or Edge automatically. This machine-specific path is not synced.",
    "舊版瀏覽器路徑。留空會自動尋找 Chrome 或 Edge；此機器專屬路徑不會同步。",
    "旧版浏览器路径。留空会自动寻找 Chrome 或 Edge；此机器专属路径不会同步。",
  ],
  [
    "setting.pdf.browserPath.deprecated",
    "Use Markdown-PMP.browserPath instead. This value remains a compatibility fallback.",
    "請改用 Markdown-PMP.browserPath；舊值仍作為相容性備用值。",
    "请改用 Markdown-PMP.browserPath；旧值仍作为兼容备用值。",
  ],
  [
    "setting.browserPath",
    "Chrome or Edge executable for PDF and images. Leave empty for automatic detection. This machine-specific path is not synced.",
    "PDF 與圖片共用的 Chrome 或 Edge 執行檔路徑。留空會自動偵測；此機器專屬路徑不會同步。",
    "PDF 与图片共用的 Chrome 或 Edge 可执行文件路径。留空会自动检测；此机器专属路径不会同步。",
  ],
  [
    "setting.math.preview.enabled",
    "Use PMP math in the native preview. Disable to restore the previous math provider; the preview theme still applies.",
    "在原生預覽使用 PMP 公式。關閉後恢復原有公式處理方式，預覽主題仍會生效。",
    "在原生预览使用 PMP 公式。关闭后恢复原有公式处理方式，预览主题仍会生效。",
  ],
  [
    "setting.math.export.enabled",
    "Render and validate math during export. Disable to treat it as ordinary Markdown. Independent of the preview switch.",
    "匯出時繪製並檢查公式。關閉後視為一般 Markdown 處理，與預覽開關互相獨立。",
    "导出时渲染并检查公式。关闭后视为普通 Markdown 处理，与预览开关相互独立。",
  ],
  [
    "setting.math.delimiters",
    "Enabled delimiter modes, in order. Do not combine dollars with kramdown, or gitlab with julia.",
    "依序啟用的公式分隔符模式。dollars 不可與 kramdown 並用；gitlab 不可與 julia 並用。",
    "依次启用的公式分隔符模式。dollars 不可与 kramdown 并用；gitlab 不可与 julia 并用。",
  ],
  [
    "setting.math.macros",
    'KaTeX macros, for example {"\\\\RR":"\\\\mathbb{R}"}. Saved with your VS Code settings.',
    'KaTeX 自訂巨集，例如 {"\\\\RR":"\\\\mathbb{R}"}，隨 VS Code 設定儲存。',
    'KaTeX 自定义宏，例如 {"\\\\RR":"\\\\mathbb{R}"}，随 VS Code 设置保存。',
  ],
  [
    "setting.math.outerspace",
    "Require spaces around single-dollar inline math. Leave off for continuous Chinese text.",
    "要求單美元行內公式前後留空格。中文連續行文建議關閉。",
    "要求单美元行内公式前后留空格。中文连续行文建议关闭。",
  ],
  [
    "setting.pdf.paper",
    "PDF paper size. Custom uses the configured width and height.",
    "PDF 紙張大小。Custom 使用設定的自訂寬高。",
    "PDF 纸张大小。Custom 使用设置的自定义宽高。",
  ],
  [
    "setting.pdf.width",
    "Custom paper width in mm.",
    "自訂紙張寬度，單位 mm。",
    "自定义纸张宽度，单位 mm。",
  ],
  [
    "setting.pdf.height",
    "Custom paper height in mm.",
    "自訂紙張高度，單位 mm。",
    "自定义纸张高度，单位 mm。",
  ],
  [
    "setting.pdf.landscape",
    "Use landscape orientation for PDF.",
    "PDF 使用橫向紙張。",
    "PDF 使用横向纸张。",
  ],
  [
    "setting.pdf.margins",
    "Page margins in mm. Headers and footers require at least 12 mm on the corresponding side.",
    "四邊邊界，單位 mm。使用頁首或頁尾時，對應邊界至少需要 12 mm。",
    "四边距，单位 mm。使用页眉或页脚时，对应边距至少需要 12 mm。",
  ],
  [
    "setting.pdf.scale",
    "Overall PDF scale, independent of body font size.",
    "PDF 整體縮放，與正文字號分開設定。",
    "PDF 整体缩放，与正文字号分开设置。",
  ],
  [
    "setting.pdf.pageRanges",
    "Pages to export, for example 1-5,8. Leave empty for all pages.",
    "匯出頁碼範圍，例如 1-5,8。留空匯出全部頁面。",
    "导出页码范围，例如 1-5,8。留空导出全部页面。",
  ],
  [
    "setting.pdf.header",
    "Header content. Use an empty array to disable it.",
    "頁首內容；使用空陣列可關閉。",
    "页眉内容；使用空数组可关闭。",
  ],
  [
    "setting.pdf.footer",
    "Footer content. Use an empty array to disable it.",
    "頁尾內容；使用空陣列可關閉。",
    "页脚内容；使用空数组可关闭。",
  ],
  [
    "setting.image.width",
    "Long-image layout width in CSS px.",
    "長圖排版寬度，單位 CSS px。",
    "长图排版宽度，单位 CSS px。",
  ],
  [
    "setting.image.scale",
    "Image resolution multiplier. Output pixel width equals layout width times this value.",
    "圖片解析度倍數；實際像素寬度為排版寬度乘以此值。",
    "图片清晰度倍数；实际像素宽度为排版宽度乘以此值。",
  ],
  [
    "setting.image.jpegQuality",
    "JPEG quality. PNG export is lossless.",
    "JPEG 品質；PNG 採用無損輸出。",
    "JPEG 质量；PNG 采用无损输出。",
  ],
];

export const runtime = [
  ["Markdown PMP", "Markdown PMP", "Markdown PMP"],
  [
    "Another math preview provider is enabled: {0}. Keep only one enabled to avoid parsing and font conflicts.",
    "已啟用另一套公式預覽：{0}。請只保留一套，以免解析與字型互相衝突。",
    "已启用另一套公式预览：{0}。请只保留一套，以免解析与字体相互冲突。",
  ],
  [
    "Markdown All in One math",
    "Markdown All in One 公式功能",
    "Markdown All in One 公式功能",
  ],
  ["View Extension", "查看擴充功能", "查看扩展"],
  ["Disable PMP Math Preview", "關閉 PMP 公式預覽", "关闭 PMP 公式预览"],
  [
    "Markdown PMP: select the preview theme for this window",
    "Markdown PMP：選擇此視窗的預覽主題",
    "Markdown PMP：选择此窗口的预览主题",
  ],
  ["Current", "目前使用", "当前使用"],
  [
    "Select the preview theme for this window",
    "選擇此視窗的預覽主題",
    "选择此窗口的预览主题",
  ],
  ["Select a document to export", "選擇要匯出的文件", "选择要导出的文档"],
  [
    "Open a Markdown document first.",
    "請先開啟 Markdown 文件。",
    "请先打开 Markdown 文档。",
  ],
  [
    "Trust this workspace before exporting.",
    "請先信任此工作區，再匯出文件。",
    "请先信任此工作区，再导出文档。",
  ],
  [
    "Select a Markdown document.",
    "請選擇 Markdown 文件。",
    "请选择 Markdown 文档。",
  ],
  [
    "Export {0} · Markdown PMP",
    "匯出 {0} · Markdown PMP",
    "导出 {0} · Markdown PMP",
  ],
  [
    "The export cannot overwrite the Markdown source file.",
    "匯出檔案不可覆寫 Markdown 原始檔。",
    "导出文件不可覆盖 Markdown 源文件。",
  ],
  [
    "Markdown PMP: exporting {0}",
    "Markdown PMP：正在匯出 {0}",
    "Markdown PMP：正在导出 {0}",
  ],
  [
    "Preparing math, fonts and local images…",
    "正在準備公式、字型與本機圖片…",
    "正在准备公式、字体与本地图片…",
  ],
  [
    "{0} numbered image files already exist. Overwrite them?",
    "已有 {0} 個同名圖片分段檔案。要覆寫嗎？",
    "已有 {0} 个同名图片分段文件。要覆盖吗？",
  ],
  ["Overwrite", "覆寫", "覆盖"],
  ["Export cancelled.", "已取消匯出。", "已取消导出。"],
  [
    "Exported {0} ({1}): {2}",
    "已匯出 {0}（{1}）：{2}",
    "已导出 {0}（{1}）：{2}",
  ],
  ["{0} exported.", "已匯出 {0}。", "已导出 {0}。"],
  [
    "{0} exported as {1} numbered images.",
    "已匯出 {0}，自動分為 {1} 張編號圖片。",
    "已导出 {0}，自动分为 {1} 张编号图片。",
  ],
  ["Open File", "開啟檔案", "打开文件"],
  ["Reveal in Folder", "在資料夾中顯示", "在文件夹中显示"],
  [
    "Markdown PMP export failed: {0}",
    "Markdown PMP 匯出失敗：{0}",
    "Markdown PMP 导出失败：{0}",
  ],
  ["Show Log", "顯示記錄", "显示日志"],
  ["Export Settings", "匯出設定", "导出设置"],
  ["Select an export format", "選擇匯出格式", "选择导出格式"],
  [
    "Imported mdmath delimiters and macros. Macro-file contents are saved in settings; the original file is no longer required.",
    "已匯入 mdmath 分隔符與巨集。巨集檔案內容已儲存至設定，不再需要原檔案。",
    "已导入 mdmath 分隔符与宏。宏文件内容已保存到设置，不再需要原文件。",
  ],
  [
    "Could not import math settings: {0}",
    "無法匯入公式設定：{0}",
    "无法导入公式设置：{0}",
  ],
  [
    "Markdown PMP · Preparing Export",
    "Markdown PMP · 準備匯出",
    "Markdown PMP · 准备导出",
  ],
  [
    "Reading the current theme timed out. Try exporting again.",
    "讀取目前主題逾時，請重新匯出。",
    "读取当前主题超时，请重新导出。",
  ],
  [
    "Preparing Default export styles…",
    "正在準備 Default 匯出樣式…",
    "正在准备 Default 导出样式…",
  ],
  [
    "Markdown PMP · Export Settings",
    "Markdown PMP · 匯出設定",
    "Markdown PMP · 导出设置",
  ],
  ["Filename", "檔名", "文件名"],
  ["Date", "日期", "日期"],
  ["Page number", "頁碼", "页码"],
  ["Paper", "紙張", "纸张"],
  ["Custom", "自訂", "自定义"],
  ["Custom width (mm)", "自訂寬度 (mm)", "自定义宽度 (mm)"],
  ["Custom height (mm)", "自訂高度 (mm)", "自定义高度 (mm)"],
  ["Landscape", "橫向", "横向"],
  ["Top margin (mm)", "上邊界 (mm)", "上边距 (mm)"],
  ["Right margin (mm)", "右邊界 (mm)", "右边距 (mm)"],
  ["Bottom margin (mm)", "下邊界 (mm)", "下边距 (mm)"],
  ["Left margin (mm)", "左邊界 (mm)", "左边距 (mm)"],
  ["Body font size (pt)", "正文字號 (pt)", "正文字号 (pt)"],
  ["Scale (0.1–2)", "整體縮放 (0.1–2)", "整体缩放 (0.1–2)"],
  [
    "Page ranges (empty for all)",
    "頁碼範圍（留空為全部）",
    "页码范围（留空为全部）",
  ],
  ["Header", "頁首", "页眉"],
  ["Footer", "頁尾", "页脚"],
  ["Layout width (px)", "排版寬度 (px)", "排版宽度 (px)"],
  ["Resolution (1–3×)", "解析度 (1–3 倍)", "清晰度 (1–3 倍)"],
  ["JPEG quality (1–100)", "JPEG 品質 (1–100)", "JPEG 质量 (1–100)"],
  [
    "Very long articles are split into consecutively numbered images.",
    "過長的文章會自動拆分為連續編號的圖片。",
    "过长的文章会自动拆分为连续编号的图片。",
  ],
  ["Export {0}", "匯出 {0}", "导出 {0}"],
  [
    "Theme: {0}. These temporary settings apply only to this export.",
    "主題：{0}。臨時設定只用於這次匯出。",
    "主题：{0}。临时设置只用于本次导出。",
  ],
  [
    "HTML embeds styles and local images. PMP themes include body fonts; Default uses system fonts.",
    "HTML 會內嵌樣式與本機圖片。PMP 主題另含正文字型；Default 使用系統字型。",
    "HTML 会内嵌样式与本地图片。PMP 主题另含正文字体；Default 使用系统字体。",
  ],
  ["Export Once", "匯出一次", "导出一次"],
  ["Save Defaults and Export", "儲存為預設值並匯出", "保存为默认值并导出"],
  ["Cancel", "取消", "取消"],
  [
    "{0} must be between {1} and {2}.",
    "{0}必須介於 {1} 與 {2} 之間。",
    "{0}必须介于 {1} 与 {2} 之间。",
  ],
  [
    "Select a valid paper size.",
    "請選擇有效的紙張大小。",
    "请选择有效的纸张大小。",
  ],
  ["Paper width", "紙張寬度", "纸张宽度"],
  ["Paper height", "紙張高度", "纸张高度"],
  ["Page margin", "頁面邊界", "页边距"],
  [
    "Margins leave too little content space; at least 10 mm is required.",
    "邊界過大；正文區域至少需要保留 10 mm。",
    "边距过大；正文区域至少需要保留 10 mm。",
  ],
  [
    "Use page ranges such as 1-5,8, or leave empty for all pages.",
    "頁碼範圍可填 1-5,8，或留空以匯出全部頁面。",
    "页码范围可填 1-5,8，或留空以导出全部页面。",
  ],
  [
    "Page ranges must start at 1, with the end not before the start.",
    "頁碼範圍必須從 1 開始，結束頁不可小於起始頁。",
    "页码范围必须从 1 开始，结束页不可小于起始页。",
  ],
  [
    "Headers and footers support filename, date and pageNumber only.",
    "頁首與頁尾僅支援 filename、date、pageNumber。",
    "页眉与页脚仅支持 filename、date、pageNumber。",
  ],
  [
    "Headers and footers require at least 12 mm on the corresponding margin.",
    "使用頁首或頁尾時，對應邊界至少需要 12 mm。",
    "使用页眉或页脚时，对应边距至少需要 12 mm。",
  ],
  ["PDF font size", "PDF 字號", "PDF 字号"],
  ["PDF scale", "PDF 縮放", "PDF 缩放"],
  ["Image layout width", "圖片排版寬度", "图片排版宽度"],
  ["Image resolution", "圖片解析度", "图片清晰度"],
  ["JPEG quality", "JPEG 品質", "JPEG 质量"],
  [
    "Math delimiters must be a nonempty array of dollars, brackets, gitlab, julia or kramdown.",
    "公式分隔符必須是包含 dollars、brackets、gitlab、julia 或 kramdown 的非空陣列。",
    "公式分隔符必须是包含 dollars、brackets、gitlab、julia 或 kramdown 的非空数组。",
  ],
  [
    "Math modes {0} overlap. Select them separately.",
    "公式模式 {0} 互相重疊，請分開選擇。",
    "公式模式 {0} 相互重叠，请分开选择。",
  ],
  [
    "Math macros must map command names to formula strings.",
    "公式巨集必須將命令名稱對應至公式字串。",
    "公式宏必须将命令名称对应到公式字符串。",
  ],
  [
    "Math error · line {0}: {1}",
    "公式錯誤 · 第 {0} 行：{1}",
    "公式错误 · 第 {0} 行：{1}",
  ],
  ["Math parsing failed: {0}", "公式解析失敗：{0}", "公式解析失败：{0}"],
  ["Line {0}: {1}", "第 {0} 行：{1}", "第 {0} 行：{1}"],
  ["line {0}", "第 {0} 行", "第 {0} 行"],
  [
    "The specified browser does not exist. Check Markdown-PMP.browserPath.",
    "指定的瀏覽器不存在，請檢查 Markdown-PMP.browserPath。",
    "指定的浏览器不存在，请检查 Markdown-PMP.browserPath。",
  ],
  [
    "Chrome or Edge was not found. Install one or set Markdown-PMP.browserPath. HTML export does not require a browser.",
    "找不到 Chrome 或 Edge。請安裝其中一個，或設定 Markdown-PMP.browserPath。HTML 匯出不需要瀏覽器。",
    "找不到 Chrome 或 Edge。请安装其中一个，或设置 Markdown-PMP.browserPath。HTML 导出不需要浏览器。",
  ],
  [
    "The browser closed before export completed.",
    "瀏覽器在匯出完成前已關閉。",
    "浏览器在导出完成前已关闭。",
  ],
  [
    "The browser connection is closed.",
    "瀏覽器連線已關閉。",
    "浏览器连接已关闭。",
  ],
  [
    "Browser operation timed out: {0}",
    "瀏覽器操作逾時：{0}",
    "浏览器操作超时：{0}",
  ],
  [
    "The browser connection has ended.",
    "瀏覽器連線已結束。",
    "浏览器连接已结束。",
  ],
  [
    "The browser could not start in headless mode.",
    "瀏覽器無法以背景模式啟動。",
    "浏览器无法以后台模式启动。",
  ],
  ["Starting the browser timed out.", "啟動瀏覽器逾時。", "启动浏览器超时。"],
  [
    "Could not load the layout page: {0}",
    "無法載入排版頁面：{0}",
    "无法加载排版页面：{0}",
  ],
  [
    "Loading the page or images timed out.",
    "載入頁面或圖片逾時。",
    "加载页面或图片超时。",
  ],
  [
    "Bundled fonts could not load. Export stopped to avoid font substitution.",
    "內建字型無法載入，已停止匯出以免字型被替換。",
    "内置字体无法加载，已停止导出以免字体被替换。",
  ],
  ["Could not load fonts: {0}", "無法載入字型：{0}", "无法加载字体：{0}"],
  [
    "Could not load {0} image(s): {1}",
    "無法載入 {0} 張圖片：{1}",
    "无法加载 {0} 张图片：{1}",
  ],
  [
    "Could not check the math layout.",
    "無法檢查公式版面。",
    "无法检查公式版面。",
  ],
  [
    "Math is too wide even at 80%: {0}. Split the formula or adjust paper orientation or image width.",
    "公式縮至 80% 仍過寬：{0}。請將公式分行，或調整紙張方向或圖片寬度。",
    "公式缩至 80% 仍过宽：{0}。请将公式分行，或调整纸张方向或图片宽度。",
  ],
  ["Generating images…", "正在產生圖片…", "正在生成图片…"],
  ["Could not split the long image.", "無法拆分長圖。", "无法拆分长图。"],
  [
    "Fonts and images are ready. Generating PDF…",
    "字型與圖片已就緒，正在產生 PDF…",
    "字体与图片已就绪，正在生成 PDF…",
  ],
  [
    "The browser did not return PDF data.",
    "瀏覽器未傳回 PDF 資料。",
    "浏览器未返回 PDF 数据。",
  ],
  [
    "The browser did not return a valid PDF file.",
    "瀏覽器傳回的檔案不是有效的 PDF。",
    "浏览器返回的文件不是有效的 PDF。",
  ],
  [
    "The temporary directory is outside the export cleanup scope.",
    "暫存目錄超出匯出器的清理範圍。",
    "临时目录超出导出器的清理范围。",
  ],
  [
    "Starting {0} for background layout…",
    "正在啟動 {0} 進行背景排版…",
    "正在启动 {0} 进行后台排版…",
  ],
  ["{0} export failed. {1}", "{0} 匯出失敗。{1}", "{0} 导出失败。{1}"],
  [
    "Unsupported image file: {0}",
    "不支援的圖片檔案：{0}",
    "不支持的图片文件：{0}",
  ],
  [
    "Remote images keep their original URLs. Download them locally for offline reading.",
    "網路圖片會保留原網址；離線閱讀前請先下載為本機圖片。",
    "网络图片会保留原网址；离线阅读前请先下载为本地图片。",
  ],
  [
    "Unsupported image URL: {0}",
    "不支援的圖片網址：{0}",
    "不支持的图片地址：{0}",
  ],
  [
    "Could not read local image “{0}”: {1}",
    "無法讀取本機圖片「{0}」：{1}",
    "无法读取本地图片「{0}」：{1}",
  ],
  [
    "Image “{0}” exceeds 25 MB. Resize it before exporting.",
    "圖片「{0}」超過 25 MB，請縮小後再匯出。",
    "图片「{0}」超过 25 MB，请缩小后再导出。",
  ],
  [
    "Default export requires the current VS Code appearance first.",
    "Default 匯出需要先讀取目前 VS Code 外觀。",
    "Default 导出需要先读取当前 VS Code 外观。",
  ],
];

export async function writeCatalogs() {
  await fs.mkdir(path.join(root, "l10n"), { recursive: true });
  for (const [locale, column] of [
    ["", 1],
    ["zh-TC", 2],
    ["zh-SC", 3],
  ]) {
    const values = Object.fromEntries(
      manifest.map((row) => [row[0], row[column]]),
    );
    await fs.writeFile(
      path.join(root, `package.nls${locale ? "." + locale : ""}.json`),
      JSON.stringify(values, null, 2) + "\n",
    );
  }
  for (const [locale, column] of [
    ["", 0],
    ["zh-TC", 1],
    ["zh-SC", 2],
  ]) {
    const values = Object.fromEntries(
      runtime.map((row) => [row[0], row[column]]),
    );
    if (Object.keys(values).length !== runtime.length)
      throw new Error("Duplicate runtime localization key");
    await fs.writeFile(
      path.join(root, "l10n", `bundle.l10n${locale ? "." + locale : ""}.json`),
      JSON.stringify(values, null, 2) + "\n",
    );
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename)
  await writeCatalogs();
