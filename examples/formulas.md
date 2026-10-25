# 阅读与公式

支持行内公式 $E=mc^2$, 也支持括号形式 \(a^2+b^2=c^2\).

## 从一条链接开始

[阅读资料](https://example.com)与正文、`inline code` 应清楚区分.

$$\int_0^1 x^2\,dx=\frac13$$ (1)

\[\begin{pmatrix}a & b\\c & d\end{pmatrix}\] (2)

### 一个小例子

> 公式、中文和 English 使用配套字体. 块公式居中, 编号靠右.

$$\sqrt{a^2+b^2}=\left(\sum_{i=1}^{n}x_i^2\right)^{1/2}$$

| 名称 | 表达式 |
| --- | --- |
| 正态分布 | $\frac{1}{\sqrt{2\pi}}e^{-x^2/2}$ |
| 向量 | \(\vec{v}=(x,y,z)\) |

```js
const label = "$thisIsCode$";
function square(x) { return x * x; }
```

#### 四级标题

- [x] 已确认的事项
- [ ] 后续记录

##### 五级标题

普通文字里的金额可以写作 \$10 与 \$20.

###### 六级标题

脚注也可继续使用.[^note]

[^note]: 三套PMP主题的脚注样例.
