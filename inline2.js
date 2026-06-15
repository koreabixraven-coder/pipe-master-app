
/* 문제 데이터 DB는 questions.js에서 로드합니다. v30.48 기준 가로모드 성공버전 + 41회 교체본을 유지하고, 패드 가로모드에서 문제카드와 4지선다 보기를 상단에 배치하며 문제풀이 돌아가기, 전체읽기, 다음문제는 상단 아이콘으로 정리했습니다. */
const LEVELS = (typeof QUESTION_TOC!=="undefined" ? QUESTION_TOC : Object.keys(DB));
let curLevel = '배관공학의기초1';
let Qs = DB[curLevel];
let cur=0, answered=false, driveOn=false, theoryDriveOn=false, paused=false, locked=false;
let synth=window.speechSynthesis, voices=[], selV=null;
let rate=1.1, pitch=1.0, ns=0, pb=0.5, th=3;
let thTimer=null, nxTimer=null, pbTimer=null, wakeLock=null, wakeWanted=false, wakeLastReason='', wakeRetryTimer=null, wakeWatchTimer=null, holdTimer=null, resumeTask=null;
let quizResumeTask=null, speakToken=0;
const NL=[['1번','2번','3번','4번'],['1.','2.','3.','4.'],['첫번째','두번째','세번째','네번째']];

/* ── 화면 전환 ── */
function goScreen(id){
  if(typeof synth!=='undefined') synth.cancel();
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('show'));
  document.getElementById(id).classList.add('show');
  window.scrollTo(0,0);
  if(id==='screenHome') updateHomeCounts();
  if(id==='screenTheory') buildTheorySubjects();
  if(id==='screenQuizToc') buildQuizToc();
  if(id==='screenQuizStage') buildQuizStage();
  if(id==='screenQuiz'){ if(!quizPrepared) init(); updateQuizCurrentTitle(); }
}
function goHome(){
  tStop();
  closeSettings();
  if(driveOn) toggleDrive();
  stopTheoryDriveMode();
  goScreen('screenHome');
}



/* ── v20 홈 화면 문제·이론 수량 자동 확인 ── */
function updateHomeCounts(){
  try{
    const qTotal = (typeof DB !== 'undefined' && DB) ? Object.values(DB).reduce((a,b)=>a+(Array.isArray(b)?b.length:0),0) : 0;
    const tocTotal = (typeof QUESTION_TOC !== 'undefined' && QUESTION_TOC) ? QUESTION_TOC.length : ((typeof DB !== 'undefined' && DB) ? Object.keys(DB).length : 0);

    let basicTheory = 0;
    let cautionTheory = 0;
    let subjectTotal = 0;
    if(typeof THEORY !== 'undefined' && THEORY){
      subjectTotal = Object.keys(THEORY).length;
      Object.keys(THEORY).forEach(subject=>{
        const cnt = (THEORY[subject].chapters||[]).reduce((a,ch)=>a+((ch.sections||[]).length),0);
        if(subject === '시험주의사항') cautionTheory += cnt;
        else basicTheory += cnt;
      });
    }

    const qEl=document.getElementById('homeQuestionCount');
    const tocEl=document.getElementById('homeTocCount');
    const thEl=document.getElementById('homeTheoryCount');
    const caEl=document.getElementById('homeTheoryCautionCount');

    if(qEl) qEl.textContent = '문제 '+qTotal+'문제';
    if(tocEl) tocEl.textContent = '문제목차 '+tocTotal+'개';
    if(thEl) thEl.textContent = '기본 이론 '+basicTheory+'항목';
    if(caEl) caEl.textContent = '주의사항 '+cautionTheory+'항목';

    console.log('[RavenBix count check]', {qTotal,tocTotal,basicTheory,cautionTheory,subjectTotal});
  }catch(e){
    console.warn('count check failed', e);
  }
}

/* ── 홈 화면 빠른 실행 ── */
function openSettingsFromAnywhere(e){
  if(e){e.stopPropagation(); e.preventDefault();}
  toggleSettings(true);
}
function openQuizSettingsFromHome(e){
  openSettingsFromAnywhere(e);
}
function openDriveFromHome(e){
  if(e){e.stopPropagation(); e.preventDefault();}
  goScreen('screenQuiz');
  setTimeout(()=>{
    if(!driveOn) toggleDrive();
    window.scrollTo(0,0);
    setSt('이동 중 청취 모드를 시작했습니다.');
  },120);
}
function openTheoryFromHome(e){
  if(e){e.stopPropagation(); e.preventDefault();}
  goScreen('screenTheory');
}


/* ── 이론 화면 공통 청취 ── */

function startTheoryDriveMode(){
  theoryDriveOn=true;
  paused=false;
  closeSettings();
  reqWake('이론 이동 중 청취');
  setTheoryTrackText('이론 이동 중 청취 모드를 시작합니다.');
  setTimeout(()=>{
    if(theoryDriveOn && !locked){
      lockScreen();
      const txt=document.getElementById('lockNow');
      if(txt) txt.textContent='이론 이동 중 청취 모드';
    }
  },900);
}
function stopTheoryDriveMode(){
  if(!theoryDriveOn) return;
  theoryDriveOn=false;
  if(!driveOn) relWake();
  if(locked && !driveOn) unlockScreen();
}

function startTheoryListenFromCurrent(e){
  if(e){e.stopPropagation(); e.preventDefault();}
  closeSettings();
  startTheoryDriveMode();

  if(document.getElementById('screenTheoryContent').classList.contains('show')){
    theoryReadAll();
    return;
  }
  if(document.getElementById('screenChapter').classList.contains('show') && curSubject){
    openChapter(curChapterIdx||0);
    setTimeout(()=>theoryReadAll(),120);
    return;
  }
  const keys=(typeof THEORY!=='undefined' && THEORY)?Object.keys(THEORY):[];
  if(keys.length){
    openSubject(keys[0]);
    setTimeout(()=>{openChapter(0);setTimeout(()=>theoryReadAll(),120);},120);
  }
}

/* ── 이론 과목 목록 ── */
let curSubject=null, curChapterIdx=0;
function buildTheorySubjects(){
  const list=document.getElementById('theorySubjectList');
  list.innerHTML='';
  if(typeof THEORY==='undefined' || !THEORY || Object.keys(THEORY).length===0){
    list.innerHTML='<div class="section-card tts-track-target"><div class="sec-title">이론 목차를 불러오지 못했습니다</div><div class="sec-content">theory.js 파일 경로 또는 업로드 상태를 확인하세요. GitHub Pages에서는 /theory.js가 아니라 theory.js 상대경로가 필요합니다.</div></div>';
    return;
  }
  Object.keys(THEORY).forEach(key=>{
    const s=THEORY[key];
    const rawChapters=Array.isArray(s.chapters)?s.chapters:[];
    const sectionCount=rawChapters.reduce((a,ch)=>a+((ch.sections||[]).length),0);
    const div=document.createElement('div');
    div.className='ts-card';
    const safeIcon = (s && typeof s.icon === 'string' && s.icon.trim() && s.icon !== 'undefined') ? s.icon : '📘';
    const safeTitle = (s && typeof s.title === 'string' && s.title.trim() && s.title !== 'undefined') ? s.title : key;
    const safeChapters = Array.isArray(s.chapters) ? s.chapters : [];
    div.innerHTML=`<span class="ts-icon">${safeIcon}</span>
      <div class="ts-info">
        <div class="ts-title">${safeTitle}</div>
        <div class="ts-count">챕터 ${safeChapters.length}개<span class="ts-small">이론 ${sectionCount}항목</span></div>
      </div>
      <svg class="ts-chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>`;
    div.onclick=()=>openSubject(key);
    list.appendChild(div);
  });
}

function openSubject(key){
  curSubject=key;
  curChapterIdx=0;
  const s=THEORY[key];
  document.getElementById('chapterSubjectTitle').textContent=s.title;
  const list=document.getElementById('chapterList');
  list.innerHTML='';
  s.chapters.forEach((ch,i)=>{
    const div=document.createElement('div');
    div.className='ch-item';
    const count=(ch.sections||[]).length;
    div.innerHTML=`<span class="ch-num">${i+1}</span><span class="ch-text">${ch.title}<span class="ts-small">이론 ${count}항목</span></span>`;
    div.onclick=()=>openChapter(i);
    list.appendChild(div);
  });
  goScreen('screenChapter');
}


