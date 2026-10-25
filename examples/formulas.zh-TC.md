# 閱讀與公式

支援行內公式 $E=mc^2$, 也支援括號形式 \(a^2+b^2=c^2\).

## 從一條連結開始

[參考資料](https://example.com)與正文、`inline code` 應清楚區分.

$$\int_0^1 x^2\,dx=\frac13$$ (1)

\[\begin{pmatrix}a & b\\c & d\end{pmatrix}\] (2)

### 一個小例子

> 公式、中文與 English 使用配套字型. 獨立公式置中, 手動編號靠右.

$$\sqrt{a^2+b^2}=\left(\sum_{i=1}^{n}x_i^2\right)^{1/2}$$

| 名稱     | 表達式                            |
| -------- | --------------------------------- |
| 常態分布 | $\frac{1}{\sqrt{2\pi}}e^{-x^2/2}$ |
| 向量     | \(\vec{v}=(x,y,z)\)               |

```js
const label = "$thisIsCode$";
function square(x) {
  return x * x;
}
```

#### 四級標題

- [x] 已確認的事項
- [ ] 後續記錄

##### 五級標題

一般文字中的金額可寫作 \$10 與 \$20.

###### 六級標題

三套 PMP 主題也支援註腳.[^note]

[^note]: 註腳範例.
