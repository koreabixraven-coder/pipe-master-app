const CACHE_NAME = 'pipe-master-v31-24-theory-memory-tts-chapter-title-step';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './questions.js',
  './theory.js',
  './sw.js',
  './icon-72.png',
  './icon-96.png',
  './icon-128.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME && (k.startsWith('pipe-master') || k.includes('pipe')))
        .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function isAppCoreRequest(req){
  const url = new URL(req.url);
  return req.mode === 'navigate'
    || url.pathname.endsWith('/index.html')
    || url.pathname.endsWith('/theory.js')
    || url.pathname.endsWith('/questions.js')
    || url.pathname.endsWith('/sw.js')
    || url.pathname.endsWith('/manifest.json');
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  if (isAppCoreRequest(e.request)) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone)).catch(() => null);
        return res;
      }).catch(() => caches.match(e.request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone)).catch(() => null);
        return res;
      });
    }).catch(() => caches.match('./index.html'))
  );
});

// v31.06: Galaxy Tab TTS rate slider sync fix added on v31.05; data, TTS unit symbol read fix, and question jump list retained

// v31.07: 2007-41회 10번 정답 ④ 및 해설 사용자 제공 원본 사진 기준 교정

// v31.08: 2007-41회 53번 정답 ①, 2007-42회 4번 정답 ② 및 해설 교정

// v31.09: 2025-1회 CBT 복원문제 60문항 원본 사진 및 HTML 대조 반영, ★ 표시

// v31.10: 기출회차41회~63회 탑재 데이터 기준 반복·유사 출제 표시 기능 추가

// v31.11: 문제 번호 이동창 1~60 번호판에 반복출제 뱃지(예: 🔁2, 🔁3)를 표시. 문제/보기/정답/해설 데이터 변경 없음


// v31.13: 태블릿 가로모드 문제풀이 화면 1행 로고/조작아이콘 고정, 2행 본문 독립 스크롤 영역 적용.

// v31.14: 2025년 배관기능장 CBT 필기시험 복원문제(2) 60문항 원본대조 추가.
// v31.15: 기출복원문제에도 반복출제 뱃지와 암기완료 청취 제외 기능 적용.

// v31.16: 기출복원문제 반복출제 뱃지 미표시 방지용 런타임 보정 및 questions.js 캐시버스터 갱신.

// v31.17: 기출복원문제 번호이동창 반복뱃지가 DB 메타데이터뿐 아니라 index 내 복원 반복참조표를 직접 참조하도록 보정.

// v31.18: 문제번호 이동창에서 암기완료 문제를 녹색 테두리와 ✓암기 뱃지로 더 명확히 표시.

// v31.20: 버그 수정 및 데드코드 정리.
//   BUG: 재생아이콘 자동갱신 .active→.show 클래스 오타 수정 (4019행).
//   BUG: 기출63회 DB 미존재 — QUIZ_GROUPS에서 제거.
//   중복: synth.onvoiceschanged + tryLoadV() 2중 호출 삭제.
//   데드코드: 빈 stub 함수 6개, 미사용 유틸 함수 10개, ttsStop 별칭 삭제.

// v31.21: 교차회차 암기완료 제외 버그 수정.
//   isMemorizedQuestion()가 직접키만 확인 → _repeatRefs 교차참조도 확인하도록 보강.
//   "현재 문제 암기완료"만 눌러도 다른 회차의 동일문제가 재생에서 제외됨.

// v31.22: 이론 항목 중 memory 암기문장만 별도 목록으로 모아보기 추가. 이론/문제 데이터 변경 없음.


// v31.23: 이론/암기문장 TTS에서 암기문장·페이지·반복 표기 생략, 1.2.3./가.나.다./원형문자/콜론 문단 쉼타임 강화. 데이터 변경 없음.

// v31.24: Theory memory TTS reads subject, chapter/subtitle, then memory content.
