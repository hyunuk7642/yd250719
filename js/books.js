/*
 * 서재에 꽂힌 책 목록.
 * 새 책을 넣으려면: books/<id>/pages 에 쪽 이미지(p001.webp …)를 넣고,
 * tools/make_book.py 로 표지·썸네일을 만든 뒤 아래 배열에 항목을 하나 더 적으면 됩니다.
 */
window.LIBRARY_BOOKS = [
  {
    id: 'quantum-guide',
    title: '양자컴퓨팅 융합교육',
    subtitle: '교사용 지도서 · A안',
    publisher: '서울온라인학교 AI융합교육 교사 연구회',
    year: 2026,
    note: '1–8차시 통합본',
    pageCount: 96,
    // Figma 원본 프레임 크기(A4, 96dpi). 비율 계산에만 씁니다.
    pageWidth: 794,
    pageHeight: 1123,
    dir: 'books/quantum-guide',
    // 표지 색은 원본 표지의 위·아래 띠 색에서 가져왔습니다.
    colors: { cover: '#b9dfdf', spine: '#a7d4d4', spineInk: '#123a40', edge: '#f4f8f8' },
    spine: '양자컴퓨팅 융합교육 · 교사용 지도서',
    // 0번은 앞표지, 마지막은 뒤표지. 그 사이는 인쇄된 쪽 번호(2쪽부터)와 같습니다.
    pageLabel: function (i) {
      if (i === 0) return '앞표지';
      if (i === this.pageCount - 1) return '뒤표지';
      return (i + 1) + '쪽';
    },
    // 3쪽 목차를 그대로 옮겼습니다. page 는 인쇄된 쪽 번호입니다.
    toc: [
      {
        title: '이 책에 대하여',
        items: [
          { label: '이 책의 구성과 활용', page: 2 },
          { label: '목차', page: 3 },
          { label: '프로그램 한눈에 보기', page: 4 }
        ]
      },
      {
        title: '01 양자역학 역사 · 양자컴퓨터의 기초',
        meta: '1–2차시 · 기술 · 80분',
        items: [
          { label: '모듈 안내', page: 5 },
          { label: '수업 운영과 준비', page: 12 },
          { label: '수업 지도와 해설', page: 13 },
          { label: '예시 답안·평가·피드백', page: 18 }
        ]
      },
      {
        title: '02 첫 양자 회로 · 중첩과 측정',
        meta: '3–4차시 · 정보 · 80분',
        items: [
          { label: '모듈 안내', page: 6 },
          { label: '수업 운영과 준비', page: 23 },
          { label: '수업 지도와 해설', page: 26 },
          { label: '예시 답안·평가·피드백', page: 33 }
        ]
      },
      {
        title: '03 양자 얽힘 · 양자 알고리즘',
        meta: '5–6차시 · 정보 · 80분',
        items: [
          { label: '모듈 안내', page: 8 },
          { label: '수업 운영과 준비', page: 40 },
          { label: '수업 지도와 해설', page: 43 },
          { label: '예시 답안·평가·피드백', page: 51 }
        ]
      },
      {
        title: '04 파동과 확률 · 수학·물리의 연결',
        meta: '7–8차시 · 물리·수학 · 100분',
        items: [
          { label: '모듈 안내', page: 10 },
          { label: '수업 운영과 준비', page: 58 },
          { label: '수업 지도와 해설', page: 61 },
          { label: '예시 답안·평가·피드백', page: 68 }
        ]
      },
      {
        title: '학생 활동지 · 별도 인쇄용',
        items: [
          { label: '1차시 양자역학 역사와 인물 탐색', page: 77 },
          { label: '2차시 양자컴퓨터 기초와 기술 이해', page: 79 },
          { label: '3차시 Qiskit으로 첫 양자 회로 만들기', page: 81 },
          { label: '4차시 확률 게임으로 중첩 이해하기', page: 83 },
          { label: '5차시 CX 게이트로 양자 얽힘 만들기', page: 85 },
          { label: '6차시 비밀 코드를 찾는 양자 알고리즘', page: 88 },
          { label: '7차시 파동으로 다시 읽는 측정 결과', page: 90 },
          { label: '8차시 수학·물리 짝 사전 만들기', page: 93 }
        ]
      }
    ]
  }
];
