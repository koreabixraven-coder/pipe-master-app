
/* ── v30.22 패드 화면 확장 설정 선적용 ── */
(function(){
  try{
    const raw=localStorage.getItem('pipe_master_settings_v17');
    const saved=raw?JSON.parse(raw):{};
    const enabled=(saved.padWideMode!==false);
    document.documentElement.classList.add(enabled?'tablet-wide-on':'tablet-wide-off');
  }catch(e){
    document.documentElement.classList.add('tablet-wide-on');
  }
})();
