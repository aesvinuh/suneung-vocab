# 수능 단어: 뉘앙스 암기 웹앱

대중교통에서 폰 하나로, 한 손으로 계속 푸는 수능 영단어 앱입니다.
철자가 아니라 **단어를 보면 뜻과 뉘앙스가 바로 떠오르게** 만드는 것이 목표입니다.

- Vite + React, 서버·로그인 없음. 데이터는 브라우저 IndexedDB에 저장됩니다.
- 외부 API를 쓰지 않습니다. 처음 페이지를 열 때만 인터넷이 필요합니다.
- 처음 열면 홈에서 **샘플 단어 15개 넣기**를 눌러 바로 시작할 수 있습니다.

---

## 1. 폴더 구조

```
suneung-vocab/
├─ 실행하기.command        더블클릭으로 실행 (macOS)
├─ 종료하기.command        서버 끄기
├─ dist/                   빌드된 앱 (Node 없이 실행용)
├─ index.html
├─ vite.config.js            base: './' (GitHub Pages 하위 경로 대응)
├─ .github/workflows/deploy.yml   main에 push하면 GitHub Pages 자동 배포
├─ public/                   아이콘, manifest (홈 화면에 추가용)
├─ tests/logic.test.js       핵심 로직 테스트 (npm test)
└─ src/
   ├─ main.jsx, App.jsx      진입점, 해시 라우팅(#/words 등)
   ├─ styles.css             전체 스타일 (색 변수는 맨 위 :root)
   ├─ db/db.js               IndexedDB 읽기/쓰기 (idb 라이브러리)
   ├─ store/VocabContext.jsx 앱 상태 + 저장 (단어 추가·수정·삭제, 채점 기록, 백업 복원)
   ├─ lib/
   │  ├─ weights.js          ★ 출제 가중치 · 졸업 조건 · 유형 비율 (조정은 여기서만)
   │  ├─ questions.js        6가지 문제 유형 생성, 오답 보기 선택
   │  ├─ inflect.js          활용형(-s/-ed/-ing…) 인식, 빈칸·밑줄 처리
   │  ├─ grading.js          채점 결과를 기록·오답 노트에 반영
   │  ├─ explain.js          오답 해설 생성 (Claude API 연결 지점)
│  ├─ dictionary.js       사전 조회 (Merriam-Webster → Free Dictionary)
│  ├─ aiFill.js           Claude로 한국어 뜻·뉘앙스·해석 생성
│  ├─ autofill.js         자동 채우기 흐름, 빈 칸만 병합
│  ├─ apiKeys.js          API 키 (브라우저 localStorage)
   │  ├─ parse.js            일괄 추가 텍스트 파서
   │  ├─ backup.js           JSON 내보내기/불러오기
   │  ├─ word.js             단어 데이터 구조, 공통 함수
   │  └─ router.js           해시 라우터
   ├─ components/            TabBar, PageHeader, WordForm, WordDetail
   ├─ screens/               Home, Study, AddWord, BulkAdd, WordList, EditWord, WrongNote, Settings
   └─ data/sampleWords.js    샘플 단어 15개
```

## 2. 데이터 구조

IndexedDB `suneung-vocab`에 저장소(object store)가 2개 있습니다.

**words**: 단어 1개당 1레코드

```js
{
  id: 'uuid',
  word: 'reluctant',
  meanings: ['꺼리는', '마지못해 하는'],   // 필수, 여러 개
  pos: 'adj',                              // n v adj adv prep conj phr
  tone: 'negative',                        // positive | negative | neutral | '' (뉘앙스 문제용)
  nuance: '약한 부정. 하기 싫어서 꺼림…',   // 자유 메모
  definition: 'not willing to do …',        // 영영 뜻풀이 (자동 채우기)
  example: 'Many residents were reluctant to …',
  exampleKo: '많은 주민들이 … 꺼렸다.',
  synonyms: ['hesitant'], antonyms: ['willing'],
  sources: { meanings: 'ai', example: 'mw' }, // 칸별 출처 (mw | fd | ai | user)
  createdAt, updatedAt,                    // 자동
  stats: {                                 // 자동
    shown, correct, wrong,                 // 출제·정답·오답 횟수
    lastShownAt, lastWrongAt,              // 마지막 출제·오답 시각
  },
  note: {                                  // 오답 노트 (자동)
    inNote,            // 현재 노트에 있는지
    streak,            // 노트 학습 연속 정답
    enteredAt, graduatedAt, graduations,
    confusedWith: { [단어id]: 횟수 },      // 틀릴 때 골랐던 오답 보기
  },
}
```

