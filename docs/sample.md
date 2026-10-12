# 느리게 읽는 즐거움

좋은 글은 서두르지 않습니다. 문장 사이의 여백, 단락이 끝나고 다음 단락이 시작되기 전의 짧은 쉼표 같은 공간이 생각할 틈을 만들어 줍니다. 이 문서는 **MD Viewer**가 여러 마크다운 요소를 어떻게 보여주는지 살펴보기 위한 샘플입니다.

## 글자와 강조

본문은 *기울임*, **굵게**, ~~취소선~~, 그리고 `인라인 코드`를 지원합니다. 링크는 [이렇게](https://commonmark.org) 은은한 밑줄로 표시됩니다. 영어 문장도 자연스럽게 섞여야 합니다 — *Typography is the craft of endowing human language with a durable visual form.*

> 글쓰기는 생각을 정리하는 가장 느리고도 확실한 방법이다.
> 읽기는 그 생각을 다시 펼쳐 보는 일이다.

### 목록

- 넉넉한 줄 간격
- 한 줄에 약 40자 남짓의 편안한 폭
  - 들여쓴 하위 항목
  - 단어가 중간에서 끊기지 않는 줄바꿈
- 종이처럼 따뜻한 배경

1. 파일을 끌어다 놓는다
2. 목차로 원하는 곳까지 이동한다
3. 다른 편집기에서 고치면 자동으로 새로고침된다

### 할 일

- [x] 디자인 방향 정하기
- [x] 마크다운 렌더링
- [ ] 윈도우 설치 파일 만들기

## 코드

```javascript
// 문서를 읽고 화면에 그린다
async function openPath(path) {
  const text = await invoke("read_markdown", { path });
  render(text, path);
  return text.length;
}
```

```python
def reading_time(words: int, wpm: int = 250) -> float:
    """대략적인 읽기 시간(분)"""
    return round(words / wpm, 1)
```

## 표

| 요소 | 글꼴 | 크기 |
| --- | --- | ---: |
| 제목 | Noto Serif KR | 2.05em |
| 본문 | Pretendard | 17px |
| 코드 | Cascadia Code | 0.86em |

---

## 그 밖의 것들

각주도 쓸 수 있습니다.[^1] 접을 수 있는 영역도 있습니다.

<details>
<summary>더 보기</summary>

숨겨 두었던 내용이 여기 있습니다.

</details>

#### 작은 제목

마지막 단락입니다. 끝까지 읽어 주셔서 고맙습니다.

[^1]: 각주는 문서 맨 아래에 작은 글씨로 모입니다.
