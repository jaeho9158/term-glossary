# 논문용어사전

논문을 읽을 때 자주 막히는 통계·연구방법론 학술용어를 비전공자도 이해하기 쉽게 풀어 설명하는 정적 사이트입니다.

## 파일 구조

- `index.html` — 홈, 용어 목록
- `about.html`, `privacy.html`, `contact.html` — 소개 / 개인정보처리방침 / 문의
- `terms/*.html` — 용어별 상세 페이지 12개
- `style.css` — 공통 스타일

## 배포 방법 (GitHub Pages)

1. GitHub에서 새 리포지토리를 만듭니다. (Public으로 설정)
2. 이 폴더 전체를 그 리포지토리에 push합니다.
   ```
   git init
   git add .
   git commit -m "초기 사이트 구축"
   git branch -M main
   git remote add origin https://github.com/<본인아이디>/<리포지토리명>.git
   git push -u origin main
   ```
3. GitHub 리포지토리 페이지에서 **Settings → Pages**로 이동합니다.
4. Source를 **Deploy from a branch**로 설정하고, Branch는 `main` / `root`(또는 `/`)를 선택 후 저장합니다.
5. 몇 분 뒤 `https://<본인아이디>.github.io/<리포지토리명>/` 주소로 사이트가 열립니다.
6. 각 HTML 파일 안의 `<link rel="canonical" href="https://example.github.io/...">` 부분을 실제 발급받은 주소로 전부 바꿔주세요. (검색엔진이 정식 URL로 인식하도록 하는 필수 작업입니다.)
7. `contact.html`의 `example@example.com`도 실제 연락받을 이메일로 바꿔주세요.

## 검색엔진 등록 방법

### 구글 서치 콘솔 (Google Search Console)

1. https://search.google.com/search-console 접속 후 구글 계정으로 로그인합니다.
2. "속성 추가"에서 **URL 접두어** 방식을 선택하고, 배포된 사이트 주소(`https://<아이디>.github.io/<리포지토리명>/`)를 입력합니다.
3. 소유권 확인 방법 중 **HTML 파일 업로드** 방식을 권장합니다. 발급된 인증 파일(`google-xxxxxxxx.html`)을 다운로드해 사이트 루트 폴더(`index.html`과 같은 위치)에 넣고 다시 push한 뒤, 콘솔에서 "확인"을 누릅니다.
4. 등록 후 좌측 메뉴의 **Sitemaps**에서 사이트맵을 제출합니다. (사이트맵 파일이 없다면 우선 생략하고, 개별 페이지를 "URL 검사" 도구로 색인 요청해도 됩니다.)
5. 좌측 **URL 검사**에 홈 주소와 주요 용어 페이지 URL을 하나씩 넣고 "색인 생성 요청"을 눌러 구글에 즉시 알립니다.

### 네이버 서치어드바이저

1. https://searchadvisor.naver.com 접속 후 네이버 계정으로 로그인합니다.
2. "웹마스터 도구"에 사이트 주소를 등록합니다.
3. 소유 확인 방법 중 **HTML 파일 업로드**를 선택해 발급된 인증 파일을 루트 폴더에 넣고 push한 뒤 확인을 완료합니다.
4. 등록 후 좌측 메뉴 **요청 → 사이트맵 제출** 또는 **웹페이지 수집 요청**에서 홈 주소와 주요 페이지 URL을 제출합니다.

## 구글 애드센스 신청 전 체크리스트

- 콘텐츠 페이지 12개 이상 확보 (완료)
- 개인정보처리방침 페이지 확보 (완료, `privacy.html`)
- 사이트 소개·문의 페이지 확보 (완료)
- 실제 도메인(또는 github.io 주소)으로 몇 주간 운영하며 방문 기록을 쌓은 뒤 신청하는 것을 권장합니다.
- 애드센스 승인 후에는 `privacy.html`에 실제 발급받은 광고 관련 문구를 애드센스 대시보드 안내에 맞춰 보완하세요.