**daily**: 날짜별 풀이 수 `{ date: '2026-10-22', answered, correct }` (홈의 '오늘 푼 문제/정답률')

단어장 구분 없이 하나의 목록입니다. `tone`을 비워 두면 뉘앙스 메모에 '긍정/부정/중립' 중 한 단어만 들어 있을 때 자동으로 인식합니다.

## 3. 출제 가중치 (`src/lib/weights.js`)

매 문제마다 후보 단어 각각의 가중치를 계산하고, 가중치에 비례하는 확률로 하나를 뽑습니다.

```
가중치 = max(최소값 0.5,  최근추가 + 오답률 + 경과시간 [+ 오답노트 보너스])
```

| 항목 | 계산 | 기본값 의미 |
|---|---|---|
| 최근 추가 | `6 × 0.5^((추가 후 일수 − 2) / 3)` | 추가 후 2일은 +6 그대로, 이후 3일마다 절반 (5일 뒤 +3, 8일 뒤 +1.5 …) |
| 오답률 | `6 × (오답 + 1) / (출제 + 3)` | 새 단어는 +2로 시작. 7/10 틀린 단어 ≈ +3.7, 0/30 ≈ +0.2 |
| 경과 시간 | `3 × min(1, 마지막 출제 후 일수 / 10)` | 10일 이상 안 나왔거나 처음이면 +3 |
| 오답 노트 보너스 | `1.5 × min(틀린 횟수, 8)` | 오답 노트 학습에서만 |
| 쿨다운 | 최근 5문제 안에 나온 단어는 제외 | 단어가 6개 미만이면 자동으로 줄어듦 |
| 최소값 | 0.5 | 잘 아는 단어도 가끔 나옴 |

예: 오늘 추가한 새 단어 ≈ 11, 자주 틀리고 오래된 단어 ≈ 4~7, 30번 다 맞힌 단어 ≈ 0.5~3.

출제가 마음에 들지 않으면 `WEIGHT_CONFIG` 숫자만 바꾸면 됩니다. 단어 수정 화면 아래에 그 단어의 현재 가중치 내역이 표시됩니다.
같은 파일에 `TYPE_WEIGHTS`(문제 유형별 출제 비율)와 `GRADUATION`(졸업 조건)도 있습니다.

## 4. 문제 유형

단어를 먼저 뽑은 뒤, 그 단어로 만들 수 있는 유형 중 하나를 랜덤으로 고릅니다.

| 유형 | 필요한 데이터 |
|---|---|
| 1. 단어 → 뜻 4지선다 | 뜻, 다른 단어 3개 이상 |
| 2. 예문 빈칸 → 단어 4지선다 | 예문에 단어(활용형 포함)가 있어야 함 |
| 3. 예문 밑줄 → 문맥상 의미 | 예문 |
| 4. 유의어 중 문맥에 맞는 단어 | 예문 + 서로 유의어로 등록된 다른 단어 (예문 해석을 힌트로 표시) |
| 5. 뉘앙스 고르기 | 감정 톤(긍정/부정/중립) 또는 뉘앙스 메모 |
| 6. 자기평가 카드 | 항상 가능 |

- 오답 보기는 **같은 품사**와 **뜻이 비슷한(한글 뜻이 겹치는)** 단어를 우선으로, 예전에 헷갈렸던 단어도 조금 더 자주 넣습니다.
- 빈칸 문제에서는 정답과 유의어 관계인 단어나 뜻이 같은 단어를 오답 보기에서 뺍니다(정답이 두 개가 되지 않도록).
- 불규칙 활용(went, fought)은 예문에서 `*fought*`처럼 별표로 감싸면 그 부분을 빈칸으로 씁니다.
- 자기평가: '뉘앙스까지 떠오름'은 정답, '뜻만 떠오름'은 정답이지만 오답 노트 졸업 연속 횟수에는 넣지 않음, '모름'은 오답입니다.

