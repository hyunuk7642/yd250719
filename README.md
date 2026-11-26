# 떠다니는 서재

책들이 공중에 떠 있는 서재 웹앱입니다. 책을 누르면 책상 앞으로 날아와 표지가 열리고, 한 장씩 넘겨 읽을 수 있습니다.

첫 책: **양자컴퓨팅 융합교육 교사용 지도서 · A안** (서울온라인학교 AI융합교육 교사 연구회, 96쪽)
Figma 원본 「서울온라인학교 양자컴퓨팅 지도서 · A안」의 프레임 96개(앞표지, 2–95쪽, 뒤표지)를 2배 해상도로 내보내 넣었습니다.

## 실행

빌드 과정이 없는 정적 사이트입니다. 저장소 폴더에서:

```bash
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000` 을 엽니다. `index.html` 을 바로 더블클릭해도 열립니다(글꼴은 인터넷이 있을 때 Google Fonts에서 받습니다).

`http://localhost:8000/#quantum-guide` 처럼 주소 끝에 책 id를 붙이면 서재에 들어오자마자 그 책이 펼쳐집니다.

## 조작

| 동작 | 방법 |
| --- | --- |
| 책 펼치기 | 떠 있는 책을 누르기 (키보드: Tab으로 고르고 Enter) |
| 쪽 넘기기 | 쪽을 누르거나 모서리를 끌기, 휴대폰은 밀기, `←` `→`, `Space`, 마우스 휠 |
| 처음·끝 | `Home` `End` |
| 원하는 쪽으로 | 아래 쪽 이동 막대(끌면 미리보기), 목차(`T`)의 항목이나 쪽 그림 |
| 크게 보기 | 「크게」 단추 또는 `Z`, 안에서 `←` `→` 로 쪽 이동, 「더 크게」로 원본 해상도 |
| 서재로 돌아가기 | 「서재」 단추 또는 `Esc` (책을 덮고 제자리로 날아갑니다) |

읽던 쪽은 브라우저에 저장되어, 다음에 펼치면 「이어 읽기」를 제안합니다. 책장 소리는 위쪽 스피커 단추로 끌 수 있습니다.
움직임 줄이기 설정(prefers-reduced-motion)을 켠 기기에서는 날아오는 장면과 떠다니는 움직임을 줄입니다.

## 구성

```
  index.html            화면 뼈대
  css/library.css       모든 스타일 (밤의 열람실 색, 입체 책, 읽기 화면)
  js/books.js           책 목록 ← 새 책은 여기에 추가
  js/scene.js           떠다니는 서재 (입체 책, 먼지, 시차)
  js/reader.js          읽기 화면 (책장 넘김, 쪽 이동 막대, 목차, 크게 보기)
  js/app.js             서재 ↔ 읽기 화면 전환, 키보드, 읽던 곳 저장
  js/sound.js           책장 소리 (WebAudio로 만든 소리, 파일 없음)
  vendor/               page-flip 2.0.7 (MIT, 책장 넘김 효과)
  books/<id>/           책마다 cover.webp, back.webp, pages/, thumbs/
  tools/make_book.py    PNG 쪽 이미지를 책 폴더로 바꾸는 도구
```

## 새 책 넣기

1. Figma에서 책의 쪽 프레임을 **2배(2x) PNG**로 내보냅니다. 파일 이름순이 곧 쪽 순서이므로 `p001.png`(앞표지) … `p096.png`(뒤표지)처럼 번호를 붙입니다.
2. 책 폴더를 만듭니다 (Pillow 필요: `pip install pillow`).

   ```bash
   python3 tools/make_book.py <PNG 폴더> books/<책 id>
   ```

3. `js/books.js` 의 배열에 항목을 하나 더 적습니다. 필요한 값:
   - `id` 폴더 이름과 같게, `title`, `subtitle`, `publisher`, `year`, `note`
   - `pageCount` 쪽 수(표지 포함), `pageWidth`·`pageHeight` 원본 프레임 크기(비율에만 씀)
   - `dir` 예: `'books/<책 id>'`
   - `colors` 표지·책등 색, `spine` 책등 글자
   - `pageLabel(i)` 쪽 번호 표기, `toc` 목차(인쇄된 쪽 번호 기준)

책이 늘면 장식용 빈 책은 그만큼 줄어듭니다.

## 배포

저장소를 그대로 Netlify, Vercel, GitHub Pages 같은 정적 호스팅에 연결하면 됩니다. 빌드 명령은 비워 두고, 공개 디렉터리는 저장소 루트입니다.
