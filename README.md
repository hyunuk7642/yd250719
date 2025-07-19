# YouTube 썸네일 다운로더

YouTube URL을 입력하면 썸네일을 다운로드하는 GUI 프로그램입니다.

## 특징

- 🖥️ **크로스 플랫폼**: Windows와 macOS에서 모두 동작
- 🎯 **간편한 GUI**: PyQt5를 사용한 직관적인 인터페이스
- 🎨 **다양한 품질**: 최고 해상도부터 기본 품질까지 선택 가능
- 📁 **자유로운 저장**: 원하는 폴더에 썸네일 저장
- 📝 **실시간 로그**: 다운로드 진행 상황 실시간 확인

## 필요한 라이브러리

```
PyQt5>=5.15.0
yt-dlp>=2023.1.6
requests>=2.25.0
Pillow>=8.0.0
```

## 설치 방법

1. **Python 3.7+ 설치 확인**
   ```bash
   python --version
   ```

2. **필요한 라이브러리 설치**
   ```bash
   pip install -r requirements.txt
   ```
   
   또는 개별 설치:
   ```bash
   pip install PyQt5 yt-dlp requests Pillow
   ```

## 사용법

1. **프로그램 실행**
   ```bash
   python yd.py
   ```

2. **YouTube URL 입력**
   - YouTube 비디오 URL을 입력창에 붙여넣기
   - 지원 형식: 
     - `https://www.youtube.com/watch?v=VIDEO_ID`
     - `https://youtu.be/VIDEO_ID`
     - `https://www.youtube.com/embed/VIDEO_ID`

3. **설정 선택**
   - **썸네일 품질**: 최고 해상도, 고품질, 중간 품질, 표준 품질, 기본 중 선택
   - **저장 경로**: "찾아보기" 버튼으로 저장할 폴더 선택

4. **다운로드 실행**
   - "썸네일 다운로드" 버튼 클릭
   - 로그 창에서 진행 상황 확인

## 품질별 해상도

| 품질 옵션 | 대략적인 해상도 | 설명 |
|-----------|----------------|------|
| 최고 해상도 | 1920x1080+ | 가장 높은 해상도의 썸네일 |
| 고품질 | 1280x720+ | 고화질 썸네일 |
| 중간 품질 | 640x480+ | 중간 화질 썸네일 |
| 표준 품질 | 480x360+ | 표준 화질 썸네일 |
| 기본 | 120x90+ | 기본 화질 썸네일 |

## 파일 형식

다운로드되는 썸네일은 다음 형식 중 하나입니다:
- `.jpg` (JPEG)
- `.png` (PNG)
- `.webp` (WebP)

## 저장 파일명

```
{비디오_제목}_thumbnail_{품질}.{확장자}
```

예시: `Amazing Video_thumbnail_maxres.jpg`

## 에러 해결

### 일반적인 문제

1. **"모듈을 찾을 수 없습니다" 오류**
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

2. **권한 오류 (macOS/Linux)**
   ```bash
   chmod +x yd.py
   ```

3. **Qt 관련 오류 (macOS)**
   ```bash
   # Homebrew로 Qt 설치
   brew install qt5
   ```

### macOS 특별 고려사항

1. **Gatekeeper 경고**
   - 시스템 환경설정 > 보안 및 개인정보보호에서 실행 허용

2. **파이썬 경로 문제**
   ```bash
   # 시스템 파이썬 대신 Homebrew 파이썬 사용 권장
   brew install python
   ```

### Windows 특별 고려사항

1. **PATH 환경변수 설정**
   - Python과 pip이 PATH에 추가되어 있는지 확인

2. **Microsoft Visual C++ 재배포 패키지**
   - PyQt5 설치 시 필요할 수 있음

## 개발 환경

- **언어**: Python 3.7+
- **GUI 프레임워크**: PyQt5
- **YouTube 데이터**: yt-dlp
- **이미지 처리**: Pillow
- **네트워크**: requests

## 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.

## 주의사항

- YouTube의 이용약관을 준수하여 사용하세요
- 개인적인 용도로만 사용하세요
- 저작권이 있는 콘텐츠의 무단 사용을 피하세요

## 문제 신고

프로그램 사용 중 문제가 발생하면 로그 창의 오류 메시지를 확인하여 문제를 진단할 수 있습니다.