function escapeTheoryHTML(s){
  return String(s||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function splitTheoryParagraphs(s){
  let t=String(s||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');

  /* 긴 한 줄 원문을 목차 기호 단위로 읽기 좋게 줄바꿈한다.
     원문 문자는 삭제하지 않고 줄바꿈만 추가한다. */
  const circled='①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮';
  const smallCircled='㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷';
  const alphaCircled='ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙ';
  t=t.replace(/([^\n])\s*(\([0-9]+\)\s*)/g,'$1\n$2');
  t=t.replace(/([^\n])\s*(\([가-힣]\)\s*)/g,'$1\n$2');
  t=t.replace(new RegExp('([^\\n])\\s*(['+circled+'])\\s*','g'),'$1\n$2 ');
  t=t.replace(new RegExp('([^\\n])\\s*(['+smallCircled+'])\\s*','g'),'$1\n$2 ');
  t=t.replace(new RegExp('([^\\n])\\s*(['+alphaCircled+'])\\s*','g'),'$1\n$2 ');
  t=t.replace(/([^\n])\s*(\[[0-9]+페이지\]\s*)/g,'$1\n$2');
  t=t.replace(/\n{3,}/g,'\n\n').trim();
  return t;
}
function formatTheoryDisplay(s){
  return escapeTheoryHTML(splitTheoryParagraphs(s));
}
function formatTheoryPoint(s){
  return escapeTheoryHTML(splitTheoryParagraphs(s));
}


/* ── v30.20 TTS FIX 01. 이론·문제 데이터 보존. 문제풀이 TTS 안정화 ── */
const THEORY_EDIT_STORAGE_KEY='pipe_theory_user_edits_v30_17';
let theoryEditMode=false;
function loadTheoryUserEdits(){
  try{return JSON.parse(localStorage.getItem(THEORY_EDIT_STORAGE_KEY)||'{}')||{};}catch(e){return {};}
}
function saveTheoryUserEdits(edits){
  localStorage.setItem(THEORY_EDIT_STORAGE_KEY,JSON.stringify(edits||{}));
}
function theoryEditKey(subject,chapterIdx,sectionIdx){
  return [subject,chapterIdx,sectionIdx].join('::');
}
function applyTheoryUserEdits(){
  if(typeof THEORY==='undefined' || !THEORY) return;
  const edits=loadTheoryUserEdits();
  Object.keys(edits).forEach(k=>{
    const parts=k.split('::');
    const subject=parts[0], chapterIdx=Number(parts[1]), sectionIdx=Number(parts[2]);
    const sec=THEORY[subject] && THEORY[subject].chapters && THEORY[subject].chapters[chapterIdx] && THEORY[subject].chapters[chapterIdx].sections && THEORY[subject].chapters[chapterIdx].sections[sectionIdx];
    const patch=edits[k];
    if(!sec || !patch) return;
    ['title','key','detail','content','memory'].forEach(field=>{
      if(Object.prototype.hasOwnProperty.call(patch,field)) sec[field]=String(patch[field]||'');
    });
    if(Array.isArray(patch.points)) sec.points=patch.points.map(v=>String(v||'')).filter(Boolean);
  });
}
function setTheoryEditStatus(msg){
  const el=document.getElementById('theoryEditStatus');
  if(el) el.textContent=msg || '편집 저장은 이 브라우저에 보관됩니다.';
}
function refreshTheoryEditControls(){
  const toggle=document.getElementById('theoryEditToggleBtn');
  const save=document.getElementById('theoryEditSaveBtn');
  const cancel=document.getElementById('theoryEditCancelBtn');
  const restore=document.getElementById('theoryEditRestoreBtn');
  if(toggle) toggle.textContent=theoryEditMode?'✏️ 편집 중':'✏️ 이론 편집';
  if(save) save.style.display=theoryEditMode?'inline-block':'none';
  if(cancel) cancel.style.display=theoryEditMode?'inline-block':'none';
  if(restore) restore.style.display=theoryEditMode?'inline-block':'none';
  document.body.classList.toggle('theory-editing',!!theoryEditMode);
}
function applyTheoryEditModeToDom(on){
  document.querySelectorAll('#theoryContentArea [data-edit-field]').forEach(el=>{
    if(on){
      el.setAttribute('contenteditable','true');
      el.setAttribute('spellcheck','false');
    }else{
      el.removeAttribute('contenteditable');
      el.removeAttribute('spellcheck');
    }
  });
  refreshTheoryEditControls();
}
function toggleTheoryEditMode(e){
  if(e){e.preventDefault();e.stopPropagation();}
  if(!curSubject || !getCurrentTheoryChapter()){
    setTheoryEditStatus('편집할 이론 챕터를 먼저 열어주세요.');
    return;
  }
  theoryEditMode=!theoryEditMode;
  if(theoryEditMode){
    try{synth.cancel();}catch(err){}
    paused=false;
    resetTheoryPauseButton();
    clearTheoryTrack();
    setTheoryEditStatus('편집 모드입니다. 제목. 본문. 암기문장. 시험포인트를 수정한 뒤 편집 저장을 누르세요.');
  }else{
    setTheoryEditStatus('편집 모드를 종료했습니다. 저장하지 않은 화면 수정은 다시 열면 사라집니다.');
  }
  applyTheoryEditModeToDom(theoryEditMode);
}
function getEditableText(root,selector){
  const el=root.querySelector(selector);
  return el ? el.innerText.replace(/\u00a0/g,' ').trim() : '';
}
function saveTheoryEditsFromCurrentChapter(e){
  if(e){e.preventDefault();e.stopPropagation();}
  const ch=getCurrentTheoryChapter();
  if(!ch || !Array.isArray(ch.sections)) return;
  const edits=loadTheoryUserEdits();
  document.querySelectorAll('#theoryContentArea .section-card[data-section-index]').forEach(card=>{
    const idx=Number(card.getAttribute('data-section-index'));
    const sec=ch.sections[idx];
    if(!sec) return;
    const patch={updatedAt:new Date().toISOString()};
    const title=getEditableText(card,'[data-edit-field="title"]');
    if(title){sec.title=title; patch.title=title;}
    ['key','detail','content','memory'].forEach(field=>{
      const node=card.querySelector('[data-edit-field="'+field+'"]');
      if(node){
        const val=node.innerText.replace(/\u00a0/g,' ').trim();
        sec[field]=val;
        patch[field]=val;
      }
    });
    const pointNodes=Array.from(card.querySelectorAll('[data-edit-field="points"]'));
    if(pointNodes.length){
      const pts=pointNodes.map(n=>n.innerText.replace(/\u00a0/g,' ').trim()).filter(Boolean);
      sec.points=pts;
      patch.points=pts;
    }
    edits[theoryEditKey(curSubject,curChapterIdx,idx)]=patch;
  });
  saveTheoryUserEdits(edits);
  theoryEditMode=false;
  applyTheoryEditModeToDom(false);
  openChapter(curChapterIdx);
  setTheoryEditStatus('저장 완료. 이 브라우저에서 수정한 이론으로 표시되고 TTS도 수정 내용으로 읽습니다.');
}
function cancelTheoryEditMode(e){
  if(e){e.preventDefault();e.stopPropagation();}
  theoryEditMode=false;
  applyTheoryEditModeToDom(false);
  openChapter(curChapterIdx);
  setTheoryEditStatus('취소했습니다. 저장하지 않은 수정은 반영하지 않았습니다.');
}
function restoreTheoryOriginalForCurrentChapter(e){
  if(e){e.preventDefault();e.stopPropagation();}
  if(!curSubject && curSubject!==0) return;
  if(!confirm('현재 챕터의 저장된 편집 내용을 삭제하고 원본 이론으로 복원할까요?')) return;
  const edits=loadTheoryUserEdits();
  Object.keys(edits).forEach(k=>{
    if(k.startsWith(curSubject+'::'+curChapterIdx+'::')) delete edits[k];
  });
  saveTheoryUserEdits(edits);
  location.reload();
}

function openChapter(idx){
  /* 사용자가 챕터를 직접 누르거나 자동 넘김 중 화면이 바뀔 때
     이전 이론 TTS 콜백이 뒤늦게 들어와 같은 챕터를 다시 여는 것을 막는다. */
  if(synth && (synth.speaking || synth.pending || paused)){
    invalidateTheoryReadSession();
    try{synth.cancel();}catch(e){}
    paused=false;
    resetTheoryPauseButton();
  }
  curChapterIdx=idx;
  const s=THEORY[curSubject];
  const ch=s.chapters[idx];
  document.getElementById('contentBackLabel').textContent=s.title;
  document.getElementById('contentTitle').textContent=ch.title;
  const area=document.getElementById('theoryContentArea');
  area.innerHTML='';
  ch.sections.forEach((sec,secIdx)=>{
    const card=document.createElement('div');
    card.className='section-card tts-track-target';
    card.setAttribute('data-section-index',String(secIdx));
    if(sec.tts) card.setAttribute('data-tts',sec.tts);
    const pts=(sec.points||[]).map((p,pi)=>`<div class="sec-point" data-edit-field="points" data-point-index="${pi}">${formatTheoryPoint(p)}</div>`).join('');
    const level=sec.level?`<div class="sec-level">${sec.level}</div>`:'';
    const key=sec.key?`<div class="sec-block"><div class="sec-label">핵심개념</div><div class="sec-content" data-edit-field="key">${formatTheoryDisplay(sec.key)}</div></div>`:'';
    const detail=sec.detail?`<div class="sec-block"><div class="sec-label">상세설명</div><div class="sec-content" data-edit-field="detail">${formatTheoryDisplay(sec.detail)}</div></div>`:`<div class="sec-content" data-edit-field="content">${formatTheoryDisplay(sec.content||'')}</div>`;
    const exam=pts?`<div class="sec-block"><div class="sec-label">시험포인트</div><div class="sec-points">${pts}</div></div>`:'';
    const memory=sec.memory?`<div class="sec-memory"><b>암기문장.</b> <span data-edit-field="memory">${formatTheoryDisplay(sec.memory)}</span></div>`:'';
    card.innerHTML=`${level}<div class="sec-title" data-edit-field="title">${formatTheoryDisplay(sec.title)}</div>${key}${detail}${exam}${memory}`;
    area.appendChild(card);
  });
  updateTheoryNavButtons();
  updateTheoryAutoStatus();
  annotateTheoryCards();
  refreshTheoryEditControls();
  if(theoryEditMode) applyTheoryEditModeToDom(true);
  goScreen('screenTheoryContent');
}

function updateTheoryNavButtons(){
  const s=THEORY[curSubject]; if(!s) return;
  const isFirst=curChapterIdx===0;
  const isLast=curChapterIdx>=s.chapters.length-1;
  ['tNavPrev','tNavFirst'].forEach(id=>{const b=document.getElementById(id); if(b){b.style.opacity=isFirst?'0.35':'1'; b.disabled=isFirst;}});
  ['tNavNext','tNavLast'].forEach(id=>{const b=document.getElementById(id); if(b){b.style.opacity=isLast?'0.35':'1'; b.disabled=isLast;}});
}
function theoryNavChapter(dir,autoRead=false){
  const s=THEORY[curSubject];
  const next=curChapterIdx+dir;
  if(next<0||next>=s.chapters.length) return false;
  if(autoRead){
    synth.cancel();
    clearTheoryTrack();
  }else{
    tStop();
  }
  openChapter(next);
  if(autoRead) setTimeout(()=>theoryReadAll(false),320);
  return true;
}
function theoryFirstChapter(){
  if(!THEORY[curSubject] || curChapterIdx===0) return;
  tStop(); openChapter(0);
}
function theoryLastChapter(){
  const s=THEORY[curSubject]; if(!s) return;
  if(curChapterIdx>=s.chapters.length-1) return;
  tStop(); openChapter(s.chapters.length-1);
}
function theoryReplayChapter(){
  tStop();
  setTimeout(()=>theoryReadAll(true),180);
}

function theoryTextForRead(sec){
  let txt='';
  txt+=(sec.title||'이론')+'. ';
  const body=sec.detail || sec.content || sec.screenText || sec.originalText || '';
  if(body) txt+=body+'. ';
  if(sec.memory) txt+='암기문장. '+sec.memory+'. ';
  if(appSettings && appSettings.theoryExamTTS && sec.points && sec.points.length){
    txt+=sec.points.join('. ')+'. ';
  }
  return cleanTheorySpeechText(txt);
}


function annotateTheoryCards(){
  const cards=Array.from(document.querySelectorAll('#theoryContentArea .section-card'));
  cards.forEach((card,idx)=>{
    card.classList.add('tts-track-target');
    if(!card.hasAttribute('data-tts')){
      const ttsNode=card.querySelector('[data-tts-text]');
      if(ttsNode) card.setAttribute('data-tts',ttsNode.textContent.trim());
    }
    card.setAttribute('data-track-index',String(idx+1));
  });
}


let theoryAutoMode='once';
let theoryNextRemain=0;
/* v30.20_TTS_FIX_05
   모바일 브라우저에서 speechSynthesis onend/onerror가 중복 호출되거나
   화면 전환 중 cancel 이벤트가 늦게 들어오면 같은 이론 챕터 완료 처리가
   반복될 수 있다. 이론 TTS 전용 세션 번호로 오래된 콜백을 무효화한다. */
let theoryReadSessionId=0;
let theoryReadFinishHandled=false;
let theoryAutoTransitionTimer=null;
function invalidateTheoryReadSession(){
  theoryReadSessionId++;
  theoryReadFinishHandled=false;
  if(theoryAutoTransitionTimer){
    clearTimeout(theoryAutoTransitionTimer);
    theoryAutoTransitionTimer=null;
  }
  resumeTask=null;
  try{speakToken++;}catch(e){}
}
function cancelTheorySpeechForNavigation(){
  invalidateTheoryReadSession();
  try{synth.cancel();}catch(e){}
  clearTheoryTrack();
  resetTheoryPauseButton();
}
function setTheoryAutoMode(mode,btn){
  theoryAutoMode=mode;
  if(appSettings) appSettings.theoryAutoMode=mode;
  document.querySelectorAll('#theoryAutoRow .sb, #theoryAutoRowTop .sb').forEach(b=>{
    b.classList.toggle('on', b.getAttribute('data-theory-auto')===mode);
  });
  markSettingsDirty();
  updateTheoryAutoStatus();
}
function loadTheoryAutoMode(){
  if(!appSettings) appSettings=loadSettings();
  theoryAutoMode=appSettings.theoryAutoMode || 'next';
  document.querySelectorAll('#theoryAutoRow .sb, #theoryAutoRowTop .sb').forEach(b=>{
    b.classList.toggle('on', b.getAttribute('data-theory-auto')===theoryAutoMode);
  });
}
function theoryAutoModeLabel(){
  return {once:'현재 챕터만',next:'다음 챕터 1회',subject:'과목 전체. 초급 중급 고급',all:'전체 이론'}[theoryAutoMode]||'과목 전체. 초급 중급 고급';
}
function updateTheoryAutoStatus(msg){
  const el=document.getElementById('theoryAutoStatus');
  if(!el) return;
  const s=THEORY[curSubject], ch=s&&s.chapters[curChapterIdx];
  if(!s||!ch){el.classList.add('off');return;}
  el.classList.remove('off');
  el.textContent=msg || ('이론 자동재생. '+theoryAutoModeLabel()+'. 현재. '+s.title+' > '+ch.title);
}
function getNextTheoryLocation(){
  const keys=Object.keys(THEORY);
  const si=keys.indexOf(curSubject);
  const s=THEORY[curSubject];
  if(!s) return null;
  if(curChapterIdx<s.chapters.length-1) return {subject:curSubject,chapter:curChapterIdx+1};
  if(theoryAutoMode==='all' && si>=0 && si<keys.length-1) return {subject:keys[si+1],chapter:0};
  return null;
}
function openTheoryLocation(loc,autoRead){
  if(!loc) return false;
  let transitionSession=theoryReadSessionId;
  if(autoRead){
    cancelTheorySpeechForNavigation();
    transitionSession=theoryReadSessionId;
  }
  curSubject=loc.subject;
  curChapterIdx=loc.chapter;
  const s=THEORY[curSubject];
  const titleEl=document.getElementById('chapterSubjectTitle');
  if(titleEl) titleEl.textContent=s.title;
  openChapter(curChapterIdx);
  if(autoRead){
    /* openChapter 내부에서 모바일 cancel 정리 때문에 세션이 한 번 더 바뀔 수 있으므로
       자동 읽기 시작 기준 세션을 화면 전환 후 다시 맞춘다. */
    transitionSession=theoryReadSessionId;
    setTimeout(()=>{
      if(transitionSession!==theoryReadSessionId) return;
      theoryReadAll(false);
    },360);
  }
  return true;
}
function handleTheoryReadFinished(sessionId){
  if(sessionId!==undefined && sessionId!==theoryReadSessionId) return;
  if(theoryReadFinishHandled) return;
  theoryReadFinishHandled=true;

  const mode=theoryAutoMode || 'once';
  const scheduleTheoryAutoMove=(loc,msg,delay)=>{
    const finishedSession=theoryReadSessionId;
    updateTheoryAutoStatus(msg);
    if(theoryAutoTransitionTimer){clearTimeout(theoryAutoTransitionTimer);}
    theoryAutoTransitionTimer=setTimeout(()=>{
      theoryAutoTransitionTimer=null;
      if(finishedSession!==theoryReadSessionId) return;
      openTheoryLocation(loc,true);
    },delay||900);
  };

  if(mode==='once'){
    updateTheoryAutoStatus('현재 챕터 읽기가 끝났습니다.');
    if(!driveOn && !theoryDriveOn) relWake();
    setTimeout(()=>clearTheoryTrack(),1200);
    return;
  }

  if(mode==='next'){
    if(theoryNextRemain>0){
      const loc=getNextTheoryLocation();
      if(loc){
        theoryNextRemain--;
        scheduleTheoryAutoMove(loc,'다음 챕터로 자동 이동합니다.',900);
        return;
      }
    }
    updateTheoryAutoStatus('다음 챕터 1회 자동재생이 끝났습니다.');
    if(!driveOn && !theoryDriveOn) relWake();
    setTimeout(()=>clearTheoryTrack(),1200);
    return;
  }

  if(mode==='subject'){
    const s=THEORY[curSubject];
    if(s && curChapterIdx<s.chapters.length-1){
      scheduleTheoryAutoMove({subject:curSubject,chapter:curChapterIdx+1},'다음 챕터로 자동 이동합니다.',900);
    }else{
      updateTheoryAutoStatus('현재 과목 전체 읽기가 끝났습니다.');
      if(!driveOn && !theoryDriveOn) relWake();
      setTimeout(()=>clearTheoryTrack(),1200);
    }
    return;
  }

  if(mode==='all'){
    const loc=getNextTheoryLocation();
    if(loc){
      scheduleTheoryAutoMove(loc,'다음 이론으로 자동 이동합니다.',900);
    }else{
      updateTheoryAutoStatus('전체 이론 읽기가 끝났습니다.');
      if(!driveOn && !theoryDriveOn) relWake();
      setTimeout(()=>clearTheoryTrack(),1200);
    }
    return;
  }
}

let theoryAutoScroll=true;
let theoryReadQueue=[];
let theoryReadIndex=0;
let theoryActiveIndex=0;
const THEORY_TTS_GAP_MS=650;
const THEORY_TTS_MARKER_GAP_MS=400;
const THEORY_TTS_COLON_GAP_MS=950;

function getTheoryTrackTargets(){
  return Array.from(document.querySelectorAll('#theoryContentArea .tts-track-target'));
}
function clearTheoryTrack(){
  document.querySelectorAll('.tts-reading').forEach(el=>el.classList.remove('tts-reading'));
  const bar=document.getElementById('ttsTrackBar');
  if(bar) bar.style.display='none';
}
function setTheoryTrackText(txt){
  const bar=document.getElementById('ttsTrackBar');
  const label=document.getElementById('ttsTrackText');
  if(bar) bar.style.display='flex';
  if(label) label.textContent=txt || '읽는 위치 자동 따라가기';
}
function toggleTheoryAutoScroll(e){
  if(e){e.stopPropagation();e.preventDefault();}
  theoryAutoScroll=!theoryAutoScroll;
  document.body.classList.toggle('tts-track-off',!theoryAutoScroll);
  const btn=document.getElementById('ttsTrackToggle');
  if(btn) btn.textContent=theoryAutoScroll?'자동추적 켜짐':'자동추적 꺼짐';
  setTheoryTrackText(theoryAutoScroll?'읽는 위치 자동 따라가기 켜짐':'읽는 위치 자동 따라가기 꺼짐');
}

function resetTheoryPauseButton(){
  const btn=document.getElementById('tTheoryPauseBtn');
  const ico=document.getElementById('tTheoryPauseIco');
  const lbl=document.getElementById('tTheoryPauseLbl');
  if(btn) btn.classList.remove('paused');
  if(ico) ico.innerHTML='<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
  if(lbl) lbl.textContent='일시정지';
}
function setTheoryPauseButtonPaused(){
  const btn=document.getElementById('tTheoryPauseBtn');
  const ico=document.getElementById('tTheoryPauseIco');
  const lbl=document.getElementById('tTheoryPauseLbl');
  if(btn) btn.classList.add('paused');
  if(ico) ico.innerHTML='<polygon points="5 3 19 12 5 21 5 3"/>';
  if(lbl) lbl.textContent='이어서 재생';
}
function toggleTheoryPauseResume(){
  if(!theoryReadQueue || !theoryReadQueue.length){
    setTheoryTrackText('현재 재생 중인 이론이 없습니다.');
    return;
  }

  if(paused){
    /* 일부 모바일 브라우저에서는 speechSynthesis.resume()이 정상 재개되지 않는다.
       따라서 현재 항목부터 다시 speak하도록 재개 방식을 변경한다. */
    paused=false;
    resetTheoryPauseButton();
    setTheoryTrackText('이론 낭독을 이어서 재생합니다.');
    const fn=resumeTask;
    resumeTask=null;
    try{synth.cancel();}catch(e){}
    setTimeout(()=>{
      if(paused) return;
      if(fn) fn();
      else theoryReadNext();
    },160);
  }else{
    /* 일시정지 시 현재 읽던 항목 번호를 되돌려 둔다.
       이어서 재생하면 현재 항목의 처음부터 다시 읽는다. */
    paused=true;
    const currentIdx=Math.max(0,theoryActiveIndex||0);
    theoryReadIndex=currentIdx;
    resumeTask=null;
    try{synth.pause();}catch(e){}
    setTimeout(()=>{ if(paused){ try{synth.cancel();}catch(e){} } },80);
    setTheoryPauseButtonPaused();
    setTheoryTrackText('이론 낭독 일시정지 중입니다. 이어서 재생하면 현재 문단부터 다시 읽습니다.');
  }
}

function focusTheoryTarget(el,label){
  if(!el) return;
  document.querySelectorAll('.tts-reading').forEach(x=>x.classList.remove('tts-reading'));
  el.classList.add('tts-reading');
  setTheoryTrackText(label || '현재 이론을 읽는 중입니다.');
  if(theoryAutoScroll){
    setTimeout(()=>{
      try{ el.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'}); }
      catch(e){ el.scrollIntoView(true); }
    },80);
  }
}

/* ── v30.1 이론 TTS 본문+암기문장 전용 낭독 ── */
function getCurrentTheoryChapter(){
  try{
    const s=THEORY[curSubject];
    return s && s.chapters ? s.chapters[curChapterIdx] : null;
  }catch(e){ return null; }
}
function cleanTheorySpeechText(s){
  return String(s||'')
    .replace(/\$Sch\s*\\\s*№\s*=\s*10\s*\\times\s*\\frac\{P\}\{S\}\$/g,'스케줄 넘버는 10 곱하기 P 나누기 S')
    .replace(/\$\^\\circ C\$/g,'도')
    .replace(/\$\\frac\{1\}\{2\}H\$/g,'이분의 일 H')
    .replace(/\$NH_3\$/g,'암모니아')
    .replace(/\$H_2SO_4\$/g,'황산')
    .replace(/\$kgf\/cm\^2\$/g,'킬로그램힘 매 제곱센티미터')
    .replace(/\$kgf\/mm\^2\$/g,'킬로그램힘 매 제곱밀리미터')
    .replace(/\$\\times\$/g,'곱하기')
    .replace(/\\times/g,'곱하기')
    .replace(/\(([A-Za-z][A-Za-z0-9/ .\-×x+]*?)\)/g,'')
    .replace(/\([\u4E00-\u9FFF]+\)/g,'')
    .replace(/\$\^\\circ C\$/g,'도')
    .replace(/\$\s*/g,'')
    .replace(/\\frac\{1\}\{2\}H/g,'이분의 일 H')
    .replace(/\\circ/g,'도')
    .replace(/\s+/g,' ')
    .replace(/핵심개념\s*\.?\s*/g,'')
    .replace(/상세설명\s*\.?\s*/g,'')
    .replace(/화면표시문\s*\.?\s*/g,'')
    .replace(/설명문\s*\.?\s*/g,'')
    .trim();
}
function makeTheoryChapterIntro(){
  return '';
}
function makeTheoryCommonExamPoint(){
  return '';
}
function getTheoryBodyFromCard(el){
  const blocks=Array.from(el.querySelectorAll('.sec-block'));
  const detailBlock=blocks.find(b=>{
    const label=(b.querySelector('.sec-label')?.textContent||'').trim();
    return label.includes('상세설명') || label.includes('본문') || label.includes('화면 표시');
  });
  if(detailBlock){
    return (detailBlock.querySelector('.sec-content')?.textContent || '').trim();
  }

  const directContent=Array.from(el.children).find(child=>{
    return child.classList && child.classList.contains('sec-content');
  });
  if(directContent) return directContent.textContent.trim();

  const fallbackBlock=blocks.find(b=>{
    const label=(b.querySelector('.sec-label')?.textContent||'').trim();
    return !label.includes('핵심개념') && !label.includes('시험포인트');
  });
  if(fallbackBlock){
    return (fallbackBlock.querySelector('.sec-content')?.textContent || '').trim();
  }

  const clone=el.cloneNode(true);
  clone.querySelectorAll('.sec-title,.sec-level,.sec-label,.sec-points,.sec-point,.sec-memory').forEach(n=>n.remove());
  return clone.textContent.replace(/\s+/g,' ').trim();
}
function getTheoryExamPointsFromCard(el){
  return Array.from(el.querySelectorAll('.sec-point')).map(p=>p.textContent.trim()).filter(Boolean);
}
function makeTheorySectionSpeech(el, idx){
  const title=(el.querySelector('.sec-title')?.textContent || ('항목 '+(idx+1))).trim();
  const body=getTheoryBodyFromCard(el);
  const memory=(el.querySelector('.sec-memory')?.textContent || '').replace(/^암기문장\.\s*/,'').trim();
  const exam=getTheoryExamPointsFromCard(el);

  let text = title+'. ';
  if(body) text += body+'. ';
  if(memory) text += '암기문장. '+memory+'. ';
  if(appSettings && appSettings.theoryExamTTS && exam.length){
    text += exam.join('. ')+'. ';
  }
  return cleanTheorySpeechText(text);
}



function theoryMarkerSpeech(marker){
  const m=String(marker||'').trim();
  const circled={'①':'1번','②':'2번','③':'3번','④':'4번','⑤':'5번','⑥':'6번','⑦':'7번','⑧':'8번','⑨':'9번','⑩':'10번','⑪':'11번','⑫':'12번','⑬':'13번','⑭':'14번','⑮':'15번'};
  const small={'㉮':'가','㉯':'나','㉰':'다','㉱':'라','㉲':'마','㉳':'바','㉴':'사','㉵':'아','㉶':'자','㉷':'차'};
  const alpha={'ⓐ':'에이','ⓑ':'비','ⓒ':'씨','ⓓ':'디','ⓔ':'이','ⓕ':'에프','ⓖ':'지','ⓗ':'에이치','ⓘ':'아이','ⓙ':'제이'};
  if(circled[m]) return circled[m]+'.';
  if(small[m]) return small[m]+'.';
  if(alpha[m]) return alpha[m]+'.';
  let par=m.match(/^\(([0-9]+)\)$/);
  if(par) return par[1]+'번.';
  par=m.match(/^\(([가-힣])\)$/);
  if(par) return par[1]+'.';
  return cleanTheorySpeechText(m)+'.';
}
function splitLeadingTheoryMarker(line){
  const s=String(line||'').trim();
  const markerRe=/^(\([0-9]+\)|\([가-힣]\)|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]|[㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷]|[ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙ])\s*(.*)$/;
  const m=s.match(markerRe);
  if(!m) return null;
  return {marker:m[1], body:m[2].trim()};
}
function pushTheorySpeechChunk(arr, text, gapMs){
  const t=cleanTheorySpeechText(text);
  if(t) arr.push({text:t, gapMs:gapMs||THEORY_TTS_GAP_MS});
}

function splitTheoryColonParts(line){
  const text=cleanTheorySpeechText(line);
  if(!text) return [];
  if(!/[:：]/.test(text)) return [text];
  return text.split(/[:：]+/).map(v=>cleanTheorySpeechText(v)).filter(Boolean);
}
function pushTheoryLineAsChunks(chunks,line,gapMs){
  const text=cleanTheorySpeechText(line);
  if(!text) return;
  const colonParts=splitTheoryColonParts(text);
  if(colonParts.length>1){
    colonParts.forEach((part,idx)=>{
      pushTheorySpeechChunk(chunks,part,(idx<colonParts.length-1)?THEORY_TTS_COLON_GAP_MS:(gapMs||THEORY_TTS_GAP_MS));
    });
    return;
  }
  if(text.length>260){
    const parts=text.split(/(?<=[.다요음됨함임\.])\s+/).map(v=>cleanTheorySpeechText(v)).filter(Boolean);
    if(parts.length>1) parts.forEach(p=>pushTheorySpeechChunk(chunks,p,gapMs||THEORY_TTS_GAP_MS));
    else pushTheorySpeechChunk(chunks,text,gapMs||THEORY_TTS_GAP_MS);
  }else{
    pushTheorySpeechChunk(chunks,text,gapMs||THEORY_TTS_GAP_MS);
  }
}
function splitTheoryTTSChunks(text){
  const raw=splitTheoryParagraphs(String(text||''));
  let lines=raw.split(/\n+/).map(v=>cleanTheorySpeechText(v)).filter(Boolean);
  const chunks=[];
  lines.forEach(line=>{
    const mb=splitLeadingTheoryMarker(line);
    if(mb){
      pushTheorySpeechChunk(chunks, theoryMarkerSpeech(mb.marker), THEORY_TTS_MARKER_GAP_MS);
      if(mb.body) pushTheoryLineAsChunks(chunks,mb.body,THEORY_TTS_GAP_MS);
      return;
    }

    /* 소제목:내용 형식은 콜론 앞뒤를 분리하여 TTS가 잠시 쉬게 한다. */
    pushTheoryLineAsChunks(chunks,line,THEORY_TTS_GAP_MS);
  });
  return chunks.filter(v=>v && v.text);
}
function normalizeTheoryCompareText(s){
  return cleanTheorySpeechText(s)
    .replace(/\.\.\./g,'')
    .replace(/[\s.,:;·ㆍ\-_\/\\()[\]{}<>"'‘’“”]/g,'')
    .trim();
}
function isTheoryDuplicateMemory(body,memory){
  const b=normalizeTheoryCompareText(body);
  const m=normalizeTheoryCompareText(memory);
  if(!b || !m || m.length<60) return false;
  const mHead=m.slice(0,70);
  const bHead=b.slice(0,140);
  if(bHead.includes(mHead)) return true;
  if(m.includes('조') && String(memory||'').includes('...') && bHead.includes(m.slice(0,50))) return true;
  if(m.length>120 && b.slice(0,90)===m.slice(0,90)) return true;
  return false;
}
function filterTheoryMemoryForSpeech(body,memory){
  const mem=String(memory||'').replace(/^암기문장\.\s*/,'').trim();
  if(!mem) return '';
  /* v30.20_TTS_FIX_05
     FIX_04의 중복 암기문장 생략 조건이 16페이지와 공업경영 138페이지처럼
     반드시 읽어야 할 암기문장까지 건너뛰는 문제가 있었다.
     화면 원문과 theory.js는 그대로 두고, TTS에서도 암기문장은 항상 읽도록 복구한다.
     같은 챕터 반복 이동 방지는 세션 가드와 자동이동 타이머 단일관리 로직만으로 처리한다. */
  return mem;
}
function getTheoryCardPartsForSpeech(el, idx){
  const title=(el.querySelector('.sec-title')?.textContent || ('항목 '+(idx+1))).trim();
  const body=getTheoryBodyFromCard(el);
  const rawMemory=(el.querySelector('.sec-memory')?.textContent || '').replace(/^암기문장\.\s*/,'').trim();
  const memory=filterTheoryMemoryForSpeech(body,rawMemory);
  const exam=getTheoryExamPointsFromCard(el);
  return {title, body, memory, exam};
}

function buildTheoryReadQueue(){
  let targets=getTheoryTrackTargets();
  if(!targets.length){annotateTheoryCards(); targets=getTheoryTrackTargets();}
  const q=[];
  targets.forEach((el,idx)=>{
    const part=getTheoryCardPartsForSpeech(el,idx);
    const titleText=cleanTheorySpeechText(part.title);
    const bodyChunks=splitTheoryTTSChunks(part.body);
    const memoryChunks=part.memory ? splitTheoryTTSChunks('암기문장. '+part.memory) : [];
    const examChunks=(appSettings && appSettings.theoryExamTTS && part.exam && part.exam.length)
      ? part.exam.flatMap(v=>splitTheoryTTSChunks(v))
      : [];

    const chunks=[];
    if(titleText){
      chunks.push({text:titleText+'.', gapMs:THEORY_TTS_GAP_MS});
    }
    chunks.push(...bodyChunks);
    chunks.push(...memoryChunks);
    chunks.push(...examChunks);

    chunks.forEach((chunk,ci)=>{
      const finalText=cleanTheorySpeechText(chunk.text||chunk);
      if(finalText) q.push({el,title:part.title+' '+(ci+1)+'/'+chunks.length,text:finalText,gapMs:chunk.gapMs||THEORY_TTS_GAP_MS});
    });
  });
  return q;
}
function theoryReadNext(sessionId){
  sessionId = sessionId || theoryReadSessionId;
  if(sessionId!==theoryReadSessionId) return;
  if(paused){
    resumeTask=()=>theoryReadNext(sessionId);
    return;
  }
  if(!theoryReadQueue.length || theoryReadIndex>=theoryReadQueue.length){
    if(sessionId!==theoryReadSessionId) return;
    paused=false;
    theoryActiveIndex=0;
    resetTheoryPauseButton();
    setTheoryTrackText('현재 챕터 읽기가 끝났습니다.');
    handleTheoryReadFinished(sessionId);
    return;
  }
  const currentIndex=theoryReadIndex;
  const item=theoryReadQueue[theoryReadIndex++];
  theoryActiveIndex=currentIndex;
  focusTheoryTarget(item.el,'읽는 중. '+item.title);
  spk(item.text,()=>{
    if(sessionId!==theoryReadSessionId) return;
    if(paused){ resumeTask=()=>theoryReadNext(sessionId); return; }
    setTimeout(()=>{
      if(sessionId!==theoryReadSessionId) return;
      if(!paused) theoryReadNext(sessionId);
      else resumeTask=()=>theoryReadNext(sessionId);
    },item.gapMs||THEORY_TTS_GAP_MS);
  });
}
function theoryReadAll(manualStart=true){
  closeSettings();
  invalidateTheoryReadSession();
  const sessionId=theoryReadSessionId;
  try{synth.cancel();}catch(e){}
  paused=false;
  resetTheoryPauseButton();
  if(manualStart) theoryNextRemain=(theoryAutoMode==='next')?1:0;
  theoryReadQueue=buildTheoryReadQueue();
  theoryReadIndex=0;
  theoryActiveIndex=0;
  if(!theoryReadQueue.length){
    alert('읽을 이론 내용이 없습니다.');
    return;
  }
  reqWake(theoryDriveOn?'이론 이동 중 청취':'이론 전체읽기');
  updateTheoryAutoStatus('이론 전체읽기를 시작합니다. '+theoryAutoModeLabel());
  setTheoryTrackText('이론 전체읽기를 시작합니다.');
  theoryReadNext(sessionId);
}


/* ── v24 문제풀이 목차/서브메뉴. DB와 풀이 로직은 기존 그대로 사용 ── */
let curQuizGroup='기출문제';
let quizPrepared=false;
const QUIZ_GROUPS=[
  {key:'기출문제', icon:'①', desc:'챕터1·챕터2·챕터3·챕터4·챕터5 신규 단원을 훈련합니다.', levels:["배관공학의기초1","관의접합및성형3","용접의종류및특성4","챕터2_01_관의종류및특성","챕터2_02_관이음재료","챕터2_03_밸브및배관부속재료","챕터2_04_관의지지기구","챕터2_05_보온단열재","챕터3_01_배관설비도면","챕터3_02_판금","챕터4_01_급수설비","챕터4_02_배수및통기배관","챕터4_03_급탕설비","챕터4_04_소화설비","챕터4_05_온수난방설비","챕터4_06_증기난방설비","챕터4_07_냉방및공기조화설비","챕터4_08_집진설비및세정설비","챕터4_09_플랜트배관설비","챕터4_10_위생설비및소화설비","챕터4_11_배관설비검사및계측","챕터4_12_설비자동화","챕터4_13_안전관리","챕터5_01_공업경영"], labels:["챕터1-01. 배관공학의 기초","챕터1-02. 관의 접합 및 성형","챕터1-03. 용접의 종류 및 특성","챕터2-01. 관의 종류 및 특성","챕터2-02. 관 이음 재료","챕터2-03. 밸브 및 배관 부속재료","챕터2-04. 관의 지지 기구","챕터2-05. 보온 단열재","챕터3-01. 배관설비도면","챕터3-02. 판금","챕터4-01. 급수설비","챕터4-02. 배수 및 통기배관","챕터4-03. 급탕설비","챕터4-04. 소화설비","챕터4-05. 온수난방설비","챕터4-06. 증기난방설비","챕터4-07. 냉방 및 공기조화설비","챕터4-08. 집진설비 및 세정설비","챕터4-09. 플랜트 배관설비","챕터4-10. 위생설비 및 소화설비","챕터4-11. 배관설비 검사 및 계측","챕터4-12. 설비자동화","챕터4-13. 안전관리","챕터5-01. 공업경영"]},
  {key:'기출회차41회~63회', icon:'②', desc:'2007-41회부터 2018-63회까지의 실제 과년도 회차형 문제를 훈련합니다.', levels:['기출41회','기출42회','기출43회','기출44회','기출45회','기출46회','기출47회','기출48회','기출49회','기출50회','기출51회','기출52회','기출53회','기출54회','기출55회','기출56회','기출57회','기출58회','기출59회','기출60회','기출61회','기출62회','기출63회'], labels:['2007-41회','2007-42회','2008-43회','2008-44회','2009-45회','2009-46회','2010-47회','2010-48회','2011-49회','2011-50회','2012-51회','2012-52회','2013-53회','2013-54회','2014-55회 ★','2014-56회 ★','2015-57회 ★','2016-58회','2016-59회','2016-60회','2017-61회','2017-62회','2018-63회']},
  {key:'기출복원문제', icon:'③', desc:'2019-1회 복원문제를 추가했으며, 이후 2019-2회부터 2025-2회까지 순차 입력 예정입니다.', levels:['복원2019_1회','복원2019_2회','복원2020_1회','복원2020_2회','복원2021_1회','복원2021_2회','복원2022_1회','복원2022_2회','복원2023_1회','복원2023_2회','복원2024_1회','복원2024_2회','복원2025_1회','복원2025_2회'], labels:['2019-1회','2019-2회','2020-1회','2020-2회','2021-1회','2021-2회','2022-1회','2022-2회','2023-1회','2023-2회','2024-1회','2024-2회','2025-1회','2025-2회']}
];
function getQuizLevelLabel(lv){
  for(const g of QUIZ_GROUPS){
    const i=g.levels.indexOf(lv);
    if(i>=0) return String(g.labels[i]||'').startsWith(g.key)?g.labels[i]:(g.key+' '+g.labels[i]);
  }
  return lv;
}
function getQuizGroupByKey(key){return QUIZ_GROUPS.find(g=>g.key===key)||QUIZ_GROUPS[0];}
function getQuizGroupByLevel(lv){return QUIZ_GROUPS.find(g=>g.levels.includes(lv))||QUIZ_GROUPS[0];}
function calcQuizStats(levels){
  let ok=0, ng=0;
  levels.forEach(lv=>{
    const d=scoreData[lv];
    if(d){ok+=Number(d.ok||0); ng+=Number(d.ng||0);}
  });
  const total=ok+ng;
  const rt=total?Math.round(ok/total*100):0;
  return {ok,ng,rt,total};
}
function statHtml(stats){
  return '<div class="quiz-stat-row">'
    +'<span class="quiz-stat ok">정답 '+stats.ok+'</span>'
    +'<span class="quiz-stat ng">오답 '+stats.ng+'</span>'
    +'<span class="quiz-stat rt">정답률 '+stats.rt+'%</span>'
    +'</div>';
}
function buildQuizToc(){
  const list=document.getElementById('quizTocList');
  if(!list) return;
  list.innerHTML='';
  QUIZ_GROUPS.forEach(g=>{
    const count=g.levels.reduce((a,lv)=>a+((DB[lv]&&DB[lv].length)||0),0);
    const stats=calcQuizStats(g.levels);
    const div=document.createElement('div');
    div.className='quiz-toc-card'+(g.key===curQuizGroup?' on':'');
    div.innerHTML='<span class="quiz-toc-icon">'+g.icon+'</span>'
      +'<div class="quiz-toc-info">'
      +'<div class="quiz-toc-title">'+g.key+'</div>'
      +'<div class="quiz-toc-desc">'+g.desc+' · '+count+'문제</div>'
      +statHtml(stats)
      +'</div>'
      +'<svg class="quiz-toc-chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>';
    div.onclick=()=>{curQuizGroup=g.key; goScreen('screenQuizStage');};
    list.appendChild(div);
  });
}
function buildQuizStage(){
  const g=getQuizGroupByKey(curQuizGroup);
  const title=document.getElementById('quizStageTitle');
  const sub=document.getElementById('quizStageSub');
  const list=document.getElementById('quizStageList');
  if(title) title.textContent=g.key+' 문제풀이';
  if(sub) sub.textContent=g.key+' 목차를 선택합니다.';
  if(!list) return;
  list.innerHTML='';
  if(!g.levels.length){
    const div=document.createElement('div');
    div.className='quiz-toc-card';
    div.innerHTML='<span class="quiz-toc-icon">!</span>'
      +'<div class="quiz-toc-info">'
      +'<div class="quiz-toc-title">자료 입력 대기</div>'
      +'<div class="quiz-toc-desc">이 구간은 아직 문제 데이터가 없습니다. 새 기출 PDF가 올라오면 이 메뉴에 추가합니다.</div>'
      +'</div>';
    list.appendChild(div);
    return;
  }
  g.levels.forEach((lv,i)=>{
    const exists=Array.isArray(DB[lv]) && DB[lv].length>0;
    const count=exists?DB[lv].length:0;
    const stats=calcQuizStats([lv]);
    const div=document.createElement('div');
    div.className='quiz-toc-card'+(exists?'':' disabled');
    const titleText=String(g.labels[i]||lv);
    const descText=exists ? (lv+' · '+count+'문제') : '업로드 예정 · 데이터 입력 대기';
    div.innerHTML='<span class="quiz-toc-icon">'+(i+1)+'</span>'
      +'<div class="quiz-toc-info">'
      +'<div class="quiz-toc-title">'+titleText+'</div>'
      +'<div class="quiz-toc-desc">'+descText+'</div>'
      +(exists?statHtml(stats):'')
      +'</div>'
      +'<svg class="quiz-toc-chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>';
    if(exists) div.onclick=()=>startQuizLevel(lv);
    list.appendChild(div);
  });
}
function prepareQuizLevel(lv){
  curLevel=lv;
  curQuizGroup=getQuizGroupByLevel(lv).key;
  Qs=DB[curLevel]||[];
  cur=0;
  answered=false;
  retryMode=false;
  initScore();
  buildLevelBar();
  buildDots();
  renderQ();
  const rs=document.getElementById('resultScreen');
  if(rs) rs.classList.remove('show');
  const qa=document.getElementById('quizArea');
  if(qa) qa.style.display='block';
  const sb=document.getElementById('scoreBar');
  if(sb) sb.style.display='flex';
  updateQuizCurrentTitle();
}
function startQuizLevel(lv){
  quizPrepared=true;
  prepareQuizLevel(lv);
  goScreen('screenQuiz');
  quizPrepared=false;
}
function returnToQuizStage(){
  tStop();
  if(driveOn) toggleDrive();
  curQuizGroup=getQuizGroupByLevel(curLevel).key;
  goScreen('screenQuizStage');
}
function updateQuizCurrentTitle(){
  const el=document.getElementById('quizCurrentTitle');
  if(el) el.textContent='현재 풀이. '+getQuizLevelLabel(curLevel)+' · '+((DB[curLevel]&&DB[curLevel].length)||0)+'문제';
}

let scoreData = {}; // { '초급1': { ok:0, ng:0, sk:0, wrong:[] } }
let sessionOk=0, sessionNg=0, wrongQs=[];
let retryMode=false;

function initScore(){
  sessionOk=0; sessionNg=0; wrongQs=[];
  if(!scoreData[curLevel]) scoreData[curLevel]={ok:0,ng:0,sk:0,wrong:[]};
  updateScoreBar();
}
function updateScoreBar(){
  const total=sessionOk+sessionNg;
  const pct=total>0?Math.round(sessionOk/total*100):0;
  document.getElementById('scOk').textContent=sessionOk;
  document.getElementById('scNg').textContent=sessionNg;
  document.getElementById('scRt').textContent=pct+'%';
}
function recordAnswer(isOk, q){
  if(isOk){sessionOk++;}
  else{sessionNg++;wrongQs.push(q);}
  if(!scoreData[curLevel]) scoreData[curLevel]={ok:0,ng:0,sk:0,wrong:[]};
  if(isOk) scoreData[curLevel].ok++;
  else{scoreData[curLevel].ng++;scoreData[curLevel].wrong.push(q);}
  updateScoreBar();
}
function showResult(){
  const total=Qs.length;
  const sk=total-sessionOk-sessionNg;
  if(scoreData[curLevel]) scoreData[curLevel].sk=sk;
  const pct=total>0?Math.round(sessionOk/total*100):0;
  const pass=pct>=60;

  document.getElementById('quizArea').style.display='none';
  document.getElementById('scoreBar').style.display='none';
  document.getElementById('resultScreen').classList.add('show');

  const circle=document.getElementById('resultCircle');
  circle.style.borderColor=pass?'#1D9E75':'#E24B4A';
  document.getElementById('resultPct').textContent=pct+'%';
  document.getElementById('resultPct').style.color=pass?'#1D9E75':'#E24B4A';
  document.getElementById('resultJudge').textContent=pass?'합격권':'불합격';
  document.getElementById('resultTitle').textContent=pass?'축하합니다! 합격권입니다 🎉':'조금 더 노력하세요!';
  document.getElementById('resultSub').textContent=curLevel+' · '+total+'문제 중 '+sessionOk+'문제 정답';
  document.getElementById('rOk').textContent=sessionOk;
  document.getElementById('rNg').textContent=sessionNg;
  document.getElementById('rSk').textContent=sk;

  /* 단계별 성적 */
  const hl=document.getElementById('histList'); hl.innerHTML='';
  LEVELS.forEach(lv=>{
    const d=scoreData[lv];
    if(!d) return;
    const t=d.ok+d.ng+d.sk;
    if(t===0) return;
    const p=Math.round(d.ok/t*100);
    hl.innerHTML+=`<div class="hist-row">
      <span class="hist-lv">${lv}</span>
      <div class="hist-bar-bg"><div class="hist-bar-fill${p<60?' fail':''}" style="width:${p}%"></div></div>
      <span class="hist-pct">${p}%</span>
    </div>`;
  });
  document.getElementById('histPanel').style.display=hl.innerHTML?'block':'none';

  /* 오답 목록 */
  const wl=document.getElementById('wrongItems'); wl.innerHTML='';
  if(wrongQs.length>0){
    document.getElementById('wrongList').style.display='block';
    wrongQs.forEach((q,i)=>{
      const div=document.createElement('div');
      div.className='wrong-item';
      div.innerHTML=`<div class="wi-num">오답 ${i+1} · ${q.cat}</div>
        <div class="wi-q">${q.q}</div>
        <div class="wi-ans">✅ 정답: ${NL[ns][q.ans]} ${q.opts[q.ans]}</div>`;
      div.onclick=()=>{
        div.innerHTML+=`<div style="font-size:11px;color:#5DCAA5;margin-top:6px;line-height:1.6;">💡 ${q.ex}</div>`;
        div.onclick=null;
      };
      wl.appendChild(div);
    });
  }

  /* TTS 결과 낭독 */
  spk(pct+'점입니다. '+(pass?'합격권입니다. 수고하셨습니다.':'60점 미만입니다. 조금 더 노력하세요.'),()=>{});
}

function restartQuiz(){
  document.getElementById('resultScreen').classList.remove('show');
  document.getElementById('quizArea').style.display='block';
  document.getElementById('scoreBar').style.display='flex';
  document.getElementById('wrongList').style.display='none';
  retryMode=false;
  initScore(); switchLevel(curLevel);
}
function retryWrong(){
  if(wrongQs.length===0){setSt('오답이 없습니다!');return;}
  document.getElementById('resultScreen').classList.remove('show');
  document.getElementById('quizArea').style.display='block';
  document.getElementById('scoreBar').style.display='flex';
  retryMode=true;
  Qs=[...wrongQs];
  sessionOk=0; sessionNg=0; wrongQs=[];
  cur=0; answered=false;
  updateScoreBar(); buildDots(); renderQ();
  setSt('오답 '+Qs.length+'문제 다시풀기');
}

/* ── 단계 선택 ── */
function buildLevelBar(){
  const bar=document.getElementById('levelBar');
  bar.innerHTML='';

  const groups=[
    {
      title:'기출문제',
      desc:'챕터1~4 기출 단원 묶음',
      keys:["배관공학의기초1","관의접합및성형3","용접의종류및특성4","챕터2_01_관의종류및특성","챕터2_02_관이음재료","챕터2_03_밸브및배관부속재료","챕터2_04_관의지지기구","챕터2_05_보온단열재","챕터3_01_배관설비도면","챕터3_02_판금","챕터4_01_급수설비","챕터4_02_배수및통기배관","챕터4_03_급탕설비","챕터4_04_소화설비","챕터4_05_온수난방설비","챕터4_06_증기난방설비","챕터4_07_냉방및공기조화설비","챕터4_08_집진설비및세정설비","챕터4_09_플랜트배관설비","챕터4_10_위생설비및소화설비","챕터4_11_배관설비검사및계측","챕터4_12_설비자동화","챕터4_13_안전관리","챕터5_01_공업경영"],
      labels:[
        ["챕터1-01", "배관공학의 기초 · 100문제"],
        ["챕터1-02", "관의 접합 및 성형 · 111문제"],
        ["챕터1-03", "용접의 종류 및 특성 · 74문제"],
        ["챕터2-01", "관의 종류 및 특성 · 82문제"],
        ["챕터2-02", "관 이음 재료 · 56문제"],
        ["챕터2-03", "밸브 및 배관 부속재료 · 83문제"],
        ["챕터2-04", "관의 지지 기구 · 31문제"],
        ["챕터2-05", "보온 단열재 · 68문제"],
        ["챕터3-01", "배관설비도면 · 146문제"],
        ["챕터3-02", "판금 · 6문제"],
        ["챕터4-01", "급수설비 · 18문제"],
        ["챕터4-02", "배수 및 통기배관 · 13문제"],
        ["챕터4-03", "급탕설비 · 6문제"],
        ["챕터4-04", "소화설비 · 7문제"],
        ["챕터4-05", "온수난방설비 · 11문제"],
        ["챕터4-06", "증기난방설비 · 21문제"],
        ["챕터4-07", "냉방 및 공기조화설비 · 9문제"],
        ["챕터4-08", "집진설비 및 세정설비 · 12문제"],
        ["챕터4-09", "플랜트 배관설비 · 11문제"],
        ["챕터4-10", "위생설비 및 소화설비 · 4문제"],
        ["챕터4-11", "배관설비 검사 및 계측 · 8문제"],
        ["챕터4-12", "설비자동화 · 11문제"],
        ["챕터4-13", "안전관리 · 6문제"],
        ["챕터5-01", "공업경영 · 157문제"]
      ]
    },
    {
      title:'기출회차41회~63회',
      desc:'2007-41회부터 2018-63회까지 실제 과년도 회차형 문제 훈련',
      keys:['기출41회','기출42회','기출43회','기출44회','기출45회','기출46회','기출47회','기출48회','기출49회'],
      labels:[
        ['2007-41회','60문제'],
        ['2007-42회','60문제'],
        ['2008-43회','60문제'],
        ['2008-44회','60문제'],
        ['2009-45회','60문제'],
        ['2009-46회','60문제'],
        ['2010-47회','60문제'],
        ['2010-48회','60문제'],
        ['2011-49회','60문제']
      ]
    },
    {
      title:'기출복원문제',
      desc:'2019-1회 복원문제 추가 완료 / 이후 회차 순차 입력 예정',
      keys:[],
      labels:[]
    }
  ];

  const wrap=document.createElement('div');
  wrap.className='quiz-toc-wrap';
  const total=(typeof DB!=='undefined'&&DB)?Object.values(DB).reduce((a,b)=>a+(Array.isArray(b)?b.length:0),0):0;
  wrap.innerHTML='<div class="quiz-toc-head"><div><div class="quiz-toc-title">문제풀이 목차</div><div class="quiz-toc-gdesc">기출문제 / 기출회차41회~63회 / 기출복원문제 메뉴 구조 적용.</div></div><div class="quiz-toc-sub">총 '+total+'문제 · v30.81</div></div>';

  const grid=document.createElement('div');
  grid.className='quiz-toc-grid';

  groups.forEach(g=>{
    const group=document.createElement('div');
    group.className='quiz-toc-group'+(g.keys.includes(curLevel)?' on':'');
    const count=g.keys.reduce((a,k)=>a+((DB[k]&&DB[k].length)||0),0);
    const head=document.createElement('div');
    head.className='quiz-toc-ghead';
    head.innerHTML='<div><div class="quiz-toc-gname">'+g.title+'</div><div class="quiz-toc-gdesc">'+g.desc+'</div></div><div class="quiz-toc-count">'+count+'문제</div>';
    group.appendChild(head);

    const btns=document.createElement('div');
    btns.className='quiz-toc-btns';
    g.keys.forEach((lv,i)=>{
      if(!DB[lv]) return;
      const b=document.createElement('button');
      b.className='lv-btn'+(lv===curLevel?' on':'');
      b.title=lv+' · '+DB[lv].length+'문제';
      const main=g.labels[i] ? g.labels[i][0] : lv;
      const sub=g.labels[i] ? g.labels[i][1] : (DB[lv].length+'문제');
      b.innerHTML='<span class="lv-main">'+main+'</span><span class="lv-sub">'+sub+'</span>';
      b.onclick=()=>switchLevel(lv);
      btns.appendChild(b);
    });
    group.appendChild(btns);
    grid.appendChild(group);
  });

  wrap.appendChild(grid);
  bar.appendChild(wrap);
}
function switchLevel(lv){
  curLevel=lv; Qs=DB[lv]; cur=0; answered=false;
  retryMode=false;
  initScore();
  curQuizGroup=getQuizGroupByLevel(lv).key; buildLevelBar(); buildDots(); renderQ(); updateQuizCurrentTitle();
  document.getElementById('resultScreen').classList.remove('show');
  document.getElementById('quizArea').style.display='block';
  document.getElementById('scoreBar').style.display='flex';
}

/* ── 설정 ── */
function toggleSettings(force){
  const p=document.getElementById('settingsPanel');
  const bd=document.getElementById('settingsBackdrop');
  const show=(typeof force==='boolean')?force:!p.classList.contains('show');
  p.classList.toggle('show',show);
  if(bd) bd.classList.toggle('show',show);
  document.querySelectorAll('.setting-trigger,#settingBtn').forEach(b=>b.classList.toggle('active',show));
  if(show) setTimeout(()=>{loadV();},50);
}
function closeSettings(e){
  if(e){e.stopPropagation(); e.preventDefault();}
  const p=document.getElementById('settingsPanel');
  if(p && p.classList.contains('show')) toggleSettings(false);
}
function setNS(i,b){
  ns=Number(i);
  document.querySelectorAll('#nsRow .sb').forEach(x=>x.classList.remove('on'));
  if(b) b.classList.add('on');
  if(appSettings) appSettings.numberStyle=ns;
  markSettingsDirty();
}
function setPB(v,b){
  pb=Number(v);
  document.querySelectorAll('#pbRow .sb').forEach(x=>x.classList.remove('on'));
  if(b) b.classList.add('on');
  if(appSettings) appSettings.pauseBetweenChoices=pb;
  markSettingsDirty();
}
function setTH(v,b){
  th=Number(v);
  document.querySelectorAll('#thRow .sb').forEach(x=>x.classList.remove('on'));
  if(b) b.classList.add('on');
  if(appSettings) appSettings.thinkTime=th;
  markSettingsDirty();
}

/* ── 음성 로드 ── */

function preferKoreanOnlineVoice(){}


function loadV(){
  if(!appSettings) appSettings=loadSettings();

  let a=synth.getVoices();
  voices=a.filter(v=>v.lang && v.lang.startsWith('ko'));
  if(!voices.length) voices=a.slice(0,6);

  const g=document.getElementById('voiceGrid');
  if(!g){
    applySettings(appSettings);
    return;
  }

  if(!voices.length){
    g.innerHTML='<div style="font-size:11px;color:#555;grid-column:span 2;padding:4px;">한국어 음성 없음 — 기기 설정에서 추가해주세요</div>';
    applySettings(appSettings);
    return;
  }

  selV = voices.find(v=>v.name===appSettings.voiceName) || preferredKoreanVoice();

  g.innerHTML='';
  voices.forEach((v)=>{
    const c=document.createElement('div');
    c.className='voice-card'+(selV && v.name===selV.name ? ' active' : '');
    c.setAttribute('data-voice-name',v.name);
    const n=v.name.replace(/Microsoft |Google |Apple /g,'').split(' ').slice(0,2).join(' ');
    c.innerHTML='<div class="vn">'+n+'</div><div class="vl">'+v.lang+(v.localService?' · 로컬':' · 온라인')+'</div>';
    c.onclick=()=>{
      document.querySelectorAll('.voice-card').forEach(x=>x.classList.remove('active'));
      c.classList.add('active');
      selV=v;
      if(appSettings) appSettings.voiceName=v.name;
      markSettingsDirty();
    };
    g.appendChild(c);
  });

  applySettings(appSettings);

  const sliders=document.querySelectorAll('.sl-row input[type="range"]');
  if(sliders[0]){
    sliders[0].oninput=function(){
      rate=parseFloat(this.value);
      if(appSettings) appSettings.rate=rate;
      const rv=document.getElementById('rv'); if(rv) rv.textContent=rate.toFixed(1);
      markSettingsDirty();
    };
  }
  if(sliders[1]){
    sliders[1].oninput=function(){
      pitch=parseFloat(this.value);
      if(appSettings) appSettings.pitch=pitch;
      const pv=document.getElementById('pv'); if(pv) pv.textContent=pitch.toFixed(1);
      markSettingsDirty();
    };
  }

  const ae=document.getElementById('autoEx');
  const an=document.getElementById('autoNx');
  const qfa=document.getElementById('quizFullAuto');
  const qtr=document.getElementById('quizTrack');
  const pwm=document.getElementById('padWideMode');
  if(ae) ae.onchange=()=>{ if(appSettings) appSettings.autoExplain=ae.checked; markSettingsDirty(); };
  if(an) an.onchange=()=>{ if(appSettings) appSettings.autoNext=an.checked; markSettingsDirty(); };
  if(qfa) qfa.onchange=()=>{ if(appSettings) appSettings.quizFullAuto=qfa.checked; markSettingsDirty(); };
  if(qtr) qtr.onchange=()=>{ if(appSettings) appSettings.quizTrack=qtr.checked; markSettingsDirty(); };
  if(pwm) pwm.onchange=()=>{ if(appSettings) appSettings.padWideMode=pwm.checked; applyLayoutMode(pwm.checked); markSettingsDirty(); };
  updateDirtyNote();
}

/* ── Wake Lock 안정화 ── */
function wakePill(){
  return document.getElementById('wakePill');
}
function setWakePill(text, color){
  const el=wakePill();
  if(!el) return;
  el.textContent=text;
  if(color) el.style.background=color;
}
function clearWakeRetry(){
  if(wakeRetryTimer){
    clearTimeout(wakeRetryTimer);
    wakeRetryTimer=null;
  }
}
function scheduleWakeRetry(ms){
  clearWakeRetry();
  if(!wakeWanted) return;
  wakeRetryTimer=setTimeout(()=>{
    wakeRetryTimer=null;
    if(wakeWanted) reqWake(wakeLastReason||'재요청');
  }, ms||1500);
}
async function reqWake(reason){
  wakeWanted=true;
  wakeLastReason=reason||wakeLastReason||'화면유지';
  clearWakeRetry();

  if(!('wakeLock' in navigator)){
    setWakePill('화면유지 미지원','#444');
    return false;
  }
  if(document.visibilityState && document.visibilityState!=='visible'){
    setWakePill('화면유지 대기','#55420F');
    return false;
  }
  if(wakeLock){
    setWakePill('화면유지 켜짐','#1D5A36');
    return true;
  }

  try{
    wakeLock=await navigator.wakeLock.request('screen');
    setWakePill('화면유지 켜짐','#1D5A36');
    wakeLock.addEventListener('release',()=>{
      wakeLock=null;
      if(wakeWanted && document.visibilityState==='visible'){
        setWakePill('화면유지 재요청','#55420F');
        scheduleWakeRetry(700);
      }else{
        setWakePill('화면유지 해제','#444');
      }
    });
    return true;
  }catch(e){
    setWakePill('화면유지 실패','#5A1515');
    if(wakeWanted) scheduleWakeRetry(3000);
    return false;
  }
}
function relWake(){
  wakeWanted=false;
  wakeLastReason='';
  clearWakeRetry();
  if(wakeLock){
    const wl=wakeLock;
    wakeLock=null;
    try{ wl.release(); }catch(e){}
  }
  setWakePill('화면유지 꺼짐','#444');
}
function keepWakeForPlayback(reason){
  if(driveOn || theoryDriveOn || (theoryReadQueue && theoryReadQueue.length) || normalFullAuto){
    reqWake(reason||'재생 중');
  }
}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible' && wakeWanted){
    setWakePill('화면유지 복구중','#55420F');
    setTimeout(()=>reqWake(wakeLastReason||'화면복귀'),300);
  }
});
document.addEventListener('click',()=>{
  if(wakeWanted) reqWake(wakeLastReason||'사용자 조작');
},{passive:true});
document.addEventListener('touchstart',()=>{
  if(wakeWanted) reqWake(wakeLastReason||'사용자 조작');
},{passive:true});
if(!wakeWatchTimer){
  wakeWatchTimer=setInterval(()=>{
    if(wakeWanted && document.visibilityState==='visible' && !wakeLock){
      reqWake(wakeLastReason||'주기확인');
    }
  },30000);
}

/* ── 화면 잠금 ── */
function lockScreen(){
  locked=true;
  document.getElementById('lockOverlay').classList.add('show');
  document.getElementById('lockStatusTxt').textContent='';
  const btn=document.getElementById('holdBtn');
  const fill=document.getElementById('unlockFill');
  const stxt=document.getElementById('lockStatusTxt');
  btn.onmousedown=btn.ontouchstart=function(e){
    e.preventDefault();
    fill.style.transition='width 3s linear'; fill.style.width='100%';
    stxt.textContent='잠금 해제 중...';
    holdTimer=setTimeout(()=>unlockScreen(),3000);
  };
  btn.onmouseup=btn.ontouchend=btn.onmouseleave=function(){
    clearTimeout(holdTimer); holdTimer=null;
    fill.style.transition='none'; fill.style.width='0%';
    stxt.textContent='';
  };
}
function unlockScreen(){
  locked=false;
  document.getElementById('lockOverlay').classList.remove('show');
  document.getElementById('unlockFill').style.width='0%';
}

/* ── 이동모드 ── */
function toggleDrive(){
  driveOn=!driveOn; paused=false;
  document.getElementById('driveBar').classList.toggle('show',driveOn);
  const driveStart=document.getElementById('driveStartBtn');
  if(driveStart) driveStart.style.display=driveOn?'none':'flex';
  const landscapeDriveStart=document.getElementById('landscapeDriveStartBtn');
  if(landscapeDriveStart) landscapeDriveStart.style.display=driveOn?'none':'';
  document.getElementById('driveToggleBtn').classList.toggle('active',driveOn);
  if(driveOn){reqWake('문제 이동 중 청취'); resetAuto(); setTimeout(()=>lockScreen(),1500);}
  else{tStop(); if(!theoryDriveOn) relWake(); if(locked) unlockScreen();}
}
function togglePause(){
  paused=!paused;
  const btn=document.getElementById('bigBtn');
  const ico=document.getElementById('pauseIco');
  const lbl=document.getElementById('pauseLbl');
  if(paused){
    try{synth.pause();}catch(e){}
    setTimeout(()=>{ if(paused){ try{synth.cancel();}catch(e){} } },90);
    btn.classList.add('paused');
    document.getElementById('thinkWrap').classList.add('paused');
    ico.innerHTML='<polygon points="5 3 19 12 5 21 5 3"/>';
    lbl.textContent='재개하기';
    setQuizLogoPlayPauseIcon('play');
    setSt('⏸ 일시정지 중입니다. 재개하면 현재 읽던 구간부터 다시 재생합니다.');
  } else {
    btn.classList.remove('paused');
    document.getElementById('thinkWrap').classList.remove('paused');
    ico.innerHTML='<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    lbl.textContent='일시정지';
    setQuizLogoPlayPauseIcon('pause');
    setSt('▶ 재개합니다.');
    const fn=quizResumeTask || resumeTask;
    quizResumeTask=null;
    resumeTask=null;
    try{synth.cancel();}catch(e){}
    if(fn){
      setTimeout(()=>{ if(!paused && driveOn && typeof fn==='function') fn(); },160);
    }
  }
}
/* ── TTS ── */
/* ── 영문 → 한글 발음 변환 ── */



function ensureDefaultTogglesVisual(){}



/* ── v15 기본 설정 즉시 적용 ── */

/* ── v16 설정값 ↔ 화면 동기화 ── */
function setActiveInRow(rowSel, predicate){
  document.querySelectorAll(rowSel+' .sb').forEach(b=>b.classList.toggle('on', predicate(b)));
}
function applySettingsToRuntimeAndUI(){}


function applyUserRequestedDefaultSettings(){}

function resetToUserDefaultSettings(){}


/* ── v14 사용자 기본 설정값 ── */
function applyDefaultVoiceSettingsIfFirstRun(){}



/* ── v17 통합 설정 저장 시스템 ── */
const SETTINGS_KEY='pipe_master_settings_v17';
const DEFAULT_SETTINGS={
  voiceName:'',
  rate:1.1,
  pitch:1.0,
  numberStyle:0,
  pauseBetweenChoices:0.5,
  thinkTime:3,
  autoExplain:true,
  autoNext:true,
  quizFullAuto:false,
  quizTrack:true,
  theoryExamTTS:false,
  theoryAutoMode:'subject',
  padWideMode:true
};
let appSettings=null;
let settingsDirty=false;

function normalizeSettings(obj){
  const s=Object.assign({}, DEFAULT_SETTINGS, obj||{});
  s.rate=Math.max(0.5, Math.min(1.8, Number(s.rate)||DEFAULT_SETTINGS.rate));
  s.pitch=Math.max(0.5, Math.min(2.0, Number(s.pitch)||DEFAULT_SETTINGS.pitch));
  s.numberStyle=[0,1,2].includes(Number(s.numberStyle))?Number(s.numberStyle):DEFAULT_SETTINGS.numberStyle;
  s.pauseBetweenChoices=[0,0.5,1,2].includes(Number(s.pauseBetweenChoices))?Number(s.pauseBetweenChoices):DEFAULT_SETTINGS.pauseBetweenChoices;
  s.thinkTime=[3,5,10,15].includes(Number(s.thinkTime))?Number(s.thinkTime):DEFAULT_SETTINGS.thinkTime;
  s.autoExplain=!!s.autoExplain;
  s.autoNext=!!s.autoNext;
  s.quizFullAuto=!!s.quizFullAuto;
  s.quizTrack=(s.quizTrack===undefined)?true:!!s.quizTrack;
  s.theoryExamTTS=!!s.theoryExamTTS;
  s.theoryAutoMode=['once','next','subject','all'].includes(s.theoryAutoMode)?s.theoryAutoMode:DEFAULT_SETTINGS.theoryAutoMode;
  s.padWideMode=(s.padWideMode===undefined)?true:!!s.padWideMode;
  s.voiceName=String(s.voiceName||'');
  return s;
}
function loadSettings(){
  try{
    const saved=localStorage.getItem(SETTINGS_KEY);
    if(saved) return normalizeSettings(JSON.parse(saved));
  }catch(e){}
  return normalizeSettings(DEFAULT_SETTINGS);
}
function mirrorLegacySettings(s){
  try{
    localStorage.setItem('rate',String(s.rate));
    localStorage.setItem('pitch',String(s.pitch));
    localStorage.setItem('ns',String(s.numberStyle));
    localStorage.setItem('pb',String(s.pauseBetweenChoices));
    localStorage.setItem('th',String(s.thinkTime));
    localStorage.setItem('autoEx',String(s.autoExplain));
    localStorage.setItem('autoNx',String(s.autoNext));
    localStorage.setItem('quizFullAuto',String(s.quizFullAuto));
    localStorage.setItem('quizTrack',String(s.quizTrack));
    localStorage.setItem('theoryExamTTS',String(s.theoryExamTTS));
    localStorage.setItem('pipe_theory_auto_mode',s.theoryAutoMode);
    localStorage.setItem('padWideMode',String(s.padWideMode));
    if(s.voiceName) localStorage.setItem('voiceName',s.voiceName);
    else localStorage.removeItem('voiceName');
  }catch(e){}
}
function saveSettings(settings){
  const s=normalizeSettings(settings);
  localStorage.setItem(SETTINGS_KEY,JSON.stringify(s));
  mirrorLegacySettings(s);
  appSettings=s;
  settingsDirty=false;
  updateDirtyNote();
}
function markSettingsDirty(){
  settingsDirty=true;
  updateDirtyNote();
}
function updateDirtyNote(){
  const n=document.getElementById('settingsDirtyNote');
  if(n) n.classList.toggle('show',settingsDirty);
}
function preferredKoreanVoice(){
  if(!voices || !voices.length) return null;
  return voices.find(v=>(v.lang||'').toLowerCase().startsWith('ko') && /한국의|online|온라인|natural|google|microsoft/i.test((v.name||'')+' '+(v.voiceURI||'')))
      || voices.find(v=>(v.lang||'').toLowerCase().startsWith('ko'))
      || voices[0];
}
function setRowActive(rowSel,predicate){
  document.querySelectorAll(rowSel+' .sb').forEach(b=>b.classList.toggle('on',!!predicate(b)));
}
function applyLayoutMode(enabled){
  const on=(enabled!==false);
  document.documentElement.classList.toggle('tablet-wide-on',on);
  document.documentElement.classList.toggle('tablet-wide-off',!on);
  if(document.body){
    document.body.classList.toggle('tablet-wide-on',on);
    document.body.classList.toggle('tablet-wide-off',!on);
  }
  const cb=document.getElementById('padWideMode');
  if(cb) cb.checked=on;
}
function applySettings(settings, rebuildVoiceCards=false){
  appSettings=normalizeSettings(settings);
  applyLayoutMode(appSettings.padWideMode);
  rate=appSettings.rate;
  pitch=appSettings.pitch;
  ns=appSettings.numberStyle;
  pb=appSettings.pauseBetweenChoices;
  th=appSettings.thinkTime;
  theoryAutoMode=appSettings.theoryAutoMode;

  const sliders=document.querySelectorAll('.sl-row input[type="range"]');
  if(sliders[0]) sliders[0].value=String(rate);
  if(sliders[1]) sliders[1].value=String(pitch);
  const rv=document.getElementById('rv'); if(rv) rv.textContent=rate.toFixed(1);
  const pv=document.getElementById('pv'); if(pv) pv.textContent=pitch.toFixed(1);

  setRowActive('#nsRow', b=>Number(b.getAttribute('data-ns-index'))===ns);
  setRowActive('#pbRow', b=>Math.abs(Number(b.getAttribute('data-pb-value'))-pb)<0.001);
  setRowActive('#thRow', b=>Number(b.getAttribute('data-th-value'))===th);

  document.querySelectorAll('#theoryAutoRow .sb, #theoryAutoRowTop .sb').forEach(b=>{
    b.classList.toggle('on',b.getAttribute('data-theory-auto')===theoryAutoMode);
  });

  const ae=document.getElementById('autoEx');
  const an=document.getElementById('autoNx');
  const qfa=document.getElementById('quizFullAuto');
  const qtr=document.getElementById('quizTrack');
  const pwm=document.getElementById('padWideMode');
  if(ae) ae.checked=appSettings.autoExplain;
  if(an) an.checked=appSettings.autoNext;
  if(qfa) qfa.checked=appSettings.quizFullAuto;
  if(qtr) qtr.checked=appSettings.quizTrack;
  if(pwm) pwm.checked=appSettings.padWideMode;

  if(voices && voices.length){
    selV = voices.find(v=>v.name===appSettings.voiceName) || preferredKoreanVoice();
    document.querySelectorAll('.voice-card').forEach(c=>{
      c.classList.toggle('active', c.getAttribute('data-voice-name')===(selV&&selV.name));
    });
  }
  if(typeof updateTheoryAutoStatus==='function') updateTheoryAutoStatus();
}
function collectSettingsFromUI(){
  const sliders=document.querySelectorAll('.sl-row input[type="range"]');
  const activeNs=document.querySelector('#nsRow .sb.on');
  const activePb=document.querySelector('#pbRow .sb.on');
  const activeTh=document.querySelector('#thRow .sb.on');
  const activeTheory=document.querySelector('#theoryAutoRow .sb.on, #theoryAutoRowTop .sb.on');
  return normalizeSettings({
    voiceName: selV ? selV.name : '',
    rate: sliders[0] ? Number(sliders[0].value) : rate,
    pitch: sliders[1] ? Number(sliders[1].value) : pitch,
    numberStyle: activeNs ? Number(activeNs.getAttribute('data-ns-index')) : ns,
    pauseBetweenChoices: activePb ? Number(activePb.getAttribute('data-pb-value')) : pb,
    thinkTime: activeTh ? Number(activeTh.getAttribute('data-th-value')) : th,
    autoExplain: !!(document.getElementById('autoEx') && document.getElementById('autoEx').checked),
    autoNext: !!(document.getElementById('autoNx') && document.getElementById('autoNx').checked),
    quizFullAuto: !!(document.getElementById('quizFullAuto') && document.getElementById('quizFullAuto').checked),
    quizTrack: !(document.getElementById('quizTrack') && !document.getElementById('quizTrack').checked),
    theoryExamTTS: !!(document.getElementById('theoryExamTTS') && document.getElementById('theoryExamTTS').checked),
    padWideMode: !(document.getElementById('padWideMode') && !document.getElementById('padWideMode').checked),
    theoryAutoMode: activeTheory ? activeTheory.getAttribute('data-theory-auto') : theoryAutoMode
  });
}
function saveSettingsFromUI(){
  const s=collectSettingsFromUI();
  saveSettings(s);
  applySettings(s);
  alert('설정이 저장되었습니다.');
}
function resetSettingsToDefault(){
  const s=normalizeSettings(DEFAULT_SETTINGS);
  saveSettings(s);
  applySettings(s);
  loadV();
  alert('기본값으로 복원하고 저장했습니다.');
}
function initSettingsOnce(){
  appSettings=loadSettings();
  applySettings(appSettings);
}

/* ── v13 STS 계열 TTS 발음 보정 ── */
function fixStsPronunciation(s){
  let x = String(s);
  x = x
    .replace(/\bSTS[\s\-]*304\b/gi,'에스티에스 삼공사')
    .replace(/\bSTS[\s\-]*316\b/gi,'에스티에스 삼일육')
    .replace(/\bSUS[\s\-]*304\b/gi,'에스유에스 삼공사')
    .replace(/\bSUS[\s\-]*316\b/gi,'에스유에스 삼일육')
    .replace(/스테인리스\s*304/g,'스테인리스 삼공사')
    .replace(/스테인리스\s*316/g,'스테인리스 삼일육')
    .replace(/304(?=\s*(?:와|과|은|는|이|가|을|를|\/|,|\.|등))/g,'삼공사')
    .replace(/316(?=\s*(?:와|과|은|는|이|가|을|를|\/|,|\.|등))/g,'삼일육')
    .replace(/\bSTS\b/gi,'에스티에스')
    .replace(/\bSUS\b/gi,'에스유에스');
  return x;
}

function toKorean(txt){
  txt=fixStsPronunciation(txt);
  /* TTS 전용 정규화.
     목표: 케이에스(KS)처럼 한글 발음과 영문 약어가 같이 있을 때 두 번 읽지 않게 한다. */
  const map = {
    'SPPH':'에스피피에이치','SPP':'에스피피','STS':'에스티에스',
    'STPG':'에스티피지','STPA':'에스티피에이','SPPG':'에스피피지',
    'KS':'케이에스','JIS':'제이아이에스','ASTM':'에이에스티엠',
    'ISO':'아이에스오','PVC':'피브이씨','CPVC':'씨피브이씨','PE':'피이','HDPE':'에이치디피이','LDPE':'엘디피이','PP':'피피',
    'PTFE':'피티에프이','TIG':'티아이지','MIG':'엠아이지','MAG':'엠에이지',
    'TTS':'티티에스','API':'에이피아이','ANSI':'에이엔에스아이',
    'ASME':'에이에스엠이','DIN':'디아이엔','DN':'디엔',
    'NPT':'엔피티','PT':'피티','PF':'피에프',
    'GPM':'지피엠','LPM':'엘피엠','RPM':'알피엠',
    'MPa':'메가파스칼','kPa':'킬로파스칼','Pa':'파스칼',
    'kW':'킬로와트','kWh':'킬로와트시',
    'pH':'피에이치','CO2':'이산화탄소','CO₂':'이산화탄소','O₂':'산소','O2':'산소','C₂H₂':'아세틸렌','C2H2':'아세틸렌','H2O':'물','H₂O':'물','DCSP':'디씨에스피','DCRP':'디씨알피','BCuP':'비씨유피','BAg':'비에이지',
    'QCD':'큐씨디','QC':'큐씨','PDCA':'피디씨에이','PERT':'퍼트','CPM':'씨피엠',
    'A':'에이','B':'비','C':'씨','D':'디',
    'No':'번호','no':'번호'
  };
  let result = String(txt||'');

  /* v30.20 TTS FIX 01
     문제풀이 TTS에서 정(chisel), 액추에이터(actuator), ZD(Zero Defect)처럼
     한글 용어 뒤에 붙은 영문 괄호 설명을 함께 읽어 중복되는 문제를 방지한다.
     화면 표시 원문은 그대로 두고 음성 변환 텍스트에서만 제외한다.
     단, (단, ...), (보기), (100~250[mmHgV])처럼 한글 설명이나 숫자로 시작하는 조건값은 보존한다. */
  result = result.replace(/([가-힣A-Za-z0-9₂₃₄₅₆₇₈₉₀])\s*[\(（]\s*[A-Za-z][A-Za-z0-9\s.,·\/\+\-₀-₉₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹]*\s*[\)）]/g, '$1');

  /* 케이에스(KS), KS(케이에스), 에스피피(SPP) 같은 중복 낭독 제거 */
  Object.keys(map).sort((a,b)=>b.length-a.length).forEach(k=>{
    const v=map[k];
    const escK=k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const escV=v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    result=result.replace(new RegExp(escV+'\\s*\\(\\s*'+escK+'\\s*\\)','g'), v);
    result=result.replace(new RegExp(escK+'\\s*\\(\\s*'+escV+'\\s*\\)','g'), v);
  });

  /* 온도와 단위는 숫자와 붙어 있어도 자연스럽게 읽도록 먼저 처리 */
  result = result.replace(/(\d+(?:\.\d+)?)\s*°C/g, '$1도');
  result = result.replace(/(\d+(?:\.\d+)?)\s*℃/g, '$1도');
  result = result.replace(/(\d+(?:\.\d+)?)\s*MPa/g, '$1메가파스칼');
  result = result.replace(/(\d+(?:\.\d+)?)\s*kPa/g, '$1킬로파스칼');
  result = result.replace(/(\d+(?:\.\d+)?)\s*m\/s/g, '$1미터 매 초');
  result = result.replace(/(\d+(?:\.\d+)?)\s*m²/g, '$1제곱미터');
  result = result.replace(/(\d+(?:\.\d+)?)\s*m3/g, '$1세제곱미터');
  result = result.replace(/(\d+(?:\.\d+)?)\s*A\b/g, '$1에이');


  result = result.replace(/(\d+(?:\.\d+)?(?:~\d+(?:\.\d+)?)?)\s*\[mm\]/g, '$1밀리미터');
  result = result.replace(/(\d+(?:\.\d+)?(?:~\d+(?:\.\d+)?)?)\s*\[A\]/g, '$1에이');
  result = result.replace(/(\d+(?:\.\d+)?(?:~\d+(?:\.\d+)?)?)\s*\[℃\]/g, '$1도');
  result = result.replace(/(\d+(?:\.\d+)?(?:~\d+(?:\.\d+)?)?)\s*\[%\]/g, '$1퍼센트');
  result = result.replace(/(\d+(?:\.\d+)?(?:~\d+(?:\.\d+)?)?)\s*\[MPa\]/g, '$1메가파스칼');
  result = result.replace(/(\d+(?:\.\d+)?(?:~\d+(?:\.\d+)?)?)\s*\[rpm\]/g, '$1알피엠');
  result = result.replace(/(\d+(?:\.\d+)?(?:~\d+(?:\.\d+)?)?)\s*\[g\]/g, '$1그램');
  result = result.replace(/(\d+(?:\.\d+)?(?:~\d+(?:\.\d+)?)?)\s*\[L\/h\]/g, '$1리터 매 시간');
  result = result.replace(/(\d+(?:\.\d+)?(?:~\d+(?:\.\d+)?)?)\s*\[kgf\/cm²\]/g, '$1킬로그램힘 매 제곱센티미터');
  result = result.replace(/(\d+(?:\.\d+)?(?:~\d+(?:\.\d+)?)?)\s*\[mmHg\]/g, '$1밀리미터 수은주');
  result = result.replace(/10⁻⁴/g, '10의 마이너스 4승');
  result = result.replace(/10⁻⁶/g, '10의 마이너스 6승');
  result = result.replace(/²/g, '제곱');

  /* 긴 약어부터 치환 */
  Object.keys(map).sort((a,b)=>b.length-a.length).forEach(k=>{
    const re = new RegExp('(^|[^A-Za-z0-9가-힣])'+k+'(?=$|[^A-Za-z0-9가-힣])','g');
    result = result.replace(re, (m,p1)=>p1+map[k]);
  });

  /* 남은 연속 대문자 2자 이상은 알파벳 하나씩 읽기 */
  result = result.replace(/\b([A-Z]{2,})\b/g, m=>{
    const alphaMap={'A':'에이','B':'비','C':'씨','D':'디','E':'이','F':'에프',
      'G':'지','H':'에이치','I':'아이','J':'제이','K':'케이','L':'엘',
      'M':'엠','N':'엔','O':'오','P':'피','Q':'큐','R':'알','S':'에스',
      'T':'티','U':'유','V':'브이','W':'더블유','X':'엑스','Y':'와이','Z':'지'};
    return m.split('').map(c=>alphaMap[c]||c).join('');
  });

  /* TTS가 괄호와 기호를 과하게 읽지 않도록 완화 */
  result = result.replace(/[()]/g,' ');
  result = result.replace(/[·/]/g,' ');
  result = result.replace(/[:=]/g,' ');
  result = result.replace(/\s+/g,' ').trim();
  return result;
}

function spk(txt,cb,mode){
  keepWakeForPlayback('TTS 재생');
  const rawTxt=String(txt||'');
  const isQuiz=(mode==='quiz');
  const token=++speakToken;
  try{synth.cancel();}catch(e){}
  if(isQuiz){
    quizResumeTask=()=>spk(rawTxt,cb,'quiz');
  }
  const u=new SpeechSynthesisUtterance(toKorean(rawTxt));
  u.lang='ko-KR'; if(selV) u.voice=selV; u.rate=rate; u.pitch=pitch;
  u.onend=()=>{
    if(token!==speakToken) return;
    clrB();
    if(isQuiz && !paused) quizResumeTask=null;
    if(cb){
      if(paused){
        if(isQuiz) quizResumeTask=()=>spk(rawTxt,cb,'quiz');
        else resumeTask=cb;
      } else cb();
    }
  };
  u.onerror=()=>{
    if(token!==speakToken) return;
    if(paused){
      if(isQuiz) quizResumeTask=()=>spk(rawTxt,cb,'quiz');
      else resumeTask=cb;
      return;
    }
    if(cb) cb();
  };
  synth.speak(u);
  if(locked) document.getElementById('lockNow').textContent=rawTxt.length>40?rawTxt.substring(0,40)+'...':rawTxt;
}
function spkQ(txt,cb){ spk(txt,cb,'quiz'); }
/* 정답 낭독은 보기 읽기 방식과 분리한다.
   기존 문제: L[q.ans]가 '4번'인데 뒤에 '번'을 또 붙여 '4번번'으로 낭독됨.
   수정: 정답 안내는 항상 '정답은 4번입니다.' 형식으로 고정한다. */
function ansNo(q){ return (Number(q.ans)+1)+'번'; }
function spkAns(L,q,cb){
  const correctEl=document.querySelectorAll('#opts .opt')[Number(q.ans)];
  quizTtsFocus(correctEl,'정답 '+ansNo(q)+' 읽는 중');
  spkQ('정답은 '+ansNo(q)+'입니다.',()=>{
    setTimeout(()=>{
      if(paused){ resumeTask=()=>{quizTtsFocus(document.getElementById('exBox'),'해설 읽는 중'); spkQ('해설. '+q.ex, cb);}; return; }
      let done=false;
      const finish=()=>{ if(done) return; done=true; if(cb) cb(); };
      quizTtsFocus(document.getElementById('exBox'),'해설 읽는 중');
      spkQ('해설. '+q.ex, finish);
      /* v30.20 TTS FIX 01
         기존 안전 타이머가 긴 해설을 아직 읽는 중에도 finish()를 호출하여
         자동 다음 문제로 넘어가는 문제가 있었다.
         이제는 speechSynthesis가 실제로 말하는 중이면 절대 완료 처리하지 않고,
         일부 브라우저에서 onend가 누락된 경우에만 말하기 종료 상태를 확인한 뒤 보조 완료 처리한다. */
      const explainWatchdog=()=>{
        if(done || paused) return;
        try{
          if(synth && (synth.speaking || synth.pending)){
            setTimeout(explainWatchdog,1500);
            return;
          }
        }catch(e){}
        finish();
      };
      setTimeout(explainWatchdog,8000);
    },500);
  });
}
function spkOpts(opts,labels,cb){
  let i=0;
  function go(){
    if(i>=opts.length){if(cb)cb();return;}
    const curIdx=i;
    const optEl=document.querySelectorAll('#opts .opt')[curIdx];
    quizTtsFocus(optEl, labels[curIdx]+' 보기 읽는 중');
    const txt=labels[i]+'. '+opts[i]; i++;
    spkQ(txt,()=>{
      if(pb>0&&i<opts.length){pbTimer=setTimeout(()=>{if(paused) resumeTask=go; else go();},pb*1000);}
      else go();
    });
  }
  go();
}
function ttsTest(){spk('안녕하세요. RavenBix 배관기능장 수험앱입니다. STS 304는 에스티에스 삼공사. STS 316은 에스티에스 삼일육으로 읽습니다. KS는 케이에스. 1MPa는 일 메가파스칼로 읽습니다.');}
function tStop(){
  synth.cancel(); stopTH();
  stopTheoryDriveMode();
  if(nxTimer){clearTimeout(nxTimer);nxTimer=null;}
  if(pbTimer){clearTimeout(pbTimer);pbTimer=null;}
  resumeTask=null;
  quizResumeTask=null;
  autoNextLock=false;
  paused=false;
  setQuizLogoPlayPauseIcon('play');
  const btn=document.getElementById('bigBtn');
  if(btn) btn.classList.remove('paused');
  const tw=document.getElementById('thinkWrap');
  if(tw) tw.classList.remove('paused');
  resetTheoryPauseButton();
  resetQuizPauseButton();
  clrB(); clearTheoryTrack(); quizTtsClearTrack(); setSt('');
  if(!driveOn && !theoryDriveOn) relWake();
}
function ttsStop(){ tStop(); }
function clrB(){['bQ','bO','bA'].forEach(id=>{const e=document.getElementById(id);if(e)e.classList.remove('on');});}
function setSt(m){document.getElementById('status').innerHTML=m;}

/* ── v30.49 로고행 재생·일시정지 아이콘 상태 동기화 ── */
const QUIZ_LOGO_PLAY_SVG='<polygon points="6 4 20 12 6 20 6 4"/>';
const QUIZ_LOGO_PAUSE_SVG='<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
function setQuizLogoPlayPauseIcon(state){
  const btn=document.getElementById('quizLogoPlayPauseBtn');
  const ico=document.getElementById('quizLogoPlayPauseIco');
  if(!btn||!ico) return;
  if(state==='pause'){
    btn.classList.add('paused');
    ico.innerHTML=QUIZ_LOGO_PAUSE_SVG;
    btn.setAttribute('aria-label','일시정지');
    btn.title='일시정지';
  }else{
    btn.classList.remove('paused');
    ico.innerHTML=QUIZ_LOGO_PLAY_SVG;
    btn.setAttribute('aria-label','재생');
    btn.title='재생';
  }
}
function refreshQuizLogoPlayPause(){
  let active=false;
  try{ active=!!(synth && (synth.speaking || synth.pending) && !paused); }catch(e){}
  setQuizLogoPlayPauseIcon(active?'pause':'play');
}
function toggleQuizLogoPlayPause(){
  if(driveOn){ togglePause(); setTimeout(refreshQuizLogoPlayPause,120); return; }
  if(paused){
    paused=false;
    resumeQuizPausedWork();
    setQuizLogoPlayPauseIcon('pause');
    setTimeout(refreshQuizLogoPlayPause,300);
    return;
  }
  let active=false;
  try{ active=!!(synth && (synth.speaking || synth.pending)); }catch(e){}
  if(active){
    toggleQuizPause();
    setQuizLogoPlayPauseIcon('play');
  }else{
    mRead('all');
    setQuizLogoPlayPauseIcon('pause');
    setTimeout(refreshQuizLogoPlayPause,500);
  }
}
if(!window.__quizLogoPlayPauseWatcher){
  window.__quizLogoPlayPauseWatcher=setInterval(()=>{
    if(document.getElementById('screenQuiz')?.classList.contains('active')) refreshQuizLogoPlayPause();
  },1200);
}

/* ── v30.20 TTS FIX 05. 문제풀이 일시정지/이어서재생 버튼 ── */
function resetQuizPauseButton(){
  setTimeout(refreshQuizLogoPlayPause,80);
  const btn=document.getElementById('quizPauseBtn');
  const ico=document.getElementById('quizPauseIco');
  const lbl=document.getElementById('quizPauseLbl');
  if(btn) btn.classList.remove('paused');
  if(ico) ico.innerHTML='<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
  if(lbl) lbl.textContent='일시정지';
}
function setQuizPauseButtonPaused(){
  setQuizLogoPlayPauseIcon('play');
  const btn=document.getElementById('quizPauseBtn');
  const ico=document.getElementById('quizPauseIco');
  const lbl=document.getElementById('quizPauseLbl');
  if(btn) btn.classList.add('paused');
  if(ico) ico.innerHTML='<polygon points="5 3 19 12 5 21 5 3"/>';
  if(lbl) lbl.textContent='이어서재생';
}
function resumeQuizPausedWork(){
  resetQuizPauseButton();
  setSt('▶ 이어서 재생합니다.');
  const fn=quizResumeTask || resumeTask;
  quizResumeTask=null;
  resumeTask=null;
  try{synth.cancel();}catch(e){}
  setTimeout(()=>{
    if(!paused && typeof fn==='function') fn();
  },160);
}
function toggleQuizPause(){
  if(driveOn){ togglePause(); return; }
  if(paused){
    paused=false;
    resumeQuizPausedWork();
  }else{
    paused=true;
    setQuizPauseButtonPaused();
    setSt('⏸ 문제풀이 TTS 일시정지 중입니다. 이어서재생을 누르면 현재 읽던 구간부터 다시 재생합니다.');
    try{synth.pause();}catch(e){}
    setTimeout(()=>{ if(paused){ try{synth.cancel();}catch(e){} } },90);
  }
}

function mRead(t){
  if(driveOn) return;
  setQuizLogoPlayPauseIcon('pause');
  if(!Qs.length){setSt('이 단계에 문제가 없습니다');return;}
  if(paused){paused=false; resetQuizPauseButton(); quizResumeTask=null; try{synth.cancel();}catch(e){}}
  const q=Qs[cur], L=NL[ns]; clrB();
  if(t!=='all') normalFullAuto=false;
  if(t==='q'){
    document.getElementById('bQ').classList.add('on');
    setSt('🔊 문제 읽는 중...');
    quizSpeakProblem(q,()=>setSt(''));
  }
  else if(t==='opts'){
    document.getElementById('bO').classList.add('on');
    setSt('🔊 보기 읽는 중...');
    spkOpts(q.opts,L,()=>{quizTtsClearTrack();setSt('');});
  }
  else if(t==='ans'){
    if(!answered){setSt('⚠️ 먼저 답을 선택해주세요');return;}
    document.getElementById('bA').classList.add('on'); setSt('🔊 해설 읽는 중...');
    spkAns(L,q,()=>{quizTtsClearTrack();setSt('');});
  } else if(t==='all'){
    normalFullAuto=quizFullAutoEnabled();
    setSt(normalFullAuto?'🔊 전체읽기 완전 자동 진행 중...':'🔊 전체 읽는 중...');
    quizSpeakProblem(q,()=>{
      spkOpts(q.opts,L,()=>{
        if(answered) spkAns(L,q,()=>safeExplainDone(q));
        else if(document.getElementById('autoEx').checked){
          setSt('💭 생각할 시간 '+th+'초 후 정답과 해설을 자동 낭독합니다.');
          startTH(()=>manualAutoReveal());
        } else {
          normalFullAuto=false;
          quizTtsClearTrack();
          setSt('');
        }
      });
    });
  }
}
function manualAutoReveal(){
  if(driveOn || answered || !Qs.length) return;
  answered=true;
  const q=Qs[cur], L=NL[ns];
  document.querySelectorAll('.opt').forEach((b,i)=>{b.disabled=true;if(i===q.ans)b.classList.add('ar');});
  const ex=document.getElementById('exBox');
  ex.textContent='⏰ 정답: '+ansNo(q)+'. '+q.opts[q.ans]+'\n\n💡 해설: '+q.ex;
  ex.className='ex-box ar show';
  const isLast=cur>=Qs.length-1;
  document.getElementById('nxBtn').style.display=isLast?'none':'block';
  const ds=document.querySelectorAll('.dot');
  if(ds[cur]){ds[cur].classList.remove('active');ds[cur].classList.add('sk');}
  setSt('🔊 정답 및 해설 낭독 중...');
  spkAns(L,q,()=>{
    safeExplainDone(q);
  });
}

/* ── 생각 타이머 ── */
function startTH(cb){
  const w=document.getElementById('thinkWrap'),n=document.getElementById('thinkN'),f=document.getElementById('thinkFill');
  w.classList.add('show'); let r=th; n.textContent=r; n.classList.remove('urg'); f.classList.remove('urg');
  f.style.transition='none'; f.style.width='100%';
  setTimeout(()=>{f.style.transition='width '+th+'s linear'; f.style.width='0%';},50);
  thTimer=setInterval(()=>{
    if(paused) return;
    r--; n.textContent=r;
    if(r<=2){n.classList.add('urg');f.classList.add('urg');}
    if(r<=0){clearInterval(thTimer);thTimer=null;w.classList.remove('show');if(cb)cb();}
  },1000);
}
function stopTH(){
  if(thTimer){clearInterval(thTimer);thTimer=null;}
  document.getElementById('thinkWrap').classList.remove('show');
}

/* ── 자동 재생 (이동모드) ── */
function resetAuto(){cur=0;answered=false;buildDots();renderQ();autoPlay();}
function autoPlay(){
  if(!driveOn||paused||!Qs.length) return;
  const q=Qs[cur], L=NL[ns];
  setSt('🔊 문제 읽는 중...');
  quizTtsFocus(document.querySelector('#screenQuiz .q-card') || document.getElementById('qText'),'문제 읽는 중');
  spkQ('문제 '+(cur+1)+'번. '+q.q,()=>{
    if(!driveOn) return;
    setSt('🔊 보기 읽는 중...');
    spkOpts(q.opts,L,()=>{
      if(!driveOn) return;
      setSt('💭 생각 중...');
      startTH(()=>{if(!driveOn) return; autoReveal();});
    });
  });
}
function autoReveal(){
  if(!driveOn) return;
  answered=true;
  const q=Qs[cur], L=NL[ns];
  document.querySelectorAll('.opt').forEach((b,i)=>{b.disabled=true;if(i===q.ans)b.classList.add('ar');});
  const ex=document.getElementById('exBox');
  ex.textContent='⏰ 정답: '+ansNo(q)+'. '+q.opts[q.ans]+'\n\n💡 해설: '+q.ex;
  ex.className='ex-box ar show';
  const ds=document.querySelectorAll('.dot');
  if(ds[cur]){ds[cur].classList.remove('active');ds[cur].classList.add('sk');}
  setSt('🔊 정답 및 해설 낭독 중...');
  spkAns(L,q,()=>{
    if(!driveOn) return;
    if(cur<Qs.length-1){
      setSt('다음 문제로 이동합니다...');
      nxTimer=setTimeout(()=>{cur++;answered=false;renderQ();buildDots();autoPlay();},1800);
    } else {
      setSt('🎉 이 단계 완료! 수고하셨습니다.');
      spkQ('이 단계의 모든 문제가 완료되었습니다. 수고하셨습니다.',()=>{});
    }
  });
}

/* ── 수동 답변 ── */
function answer(idx){
  if(answered||driveOn) return;
  answered=true;
  const q=Qs[cur], L=NL[ns];
  document.querySelectorAll('.opt').forEach((b,i)=>{
    b.disabled=true;
    if(i===q.ans) b.classList.add('ok');
    else if(i===idx) b.classList.add('ng');
  });
  const isOk=idx===q.ans;
  recordAnswer(isOk, q);
  const ex=document.getElementById('exBox');
  ex.textContent=(isOk?'✅ 정답!\n\n':'❌ 오답\n\n')+'정답: '+ansNo(q)+'. '+q.opts[q.ans]+'\n\n💡 해설: '+q.ex;
  ex.className='ex-box show';
  const isLast=cur>=Qs.length-1;
  document.getElementById('nxBtn').style.display=isLast?'none':'block';
  const ds=document.querySelectorAll('.dot');
  if(ds[cur]){ds[cur].classList.remove('active');ds[cur].classList.add(isOk?'ok':'ng');}
  if(document.getElementById('autoEx').checked){
    spkAns(L,q,()=>{
      if(isLast){setTimeout(()=>showResult(),1000);}
      else if(document.getElementById('autoNx').checked)
        nxTimer=setTimeout(()=>nextQ(),1500);
    });
  }
}
function nextQ(){
  cur++;
  if(cur>=Qs.length){showResult();return;}
  answered=false; renderQ(); buildDots();
}

/* ── 문제 렌더링 ── */
function renderQ(){
  tStop(); answered=false;
  document.getElementById('nxBtn').style.display='none';
  document.getElementById('exBox').className='ex-box';
  setSt('');
  if(!Qs.length){
    document.getElementById('qNum').textContent='문제 없음';
    document.getElementById('qCat').textContent='-';
    document.getElementById('qText').textContent='이 단계에 문제가 없습니다. 나중에 추가될 예정입니다.';
    document.getElementById('opts').innerHTML='';
    return;
  }
  const q=Qs[cur];
  document.getElementById('qNum').textContent='문제 '+(cur+1)+' / '+Qs.length;
  document.getElementById('qCat').textContent=q.cat;
  document.getElementById('qText').textContent=q.q;
  const ol=document.getElementById('opts'); ol.innerHTML='';
  ['①','②','③','④'].forEach((c,i)=>{
    const b=document.createElement('button'); b.className='opt';
    b.innerHTML='<span class="oc">'+c+'</span><span>'+q.opts[i]+'</span>';
    b.onclick=()=>answer(i); ol.appendChild(b);
  });
}
function buildDots(){
  const d=document.getElementById('dots'); d.innerHTML='';
  if(!Qs.length) return;
  const max=Math.min(Qs.length,50);
  for(let i=0;i<max;i++){
    const dot=document.createElement('div');
    dot.className='dot'+(i===cur?' active':'');
    d.appendChild(dot);
  }
}

/* ── 초기화 ── */
function init(){
  prepareQuizLevel(curLevel || '배관공학의기초1');
}

/* 음성 로드 - Android는 늦게 로드되므로 여러번 시도 */
function tryLoadV(){
  loadV();
  [300,600,1000,2000,3000].forEach(t=>setTimeout(loadV,t));
}
if(synth.onvoiceschanged!==undefined) synth.onvoiceschanged=loadV;
applyTheoryUserEdits();
initSettingsOnce();
tryLoadV();
setTimeout(updateHomeCounts,200);

/* Service Worker 등록 */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js?v=30.47-landscape-bottom-action-bar')
      .then(()=>console.log('SW 등록 완료'))
      .catch(e=>console.log('SW 등록 실패',e));
  });
}

