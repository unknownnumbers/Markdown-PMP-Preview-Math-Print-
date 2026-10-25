# 阅读与记录

整理笔记时, 把 [Markdown 语法说明](https://www.markdownguide.org/basic-syntax/) 放在手边, 并在 [阅读资料索引](https://www.wikipedia.org/) 里保存值得重读的内容.

## 从一条链接开始

中文正文采用霞鹜文楷 GB, 英文正文采用 Latin Modern Roman. Reading, writing, and returning to a worthwhile idea. **粗体用于强调**, *斜体留给补充说明*; 用 `font-size` 调整字号, 用 `line-height` 留出呼吸感.

> 读到重要的段落, 先写下自己的理解, 再补充参考资料.
>
> 文字、留白和颜色, 共同决定阅读时的节奏.

### 一个小例子

```javascript
const notes = ["阅读", "记录"];
const theme = "purple";
exportNotes(notes, theme);
```

| 内容 | 用途 |
| :--- | :--- |
| [排版参考](https://developer.mozilla.org/zh-CN/docs/Web/CSS) | 延伸阅读 |
| `font-family` | 字体设置 |

#### 四级标题 - 补充细节

层级继续向下, 颜色仍然遵循当前主题, 字号与字重帮助区分.

##### 五级标题 - 延伸记录

- 阅读一章, 再写两句自己的理解.
- 保留原文出处, 方便以后重读.
  - 嵌套列表保持紧凑.

###### 六级标题 - 注记

最后一级也有独立字号; H1-H6 均已覆盖. 脚注可以放下次要的补充.[^note]

---

1. 先整理观点.
2. 再补充例子.
3. 最后检查引用.

- [x] 六级标题
- [x] 中文、英文、代码与链接
- [x] 引用、表格、列表、脚注
- [ ] 留待下次阅读的问题

[^note]: 导出时使用当前主题; PDF 使用 A4 纵向、12 pt 正文、20 mm 页边距与页脚页码.
