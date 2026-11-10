# MD Viewer

차분하고 읽기 좋은 윈도우용 마크다운 뷰어입니다.
좋은 종이책을 읽는 느낌을 목표로, 장식은 덜고 여백과 글자에 신경 썼습니다.

- **미색 종이 톤** 배경과 따뜻한 먹색 다크 모드
- 제목은 **Noto Serif KR**(명조), 본문은 **Pretendard**(고딕). 앱에 내장되어 인터넷 없이도 같은 모습
- 한 줄 약 40자 남짓의 편안한 본문 폭, 단어 단위 줄바꿈
- 강조색은 브론즈 한 가지만: 링크, 인용선, 목차 위치, 읽기 진행 막대

## 기능

- **탭**: 여러 문서를 한 창에서 탭으로. 앱이 켜져 있을 때 다른 `.md`를 더블클릭해도 같은 창에 탭으로 추가
  - 다시 켜면 지난번 탭이 그대로, 첫 화면에는 최근 문서 목록
- **복사**: 코드 블록(프롬프트 등)에 마우스를 올리면 복사 버튼, 상단 버튼으로 문서 원문 통째로 복사
- **콜아웃**: `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]` 같은 알림 상자 (GitHub · Obsidian 방식)
- **수식 · 다이어그램**: `$E=mc^2$`, `$$ … $$` (KaTeX), ` ```mermaid ` 흐름도. 해당 내용이 있을 때만 불러옴
- **찾기** `Ctrl+F`, **인쇄 · PDF** `Ctrl+P`(어두운 테마여도 밝게 인쇄), 이미지 클릭하면 크게 보기
- 옆 칸에서 **목차 / 같은 폴더 파일** 전환
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
| `Ctrl+N` | 새 문서 (새 탭) |
| `Ctrl+W` | 탭 닫기 |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | 다음 / 이전 탭 |
| `Ctrl+1` … `Ctrl+9` | 해당 순서의 탭 (9는 마지막 탭) |
| `Ctrl+F` | 문서 안 찾기 (`Enter` 다음, `Shift+Enter` 이전) |
| `Ctrl+P` | 인쇄 · PDF로 저장 |
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
src/main.js           탭, 파일 열기, 목차, 찾기, 단축키, 자동 새로고침
src/editor.js         편집기 (CodeMirror 6, 처음 편집할 때만 불러옴)
src/markdown.js       마크다운 → HTML 변환 (markdown-it + highlight.js, 콜아웃 · 수식 표시)
src/rich.js           수식(KaTeX) · 다이어그램(Mermaid), 필요할 때만 불러옴
src/style.css         디자인 (색 토큰은 맨 위에)
src/fonts/            내장 글꼴 설정
src-tauri/            윈도우 앱 껍데기 (Tauri 2, Rust)
docs/sample.md        디자인 확인용 샘플 문서
docs/features.md      복사 · 콜아웃 · 수식 · 다이어그램 예시
```