/* 음성 로드 */
if(synth.onvoiceschanged!==undefined) synth.onvoiceschanged=loadV;
tryLoadV();

/* 홈화면 시작 */
document.querySelectorAll('.screen').forEach(s=>s.classList.remove('show'));
document.getElementById('screenHome').classList.add('show');


/* ── v10 해설 후 자동 다음문제 공통 처리 ── */
let autoNextLock=false;

/* ── v26 일반 전체읽기 완전 자동 + 문제풀이 TTS 위치추적 ── */
let normalFullAuto=false;
function quizFullAutoEnabled(){
  const e=document.getElementById('quizFullAuto');
  return !!(e ? e.checked : (appSettings && appSettings.quizFullAuto));
}
function quizTrackEnabled(){
  const e=document.getElementById('quizTrack');
  return !!(e ? e.checked : (!appSettings || appSettings.quizTrack!==false));
}
function quizTtsClearTrack(){
  document.querySelectorAll('#screenQuiz .quiz-tts-reading').forEach(el=>el.classList.remove('quiz-tts-reading'));
  const st=document.getElementById('quizTrackStatus');
  if(st){st.textContent='';st.classList.remove('on');}
}
function quizTtsFocus(el,label){
  if(!quizTrackEnabled() || !el) return;
  quizTtsClearTrack();
  el.classList.add('quiz-tts-reading');
  const st=document.getElementById('quizTrackStatus');
  if(st){st.textContent=label||'읽는 위치 추적 중';st.classList.add('on');}
  setTimeout(()=>{
    try{el.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});}
    catch(e){try{el.scrollIntoView(true);}catch(_e){}}
  },70);
}
function quizSpeakProblem(q,cb){
  quizTtsFocus(document.querySelector('#screenQuiz .q-card') || document.getElementById('qText'),'문제 읽는 중');
  spkQ('문제. '+q.q,cb);
}
function stopQuizTts(){
  normalFullAuto=false;
  setQuizLogoPlayPauseIcon('play');
  tStop();
  quizTtsClearTrack();
  setSt('정지했습니다.');
}