## 5. 오답 노트

- 한 번이라도 틀리면 자동 등록됩니다. 틀릴 때 고른 보기 단어가 '헷갈렸던 단어'로 쌓입니다.
- **오답 노트 학습**에서 연속 3번 맞히면 졸업합니다. 기록은 남고, 다시 틀리면 재등록됩니다.
  (일반 학습에서 맞힌 것도 세려면 `GRADUATION.countInNormalMode = true`)
- 목록은 틀린 횟수 / 오답률 / 최근에 틀린 순으로 정렬할 수 있고, 졸업한 단어는 '졸업' 탭에 있습니다.

## 6. 단어 입력

- **단어 추가**: 단어와 뜻만 쓰고 바로 '추가하고 계속'. 나머지는 '+ 품사 · 뉘앙스 · 예문 · 유의어'를 펼쳐서 입력합니다.
- **일괄 추가**: 한 줄에 하나씩

  ```
  단어 | 뜻 | 뉘앙스 | 예문 | 예문 해석
  reluctant | 꺼리는, 마지못해 하는 | 부정적. 하기 싫어서 꺼림 | He was reluctant to go. | 그는 가기를 꺼렸다.
  ```
  뒤쪽 칸은 비워도 되고, `| 품사 | 유의어 | 반의어`를 더 붙일 수 있습니다. 엑셀/구글시트에서 복사한 탭 구분도 됩니다. 이미 있는 단어는 건너뜁니다.

## 7. 단어 자동 채우기

단어 추가 화면에서 영어 단어만 쓰고 **자동 채우기**를 누르면:

1. **Merriam-Webster Learner's** 사전에서 품사·영영 뜻풀이·예문·유의어를 가져옵니다.
2. 없거나 실패하면 **Free Dictionary**(dictionaryapi.dev, 키 불필요)로 대체합니다. MW에 유의어/반의어가 없을 때도 Free Dictionary로 보충합니다.
3. 뜻이 여러 개면 목록에서 **외울 뜻을 고릅니다**(여러 개 가능).
4. 고른 영영 뜻풀이와 예문을 **Claude API**(`claude-opus-5-5`)에 보내 한국어 뜻, 뉘앙스 메모, 예문 해석을 만듭니다.
   프롬프트는 "사전 자료를 근거로만 쓰고 없는 뜻을 만들지 말 것"을 지시합니다. 사전에 예문이 없을 때만 AI가 예문을 씁니다.
5. 바로 저장하지 않고 **미리보기**에 보여 줍니다. 칸마다 출처(Merriam-Webster / Free Dictionary / AI 생성)가 붙고, 고친 칸은 '직접 입력'으로 바뀝니다.

- 인터넷이 끊기면 버튼이 '오프라인'으로 바뀌고 직접 입력만 됩니다.
- **미완성 단어 일괄 자동 채우기**: 뜻 없이 단어만 추가해 두면 '미완성'이 됩니다(뜻·뉘앙스·예문 중 하나라도 비면 미완성).
  단어 목록이나 홈의 링크 → 한 번에 최대 20개 → 뜻 고르기 → 미리보기에서 확인 후 저장. **비어 있는 칸만 채우고 직접 쓴 내용은 덮어쓰지 않습니다.**
- 뜻이 없는 단어는 출제되지 않습니다.
- 사용한 Claude 요청은 Anthropic 콘솔 계정에 사용량만큼 청구됩니다(단어 1개당 요청 1번). Merriam-Webster는 비상업용 무료(하루 1,000회)입니다.
- 관련 코드: `src/lib/dictionary.js`(사전), `src/lib/aiFill.js`(Claude), `src/lib/autofill.js`(흐름·병합 규칙).

### API 키 관리

