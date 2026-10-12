# MD Viewer

차분하고 읽기 좋은 윈도우용 마크다운 뷰어입니다.
좋은 종이책을 읽는 느낌을 목표로, 장식은 덜고 여백과 글자에 신경 썼습니다.

- **미색 종이 톤** 배경과 따뜻한 먹색 다크 모드
- 제목은 **Noto Serif KR**(명조), 본문은 **Pretendard**(고딕). 앱에 내장되어 인터넷 없이도 같은 모습
- 한 줄 약 40자 남짓의 편안한 본문 폭, 단어 단위 줄바꿈
- 강조색은 브론즈 한 가지만: 링크, 인용선, 목차 위치, 읽기 진행 막대

## 기능

- **편집**: `Ctrl+E`로 왼쪽 원문 · 오른쪽 미리보기 나란히 보기, `Ctrl+S`로 저장
  - 저장하지 않은 변경은 파일 이름 옆 작은 점으로 표시, 닫거나 다른 파일을 열 때 한 번 확인
  - 편집 중에 다른 곳에서 파일이 바뀌어도 내가 쓴 내용을 덮어쓰지 않음
- `.md` 파일 더블클릭으로 열기(설치 시 연결), 드래그 앤 드롭, `Ctrl+O`
- 왼쪽 목차와 현재 읽는 위치 표시
- 다른 편집기에서 저장하면 **자동 새로고침**(읽던 위치 유지)
- 코드 문법 색상, 표, 체크리스트, 각주, 접기(`<details>`), 상대 경로 이미지
- 문서 안의 다른 `.md` 링크는 뷰어에서, 웹 링크는 기본 브라우저에서 열림

| 단축키 | 동작 |
| --- | --- |
| `Ctrl+O` | 파일 열기 |
| `Ctrl+N` | 새 문서 |
| `Ctrl+E` | 편집 / 읽기 전환 |
| `Ctrl+S` / `Ctrl+Shift+S` | 저장 / 다른 이름으로 저장 |
| `Ctrl+\` | 목차 보이기/숨기기 |
| `Ctrl+D` | 테마 전환 (시스템 → 밝게 → 어둡게) |
| `Ctrl` `+` / `-` / `0` | 글자 크기 키우기 / 줄이기 / 기본값 |
| `Ctrl+R` | 다시 읽기 |

## 설치 파일 받기

GitHub의 **Actions → Windows 빌드** 에서 가장 최근 실행을 열고, 아래쪽 *Artifacts* 의
`MD-Viewer-Windows` 를 내려받아 압축을 풀면 `MD Viewer_x.y.z_x64-setup.exe` 가 있습니다.

## 직접 빌드하기

[Node.js](https://nodejs.org) 22 이상과 [Rust](https://rustup.rs)가 필요합니다.

```powershell
npm install
npm run tauri dev     # 개발 모드로 실행
npm run tauri build   # 설치 파일 만들기 → src-tauri/target/release/bundle/nsis/
```

## 구조

```
index.html            화면 뼈대
src/main.js           파일 열기, 목차, 단축키, 자동 새로고침
src/editor.js         편집기 (CodeMirror 6, 처음 편집할 때만 불러옴)
src/markdown.js       마크다운 → HTML 변환 (markdown-it + highlight.js)
src/style.css         디자인 (색 토큰은 맨 위에)
src/fonts/            내장 글꼴 설정
src-tauri/            윈도우 앱 껍데기 (Tauri 2, Rust)
docs/sample.md        디자인 확인용 샘플 문서
```