function scheduleAutoNextAfterExplain(reason){
  if(driveOn) return;
  if(!document.getElementById('autoNx') || !document.getElementById('autoNx').checked){
    normalFullAuto=false;
    setSt('');
    return;
  }
  if(autoNextLock) return;
  autoNextLock=true;
  const isLast=cur>=Qs.length-1;
  if(isLast){
    setSt('마지막 문제입니다.');
    normalFullAuto=false;
    setTimeout(()=>{autoNextLock=false; showResult(); quizTtsClearTrack();},800);
    return;
  }
  setSt(normalFullAuto?'해설 후 다음 문제를 자동으로 읽습니다.':'해설 후 자동 다음 문제로 이동합니다.');
  if(nxTimer){clearTimeout(nxTimer); nxTimer=null;}
  nxTimer=setTimeout(()=>{
    autoNextLock=false;
    if(paused){
      resumeTask=()=>scheduleAutoNextAfterExplain('resume-autonext');
      setQuizPauseButtonPaused();
      setSt('⏸ 자동 다음 문제 이동이 일시정지되었습니다. 이어서재생을 누르세요.');
      return;
    }
    nextQ();
    if(normalFullAuto && !driveOn && cur<Qs.length){
      setTimeout(()=>mRead('all'),650);
    }
  },1200);
}
function safeExplainDone(q){
  scheduleAutoNextAfterExplain('explain-ended');
}