- 설정 → **자동 채우기 API 키**에 입력합니다. 키는 **그 기기 그 브라우저의 localStorage에만** 저장됩니다.
- 코드에 키를 넣지 않으므로 GitHub에 올라갈 일이 없고, JSON 백업 파일에도 포함되지 않습니다. 폰·컴퓨터(아이폰은 홈 화면 앱도)에서 각각 입력하세요.
- '확인' 버튼으로 키가 맞는지 확인할 수 있습니다(Claude 키 확인은 요금이 들지 않는 모델 정보 조회).
- 이 페이지를 열 수 있는 다른 사람이 키를 볼 수는 없지만, **본인 폰에 저장된 키는 그 폰을 쓰는 사람이 볼 수 있습니다.** 공용 기기에는 넣지 마세요.

### 왜 중계 서버(Vercel) 없이 되나요?

브라우저는 다른 사이트의 API를 부를 때, 그 API가 응답에 "이 사이트에서 불러도 된다"는 허가(CORS 헤더)를 주는지 확인합니다. 2026-10-24에 직접 확인한 결과:

| API | CORS | 결과 |
|---|---|---|
| Merriam-Webster (`dictionaryapi.com`) | `Access-Control-Allow-Origin: *` | 브라우저에서 바로 호출 가능 |
| Free Dictionary (`dictionaryapi.dev`) | 원래 `*` 허용. 확인한 날은 서비스 장애(오류 530) | 바로 호출. 장애 시 MW 결과만 사용 |
| Claude (`api.anthropic.com`) | `anthropic-dangerous-direct-browser-access` 헤더를 보내면 허용 | 바로 호출 (SDK `dangerouslyAllowBrowser`) |

그래서 Vercel 서버리스 함수는 필요 없습니다. Anthropic이 브라우저 직접 호출에 "dangerous"라는 이름을 붙인 이유는, 키를 웹페이지 코드에 박아 두면 누구나 훔쳐 갈 수 있기 때문입니다.
이 앱은 키를 코드에 넣지 않고 **본인이 본인 기기에 입력**하는 방식이라 그 위험이 없습니다.
나중에 다른 사람도 쓰게 하면서 내 키를 숨겨야 한다면, 그때는 Vercel 같은 서버에 키를 두고 중계해야 합니다.

## 8. 백업

설정 → **JSON으로 내보내기 / 불러오기**. 불러올 때 '합치기'(같은 단어는 건너뜀) 또는 '전체 교체'를 고를 수 있습니다.
데이터는 그 기기의 그 브라우저에만 있으니, 폰을 바꾸거나 크롬 데이터를 지우기 전에 꼭 내보내 두세요.
(배포 주소가 바뀌어도 데이터는 옮겨지지 않습니다. 내보내기 → 새 주소에서 불러오기)

## 9. Claude API 해설 붙이기 (나중에)

`src/lib/explain.js`의 `fetchContextNote()`만 구현하면 해설 화면에 '문맥 해설'이 표시됩니다.
API 키를 브라우저 코드에 넣으면 누구나 볼 수 있으므로, Cloudflare Workers 같은 무료 프록시에 키를 두고 그 주소를 호출하는 방식을 권장합니다(파일 안에 예시 주석이 있습니다).

---

## 10. 내 컴퓨터에서 실행

### 가장 쉬운 방법: 더블클릭

macOS에서 `실행하기.command`를 더블클릭하면 고정 포트(5180)로 로컬 서버를 백그라운드로 켜고 기본 브라우저로 열어 줍니다.
이미 서버가 켜져 있으면 새로 띄우지 않고 그 서버를 그대로 엽니다. 저장 데이터는 포트별로 따로 저장되므로 포트를 항상 고정합니다.

- **Node.js가 없어도 됩니다.** 빌드된 앱(`dist` 폴더)이 함께 들어 있어서 macOS 기본 `python3`만으로 실행됩니다.
- Node.js가 설치되어 있고 `src`를 고쳤다면 실행할 때 자동으로 다시 빌드합니다.
- 실행 창에 `같은 와이파이의 폰에서 열기: http://192.168.x.x:5180/` 주소가 나옵니다. 집에서 폰으로 바로 써 볼 때 사용하세요.
  밖에서(대중교통에서) 쓰려면 아래 11번처럼 인터넷에 배포해야 합니다.
- 서버를 끄려면 `종료하기.command`를 더블클릭하세요. 꺼도 단어 데이터는 그대로 남습니다.

⚠️ **최초 1회는 터미널에서 실행 권한을 줘야 합니다** (macOS는 다운로드/압축 해제된 스크립트를 기본적으로 실행 차단합니다):

```bash
cd suneung-vocab
chmod +x 실행하기.command 종료하기.command
```

그 다음부터는 그냥 더블클릭하면 됩니다. 처음 더블클릭할 때 "확인되지 않은 개발자" 경고가 뜨면, 파일을 **우클릭 → 열기 → 열기**를 한 번 누르면 이후로는 더블클릭으로 열립니다.

### 수동 실행 (개발용)

[Node.js](https://nodejs.org) LTS(20 이상)를 설치한 뒤:

```bash
cd suneung-vocab
npm install
npm run dev        # http://localhost:5173 (코드 수정이 바로 반영됨)
npm test           # 로직 테스트
npm run build      # dist/ 다시 만들기
```

`npm run dev`의 주소(5173)는 `실행하기`의 주소(5180)와 포트가 달라서 단어 데이터가 따로 저장됩니다.

## 11. 무료 배포: GitHub Pages (추천)

이 저장소에는 자동 배포 설정(`.github/workflows/deploy.yml`)이 이미 들어 있습니다.

1. [github.com](https://github.com)에 가입하고 로그인합니다.
2. 오른쪽 위 **+** → **New repository**. 이름(예: `suneung-vocab`)을 정하고 **Public**을 선택한 뒤 **Create repository**를 누릅니다.
   (무료 계정에서 GitHub Pages는 Public 저장소만 지원합니다. 저장소에는 코드만 올라가고, 내 단어 데이터는 폰에만 있으니 공개돼도 괜찮습니다.)
3. 컴퓨터 터미널에서 프로젝트 폴더로 가서 올립니다 (`아이디`를 내 GitHub 아이디로 바꾸세요):
   ```bash
   cd suneung-vocab
   git init
   git add .
   git commit -m "first commit"
   git branch -M main
   git remote add origin https://github.com/아이디/suneung-vocab.git
   git push -u origin main
   ```
   비밀번호를 물으면 GitHub 비밀번호 대신 **Personal access token**을 넣어야 합니다
   (Settings → Developer settings → Personal access tokens). [GitHub Desktop](https://desktop.github.com)을 쓰면 이 과정이 더 쉽습니다.
4. GitHub 저장소 페이지 → **Settings** → 왼쪽 **Pages** → **Build and deployment**의 Source를 **GitHub Actions**로 바꿉니다.
5. 저장소의 **Actions** 탭에서 `Deploy to GitHub Pages`가 초록색 체크가 될 때까지 1~2분 기다립니다.
   (4번보다 push를 먼저 해서 첫 실행이 실패했다면, Actions 탭에서 그 실행을 열고 **Re-run jobs**를 누르세요.)
6. 주소 `https://아이디.github.io/suneung-vocab/`를 폰 크롬에서 엽니다.
7. 크롬 메뉴 **⋮** → **홈 화면에 추가**를 누르면 앱처럼 전체 화면으로 실행됩니다.

이후에는 코드를 고치고 `git push`만 하면 자동으로 다시 배포됩니다. 배포해도 폰에 저장된 단어는 그대로 남습니다.

## 12. 무료 배포: Vercel (대안)

1. 위 1~3단계처럼 GitHub에 코드를 올립니다.
2. [vercel.com](https://vercel.com)에서 **Continue with GitHub**로 가입합니다.
3. **Add New… → Project** → 방금 만든 저장소의 **Import**를 누릅니다.
4. Framework Preset이 **Vite**로 자동 선택되었는지 확인합니다 (Build Command `npm run build`, Output Directory `dist`). **Deploy**를 누릅니다.
5. 1분 정도 뒤 나오는 `https://suneung-vocab-xxxx.vercel.app` 주소를 폰에서 엽니다.

GitHub에 push할 때마다 Vercel도 자동으로 다시 배포합니다.