/* ── v9 모바일·데스크탑 진도 백업/복구 ── */
function exportProgress(){
  const data={};
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k && (k.startsWith('pipe_') || k.startsWith('pipeMaster') || k.includes('pipe'))){
      data[k]=localStorage.getItem(k);
    }
  }
  const raw=JSON.stringify({app:'pipe-master-app',ver:'v9',date:new Date().toISOString(),data});
  const code=btoa(unescape(encodeURIComponent(raw)));
  const box=document.getElementById('progressBox');
  if(box){box.value=code; box.select();}
  alert('진도 백업코드를 만들었습니다. 복사해서 다른 기기 설정창에 붙여넣으세요.');
}
function importProgress(){
  const box=document.getElementById('progressBox');
  const code=(box&&box.value||'').trim();
  if(!code){alert('복구할 백업코드를 먼저 붙여넣어 주세요.');return;}
  try{
    const raw=decodeURIComponent(escape(atob(code)));
    const obj=JSON.parse(raw);
    if(!obj || obj.app!=='pipe-master-app' || !obj.data) throw new Error('invalid');
    Object.keys(obj.data).forEach(k=>localStorage.setItem(k,obj.data[k]));
    alert('진도 복구가 완료되었습니다. 화면을 새로고침합니다.');
    location.reload();
  }catch(e){
    alert('백업코드를 읽지 못했습니다. 코드 전체를 다시 복사해 주세요.');
  }
}
