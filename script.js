/* DeckFlip Showcase V2 — 인터랙션 엔진 (씬 재진입 자동 재생 · 다시보기 없음) */
(function(){
'use strict';
var root=document.documentElement;
root.classList.remove('nojs');root.classList.add('js');
var REDUCE=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var MOBILE=window.matchMedia('(max-width: 940px)').matches;
if(!REDUCE)root.classList.add('anim');
function $(id){return document.getElementById(id)}
function $$(s,c){return [].slice.call((c||document).querySelectorAll(s))}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}

/* ── 프리로더: 최소 2.6초는 보여 준다 ── */
var preT0=Date.now();
function killPre(){
  var wait=Math.max(0,2600-(Date.now()-preT0));
  setTimeout(function(){var p=$('preloader');if(p)p.classList.add('done')},wait);
}
window.addEventListener('load',killPre);
setTimeout(function(){var p=$('preloader');if(p)p.classList.add('done')},5200);

/* ── 프로그레스 ── */
var prog=$('progress');
function setProg(){var h=root.scrollHeight-innerHeight;if(prog)prog.style.transform='scaleX('+(h>0?scrollY/h:0)+')'}
addEventListener('scroll',setProg,{passive:true});setProg();

/* ── 씬 엔진: 진입/이탈 이벤트 + 도트 ── */
var scenes=$$('.scene');var curScene=0;
var dots=$('dots');
scenes.forEach(function(sc,i){
  var a=document.createElement('a');a.href='#'+sc.id;
  a.innerHTML='<span class="lb">'+(sc.getAttribute('data-nav')||sc.id)+'</span>';
  a.addEventListener('click',function(e){e.preventDefault();go(i)});
  dots.appendChild(a);
});
var dotEls=$$('a',dots);
function go(i){i=clamp(i,0,scenes.length-1);scenes[i].scrollIntoView({behavior:REDUCE?'auto':'smooth'})}
var sceneIO=new IntersectionObserver(function(ents){
  ents.forEach(function(en){
    if(en.isIntersecting){
      curScene=scenes.indexOf(en.target);
      dotEls.forEach(function(d,k){d.classList.toggle('on',k===curScene)});
      en.target.classList.add('on');
      en.target.dispatchEvent(new CustomEvent('scene:in'));
    }else{
      en.target.classList.remove('on');
      en.target.dispatchEvent(new CustomEvent('scene:out'));
    }
  });
},{threshold:.4});
scenes.forEach(function(s){sceneIO.observe(s)});

/* ── 리빌: 재진입마다 다시 ── */
if(!REDUCE){
  var rio=new IntersectionObserver(function(ents){
    ents.forEach(function(en){en.target.classList.toggle('on',en.isIntersecting)});
  },{threshold:.15,rootMargin:'0px 0px -4% 0px'});
  $$('[data-r]').forEach(function(el){rio.observe(el)});
}else{$$('[data-r]').forEach(function(el){el.classList.add('on')})}

/* ── 키보드 ── */
addEventListener('keydown',function(e){
  if(e.key==='ArrowDown'||e.key==='PageDown'){e.preventDefault();stopPilot();go(curScene+1)}
  if(e.key==='ArrowUp'||e.key==='PageUp'){e.preventDefault();stopPilot();go(curScene-1)}
  if(e.key==='Escape')stopPilot();
});

/* ── 티켓 목차 ── */
$$('.ticket').forEach(function(t){
  t.addEventListener('click',function(){
    var el=$(t.getAttribute('data-goto'));if(el)el.scrollIntoView({behavior:'smooth'});
  });
});

/* ── S1 CSS 카드장 폴백 ── */
(function(){
  var f=$('cardfield');if(!f)return;
  var spots=[[6,16,150],[20,64,110],[36,10,90],[52,70,130],[63,22,170],[76,58,120],[86,12,100],[70,84,90],[12,80,95],[90,42,140]];
  spots.forEach(function(s,i){
    var el=document.createElement('i');
    el.style.left=s[0]+'%';el.style.top=s[1]+'%';el.style.width=s[2]+'px';
    el.style.aspectRatio='16/10';
    el.style.setProperty('--d',(13+i*1.7)+'s');el.style.setProperty('--dl',(-i*2.1)+'s');
    el.style.opacity=String(.35+((i*37)%40)/100);
    f.appendChild(el);
  });
  var c=$('openCoach');
  if(c&&MOBILE)c.style.display='none';
})();

/* ── S3 더 플립 ── */
(function(){
  var card=$('flipcard');if(!card)return;
  var rot=0,vel=0,drag=false,lx=0,raf=null,flips=0,lastMark=0;
  var cnt=$('flipcount'),flash=$('flipflash'),coach=$('flipCoach');
  function apply(){card.style.transform='rotateY('+rot+'deg)'}
  function markFlips(){
    var n=Math.floor(Math.abs(rot)/360);
    if(n>lastMark){flips+=(n-lastMark);lastMark=n;
      if(cnt)cnt.innerHTML='FLIP × <b>'+flips+'</b>';
      if(coach)coach.classList.add('done');
      if(flash&&!REDUCE){flash.style.transition='none';flash.style.opacity='1';
        requestAnimationFrame(function(){flash.style.transition='opacity 1s ease';flash.style.opacity='0'})}
    }
  }
  function loop(){
    if(drag){raf=requestAnimationFrame(loop);return}
    rot+=vel;vel*=0.965;markFlips();
    if(Math.abs(vel)<0.35){
      var target=Math.round(rot/180)*180;
      rot+=(target-rot)*0.12;
      if(Math.abs(target-rot)<0.25){rot=target;apply();raf=null;return}
    }
    apply();raf=requestAnimationFrame(loop);
  }
  function start(){if(!raf)raf=requestAnimationFrame(loop)}
  card.addEventListener('pointerdown',function(e){
    drag=true;lx=e.clientX;vel=0;card.classList.add('grabbing');
    try{card.setPointerCapture(e.pointerId)}catch(_){}
  });
  card.addEventListener('pointermove',function(e){
    if(!drag)return;var dx=e.clientX-lx;lx=e.clientX;
    rot+=dx*0.55;vel=dx*0.55;apply();markFlips();
  });
  function up(){
    if(!drag)return;drag=false;card.classList.remove('grabbing');
    if(Math.abs(vel)<1.2){vel=0;animateBy(180)}else start();
  }
  card.addEventListener('pointerup',up);card.addEventListener('pointercancel',up);
  function animateBy(deg){
    var from=rot,to=Math.round((rot+deg)/180)*180,t0=null,D=REDUCE?1:900;
    function step(ts){if(!t0)t0=ts;var p=clamp((ts-t0)/D,0,1);var e2=1-Math.pow(1-p,3);
      rot=from+(to-from)*e2;apply();markFlips();
      if(p<1)requestAnimationFrame(step)}
    requestAnimationFrame(step);
  }
  card.__auto=function(deg){animateBy(deg)};
  /* 씬 진입 3.5초 뒤에도 안 만졌으면 살짝 예고 플립 */
  var touched=false,teased=false;
  card.addEventListener('pointerdown',function(){touched=true});
  $('flip').addEventListener('scene:in',function(){
    if(teased||REDUCE)return;
    setTimeout(function(){if(!touched&&!teased){teased=true;animateBy(360)}},3500);
  });
  var ck=$('flipClock');
  function tick(){if(!ck)return;var d=new Date();
    ck.textContent=('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)+':'+('0'+d.getSeconds()).slice(-2)}
  tick();setInterval(tick,1000);
  if(MOBILE){var h=$('flipCoachTx');if(h)h.textContent='카드를 톡 눌러 보세요'}
})();

/* ── S4 종이 무대: 카운터 + 무한 자가 수리 루프 ── */
(function(){
  var sc=$('paper');if(!sc)return;
  var num=$('hbNum'),para=$('hbP'),chart=$('hbC'),say=$('hbSay');
  var healTimers=[],visible=false,counted=false;
  function speak(t,okmark){
    if(!say)return;
    say.innerHTML=okmark?t+' <span class="ok">✓</span>':t;
    say.classList.add('on');
  }
  function healOnce(){
    healTimers.forEach(clearTimeout);healTimers=[];
    var S=REDUCE?8:1;
    function at(ms,fn){healTimers.push(setTimeout(fn,ms/S))}
    num.classList.remove('bad');para.classList.remove('bad','fx');chart.classList.remove('bad');
    at(200,function(){speak('검사를 시작할게요')});
    at(1400,function(){para.classList.add('bad');speak('글자가 칸을 넘었네요')});
    at(2900,function(){para.classList.remove('bad');para.classList.add('fx');speak('문장을 다듬어서 고쳤어요',true)});
    at(4300,function(){num.classList.add('bad');speak('숫자 657, 출처가 없어요')});
    at(5700,function(){num.classList.remove('bad');speak('원문 표와 맞춰 붙였어요',true)});
    at(7100,function(){chart.classList.add('bad');speak('세 번째 막대가 안 그려졌어요')});
    at(8500,function(){chart.classList.remove('bad');speak('다시 그렸어요. 무대에 올릴게요',true)});
    at(10200,function(){para.classList.remove('fx');if(visible)healOnce()});
  }
  sc.addEventListener('scene:in',function(){
    visible=true;
    if(!counted||!REDUCE){
      counted=true;
      $$('[data-count]',sc).forEach(function(el){
        var to=parseFloat(el.getAttribute('data-count')),t0=null,D=REDUCE?1:1600;
        function step(ts){if(!t0)t0=ts;var p=clamp((ts-t0)/D,0,1);var e2=1-Math.pow(1-p,3);
          el.textContent=String(Math.round(to*e2));if(p<1)requestAnimationFrame(step)}
        requestAnimationFrame(step);
      });
    }
    healOnce();
  });
  sc.addEventListener('scene:out',function(){visible=false;healTimers.forEach(clearTimeout)});
  sc.__replay=healOnce;
})();

/* ── S5 손끝 스테이지: 실시간 투표 + 무대 반응 + 재투표 + 질문 전환 ── */
(function(){
  var sc=$('voice');if(!sc)return;
  var URL_='https://dznpjphtscaatztugvks.supabase.co';
  var KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6bnBqcGh0c2NhYXR6dHVndmtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3Nzc1NDAsImV4cCI6MjA5OTM1MzU0MH0.5J6fR_1YH3H9oBIs2FYfmgcS_kCjYpPM4fdsVDvN5Sw';
  var BASE='showcase2026';
  try{var q=new URLSearchParams(location.search).get('poll');
    if(q){q=q.replace(/[^\w-]/g,'').slice(0,40);if(q)BASE=q}}catch(_){}
  var QS=[
    {id:BASE+'-q1',q:'다음 발표자료, 어떤 모습이면 좋겠어요?',a:'지금처럼 파일로',b:'살아 있는 웹으로'},
    {id:BASE+'-q2',q:'오늘 이 무대, 어땠어요?',a:'신기한 구경이었어요',b:'당장 써 보고 싶어요'}
  ];
  var qi=0,counts=[0,0],live=null,visible=false,total0=-1,busy=false,iv=null;
  var opts=$$('.popt',sc),state=$('pollstate'),totalEl=$('polltotal'),orbwrap=$('orbwrap');
  var pollq=$('pollq'),qsw=$('qswitch'),coach=$('voiceCoach');
  function H(){return {apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'}}
  function pid(){return QS[qi].id}
  function myKey(){return 'sc26v_'+pid()}
  function render(){
    var t=counts[0]+counts[1];
    var mine=null;try{mine=localStorage.getItem(myKey())}catch(_){}
    opts.forEach(function(o,i){
      var pct=t?Math.round(counts[i]/t*100):0;
      o.querySelector('.opct').textContent=pct+'%';
      o.querySelector('.obar').style.width=pct+'%';
      o.classList.toggle('sel',mine===String(i));
    });
    if(totalEl)totalEl.textContent=String(t);
    /* 무대 반응: 비율이 배경 기울기·색을 바꾼다 */
    var a=t?counts[0]/t:0,b=t?counts[1]/t:0;
    sc.style.setProperty('--vA',a.toFixed(3));
    sc.style.setProperty('--vB',b.toFixed(3));
  }
  function orbs(n,choice){
    if(REDUCE||!orbwrap)return;
    n=Math.min(n,6);
    var box=orbwrap.getBoundingClientRect();
    var target=opts[choice]?opts[choice].getBoundingClientRect():null;
    for(var i=0;i<n;i++)(function(i){
      var o=document.createElement('span');o.className='orb';
      var x0=8+Math.random()*84;
      o.style.left=x0+'%';o.style.top='-14px';
      orbwrap.appendChild(o);
      var ty=target?(target.top-box.top+target.height*0.5):box.height*0.6;
      var tx=target?((target.left-box.left+24+Math.random()*(target.width*0.55))-(box.width*x0/100)):0;
      setTimeout(function(){
        o.style.transition='transform '+(0.9+i*0.12)+'s cubic-bezier(.35,.05,.4,1),opacity .4s ease '+(0.6+i*0.12)+'s';
        o.style.transform='translate('+tx+'px,'+(ty+14)+'px) scale(.5)';o.style.opacity='0';
        setTimeout(function(){o.remove()},1900+i*140);
      },40+i*130);
    })(i);
  }
  function fetchCounts(){
    if(busy)return;busy=true;
    var ctl=('AbortController' in window)?new AbortController():null;
    var to=setTimeout(function(){if(ctl)ctl.abort()},4500);
    fetch(URL_+'/rest/v1/deck_votes?select=choice&poll=eq.'+pid()+'&limit=4000',
      {headers:H(),signal:ctl?ctl.signal:undefined})
    .then(function(r){if(!r.ok)throw 0;return r.json()})
    .then(function(rows){
      clearTimeout(to);busy=false;
      if(live!==true){live=true;if(state)state.textContent='실시간으로 함께 움직이고 있어요'}
      var c=[0,0];rows.forEach(function(r){if(r.choice===0)c[0]++;else if(r.choice===1)c[1]++});
      var t=c[0]+c[1];
      if(total0>=0&&t>total0){var d=t-total0;var ch=(c[1]-counts[1])>=(c[0]-counts[0])?1:0;orbs(d,ch)}
      total0=t;counts=c;render();
    })
    .catch(function(){
      clearTimeout(to);busy=false;
      if(live===null){live=false;counts=[4,11];total0=15;render();
        if(state)state.textContent='지금은 미리 보기 집계예요'}
    });
  }
  function setQ(i){
    qi=i;counts=[0,0];total0=-1;
    $$('button',qsw).forEach(function(b,k){b.classList.toggle('on',k===i)});
    if(pollq)pollq.textContent=QS[i].q;
    $('opt0').textContent=QS[i].a;$('opt1').textContent=QS[i].b;
    render();fetchCounts();
  }
  qsw.addEventListener('click',function(e){
    var b=e.target.closest('button');if(b)setQ(parseInt(b.getAttribute('data-q'),10));
  });
  opts.forEach(function(o,i){
    o.addEventListener('click',function(){
      var prev=null;try{prev=localStorage.getItem(myKey())}catch(_){}
      try{localStorage.setItem(myKey(),String(i))}catch(_){}
      counts[i]++;
      total0=counts[0]+counts[1];render();orbs(2,i);
      if(coach)coach.classList.add('done');
      if(live)fetch(URL_+'/rest/v1/deck_votes',{method:'POST',headers:H(),
        body:JSON.stringify({poll:pid(),choice:i})}).catch(function(){});
      var name=i===0?QS[qi].a:QS[qi].b;
      var msg;
      if(prev===null)msg='"'+name+'" 쪽이시군요. 한 표, 무대에 올렸어요';
      else if(prev===String(i))msg='"'+name+'"에 한 표 더! 바로 얹었어요';
      else msg='"'+name+'" 쪽으로 마음이 바뀌셨군요. 반영했어요';
      if(state)state.textContent=msg;
    });
  });
  sc.addEventListener('scene:in',function(){visible=true;fetchCounts();
    if(!iv)iv=setInterval(function(){if(visible&&!document.hidden)fetchCounts()},4000)});
  sc.addEventListener('scene:out',function(){visible=false});
})();

/* ── S6 리컴파일 ── */
(function(){
  var seg=$('rtSeg'),stage=$('rtStage'),gf=$('gfill'),tm=$('rtTime'),tl=$('rtTlb');
  if(!seg)return;var C=326.7;
  function mode(m){
    $$('button',seg).forEach(function(b){b.classList.toggle('on',b.getAttribute('data-mode')===m)});
    if(m==='hall'){stage.classList.add('hall');
      if(gf)gf.style.strokeDashoffset=String(C*(1-90/420));
      if(tm)tm.innerHTML='<b>1</b>:30';if(tl)tl.textContent='핵심 네 장면만';
    }else{stage.classList.remove('hall');
      if(gf)gf.style.strokeDashoffset='0';
      if(tm)tm.innerHTML='<b>7</b>:00';if(tl)tl.textContent='아홉 장면 전부';}
  }
  seg.addEventListener('click',function(e){
    var b=e.target.closest('button');if(b)mode(b.getAttribute('data-mode'));
  });
  $('recompile').__mode=mode;
})();

/* ── S7 깊이 다이얼 ── */
(function(){
  var seg=$('dpSeg'),wrap=$('dpWrap');if(!seg)return;
  function dial(d){
    $$('button',seg).forEach(function(b){b.classList.toggle('on',b.getAttribute('data-d')===d)});
    wrap.classList.toggle('deep',d==='deep');
  }
  seg.addEventListener('click',function(e){
    var b=e.target.closest('button');if(b)dial(b.getAttribute('data-d'));
  });
  $('depth').__dial=dial;
  var chip=$('provchip'),pop=$('provpop');
  if(chip&&pop){
    chip.addEventListener('click',function(e){
      e.stopPropagation();
      var r=chip.getBoundingClientRect(),w=wrap.getBoundingClientRect();
      pop.style.left=clamp(r.left-w.left,10,Math.max(10,w.width-400))+'px';
      pop.style.top=(r.bottom-w.top+12)+'px';
      pop.classList.toggle('on');
    });
    document.addEventListener('click',function(e){
      if(!pop.contains(e.target)&&e.target!==chip)pop.classList.remove('on');
    });
  }
})();

/* ── S8 변신: 무대 배경까지 통째로 ── */
(function(){
  var sc=$('morph'),step=$('mstep'),stage=$('mstage'),lb=$('mlabel');if(!step)return;
  var names=['발표','랜딩페이지','제안서','전시'];
  var BODY=[
    {chip:'DECKFLIP · 본선 무대',title:'생각이 발표가 되는<br>가장 빠른 길.',line:'오늘 보여드릴 세 가지: 문제, 제품, 그리고 팀.',cta:'발표 시작하기'},
    {chip:'베타 모집 중',title:'발표자료, 이제<br>만들지 마세요.',line:'이메일만 남겨 주시면 순서대로 초대할게요.',cta:'베타 신청하기'},
    {chip:'제안서 · v1',title:'DeckFlip 도입 제안',line:'발표 준비 4시간을 10분으로 줄이는 방법을 담았어요.',cta:'전체 문서 받기'},
    {chip:'GRAVITY 2026 · 부스 D-07',title:'무중력의<br>아이디어',line:'지나가다 눌러 보세요. 3분이면 충분해요.',cta:'데모 체험하기'}
  ];
  var btns=$$('button',step);var cur=0,iv=null,hold=0;
  function set(i){
    cur=i;stage.setAttribute('data-m',String(i));
    sc.setAttribute('data-bg',String(i));
    btns.forEach(function(b,k){b.classList.toggle('on',k===i)});
    if(lb)lb.textContent='Stage · '+names[i];
    var d=BODY[i];
    $('moChip').textContent=d.chip;$('moTitle').innerHTML=d.title;
    $('moLine').textContent=d.line;$('moCta').textContent=d.cta;
  }
  btns.forEach(function(b,i){b.addEventListener('click',function(){set(i);hold=Date.now()+9000})});
  sc.addEventListener('scene:in',function(){
    if(iv||REDUCE)return;
    iv=setInterval(function(){if(Date.now()>hold&&!document.hidden)set((cur+1)%4)},3400);
  });
  sc.addEventListener('scene:out',function(){if(iv){clearInterval(iv);iv=null}set(0)});
  sc.__set=set;
})();

/* ── 피날레: 중력의 우주 (수렴→재배치→공전) ── */
(function(){
  var sc=$('finale'),pf=$('planetfield');if(!sc)return;
  var seeded=false,timers=[];
  var COLORS=['rgba(120,160,255,.6)','rgba(198,242,82,.55)','rgba(79,227,217,.55)','rgba(255,150,180,.5)',
    'rgba(180,140,255,.55)','rgba(255,200,120,.5)','rgba(120,160,255,.6)','rgba(140,220,255,.55)',
    'rgba(198,242,82,.5)','rgba(180,140,255,.5)','rgba(255,150,180,.45)','rgba(140,220,255,.5)'];
  function seed(){
    if(seeded)return;seeded=true;
    var spots=[[7,16],[22,74],[15,42],[36,10],[45,84],[58,18],[71,66],[84,28],[91,76],[65,40],[29,28],[80,8]];
    spots.forEach(function(p,i){
      var el=document.createElement('i');
      el.style.setProperty('--x',p[0]+'%');el.style.setProperty('--y',p[1]+'%');
      el.style.setProperty('--w',(26+(i*17)%44)+'px');
      el.style.setProperty('--pc',COLORS[i%COLORS.length]);
      el.style.transitionDelay=(i*0.12)+'s';
      pf.appendChild(el);
    });
  }
  function run(){
    timers.forEach(clearTimeout);timers=[];
    seed();
    sc.setAttribute('data-ph','0');
    requestAnimationFrame(function(){requestAnimationFrame(function(){
      timers.push(setTimeout(function(){sc.setAttribute('data-ph','1')},900));
      timers.push(setTimeout(function(){sc.setAttribute('data-ph','2')},6200));
      timers.push(setTimeout(function(){sc.setAttribute('data-ph','3')},7900));
    })});
  }
  sc.addEventListener('scene:in',run);
  sc.addEventListener('scene:out',function(){timers.forEach(clearTimeout)});
  sc.__pull=run;
})();

/* ── 종이가 되는 순간: 도장 ── */
(function(){
  var sc=$('freeze');if(!sc)return;
  var stage=$('fzStage'),kill=$('fzKill'),rev=$('fzRevive'),cnt=$('fzCount'),ck=$('fzClock');
  var n=0,frozen=false;
  function tick(){if(!ck||frozen)return;var d=new Date();
    ck.textContent=('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)+':'+('0'+d.getSeconds()).slice(-2)}
  tick();setInterval(tick,1000);
  if(cnt)cnt.addEventListener('click',function(){if(frozen)return;n++;cnt.innerHTML='+1 · 지금까지 <b>'+n+'</b>번'});
  if(kill)kill.addEventListener('click',function(){
    frozen=true;stage.classList.add('frozen');
    kill.style.display='none';rev.style.display='inline-flex';
  });
  if(rev)rev.addEventListener('click',function(){
    frozen=false;stage.classList.remove('frozen');
    rev.style.display='none';kill.style.display='inline-flex';tick();
  });
  sc.addEventListener('scene:out',function(){
    if(frozen){frozen=false;stage.classList.remove('frozen');rev.style.display='none';kill.style.display='inline-flex'}
  });
  sc.__stamp=function(){if(kill&&!frozen)kill.click()};
  sc.__revive=function(){if(rev&&frozen)rev.click()};
})();

/* ── 백스테이지: 키 에코 ── */
(function(){
  var echo=$('kbEcho');if(!echo)return;
  var K=echo.querySelector('.ke-key'),D=echo.querySelector('.ke-desc');
  var DESC={'ArrowRight':'다음 무대로 넘어가요','ArrowLeft':'이전 무대로 돌아가요','ArrowDown':'다음 무대로 넘어가요',
    'ArrowUp':'이전 무대로 돌아가요','t':'장면 미리보기를 열어요','T':'장면 미리보기를 열어요',
    'a':'손 놓고 보기를 시작해요','A':'손 놓고 보기를 시작해요','f':'전체 화면으로 바꿔요','F':'전체 화면으로 바꿔요',
    '?':'단축키 안내를 열어요','Escape':'열린 것들을 닫아요','Home':'첫 무대로 가요','End':'마지막 무대로 가요'};
  addEventListener('keydown',function(e){
    if(!K)return;
    var k=e.key===' '?'Space':e.key;
    K.textContent=k.length===1?k.toUpperCase():k.replace('Arrow','');
    D.textContent=DESC[e.key]||(/^[1-9]$/.test(e.key)?e.key+'번 무대로 바로 가요':'이 키는 아직 배역이 없어요');
  });
})();

/* ── 썸네일 패널 + 도움말 + 확장 단축키 ── */
(function(){
  var th=$('thumbs'),list=$('thlist'),help=$('helpov');
  var TCOLOR={open:'#0D1430',setlist:'#1A1030',guide:'#141A2E',flip:'#100D18',paper:'#EFE9DC',
    freeze:'#101526',voice:'#0D1024',recompile:'#0A0F1E',depth:'#12101E',morph:'#0F0D1A',finale:'#030409'};
  scenes.forEach(function(sc,i){
    var b=document.createElement('button');b.className='th-item';
    b.innerHTML='<span class="th-chip" style="--tc:'+(TCOLOR[sc.id]||'#101725')+'"></span>'+
      '<span><span class="th-aa">'+(i+1)+' · Scene</span><br><span class="th-tt">'+(sc.getAttribute('data-nav')||sc.id)+'</span></span>';
    b.addEventListener('click',function(){thClose();go(i)});
    list.appendChild(b);
  });
  var items=$$('.th-item',list);
  setInterval(function(){items.forEach(function(it,i){it.classList.toggle('cur',i===curScene)})},600);
  function thOpen(){th.classList.add('open')}
  function thClose(){th.classList.remove('open')}
  function thToggle(){th.classList.toggle('open')}
  function helpToggle(){help.classList.toggle('on')}
  var tb=$('thumbBtn'),hb=$('helpBtn'),tx=$('thumbsX'),hx=$('helpX');
  if(tb)tb.addEventListener('click',thToggle);
  if(hb)hb.addEventListener('click',helpToggle);
  if(tx)tx.addEventListener('click',thClose);
  if(hx)hx.addEventListener('click',function(){help.classList.remove('on')});
  help.addEventListener('click',function(e){if(e.target===help)help.classList.remove('on')});
  /* 왼쪽 끝 드래그로 열기 */
  var eh=$('edgehot'),ex=0,edrag=false;
  if(eh){
    eh.addEventListener('pointerdown',function(e){edrag=true;ex=e.clientX});
    addEventListener('pointermove',function(e){if(edrag&&e.clientX-ex>36){edrag=false;thOpen()}});
    addEventListener('pointerup',function(){edrag=false});
  }
  addEventListener('keydown',function(e){
    if(e.target&&/input|textarea/i.test(e.target.tagName))return;
    if(e.key==='t'||e.key==='T'){e.preventDefault();thToggle()}
    if(e.key==='?'){e.preventDefault();helpToggle()}
    if(e.key==='a'||e.key==='A'){var pb=$('pilotBtn');if(pb)pb.click()}
    if(e.key==='f'||e.key==='F'){
      if(document.fullscreenElement)document.exitFullscreen();
      else if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen();
    }
    if(e.key==='Home'){e.preventDefault();go(0)}
    if(e.key==='End'){e.preventDefault();go(scenes.length-1)}
    if(/^[1-9]$/.test(e.key)){var k=parseInt(e.key,10)-1;if(k<scenes.length)go(k)}
    if(e.key==='Escape'){thClose();help.classList.remove('on')}
  });
})();

/* ── 오토파일럿: 손 놓고 보기 ── *//* ── 오토파일럿: 손 놓고 보기 ── */
var pilotOn=false,pilotGen=0;
function stopPilot(){
  if(!pilotOn)return;pilotOn=false;pilotGen++;
  var bar=$('pilotbar');if(bar)bar.classList.remove('on');
}
window.stopPilot=stopPilot;
(function(){
  var bar=$('pilotbar'),cap=$('pilotcap');
  var SEQ=[
    {id:'open',dur:7500,cap:'안녕하세요, 팀 덱플립이에요. 지금 보고 계신 이 화면이 저희가 제출한 발표자료예요.'},
    {id:'setlist',dur:6500,cap:'오늘 무대는 이렇게 준비했어요. 막마다 종이는 못 하는 걸 하나씩 보여드릴게요.'},
    {id:'guide',dur:6000,cap:'이 무대는 키보드로도 움직여요. 화살표, 숫자, T, A. 편하신 대로요.'},
    {id:'flip',dur:9000,cap:'덱플립은 카드를 공중에서 돌려 받아내는 손기술이에요. 발표자료도 이렇게 뒤집어 볼게요.',
      fn:function(){var el=$('flipcard');if(el&&el.__auto){el.__auto(360);setTimeout(function(){el.__auto(180)},2200)}}},
    {id:'paper',dur:10500,cap:'숫자가 자라고, 깨진 곳은 알아서 고쳐요. 이 검사는 멈추지 않고 계속 돌아요.'},
    {id:'freeze',dur:9500,cap:'이 무대를 종이로 내보내면 어떻게 될까요? 도장 한 번이면 전부 멈춰요. 그게 PDF예요.',
      fn:function(){var f=$('freeze');if(f&&f.__stamp){setTimeout(function(){f.__stamp()},2400);
        setTimeout(function(){if(f.__revive)f.__revive()},6800)}}},
    {id:'voice',dur:9500,cap:'이 투표는 진짜예요. 옆자리 폰으로 찍어도, 이 화면에서 눌러도 무대가 바로 대답해요.'},
    {id:'recompile',dur:9000,cap:'복도에서 90초밖에 없다면요? 같은 이야기가 자리에 맞게 다시 구성돼요.',
      fn:function(){var r=$('recompile');if(r&&r.__mode){setTimeout(function(){r.__mode('hall')},2400);
        setTimeout(function(){r.__mode('main')},6800)}}},
    {id:'depth',dur:8500,cap:'간단히 듣고 싶은 분께는 결론만, 자세히 보고 싶은 분께는 전부요.',
      fn:function(){var d=$('depth');if(d&&d.__dial){setTimeout(function(){d.__dial('deep')},2400);
        setTimeout(function(){d.__dial('exec')},6800)}}},
    {id:'morph',dur:9500,cap:'발표가 끝나도 이야기는 계속돼요. 랜딩으로, 제안서로, 전시로 옷을 갈아입어요.',
      fn:function(){var m=$('morph');if(m&&m.__set){[1,2,3,0].forEach(function(k,i){
        setTimeout(function(){m.__set(k)},1000+i*2000)})}}},
    {id:'finale',dur:14000,cap:'흩어져 있던 아이디어들이 중력을 만나면, 이렇게 한 자리에 모여요. 다음 발표자료는 만들지 마세요.'}
  ];
  function startPilot(){
    if(pilotOn)return;pilotOn=true;var gen=++pilotGen;
    if(bar)bar.classList.add('on');
    var i=0;
    function next(){
      if(!pilotOn||gen!==pilotGen)return;
      if(i>=SEQ.length){stopPilot();return}
      var s=SEQ[i++];var el=$(s.id);
      if(el)el.scrollIntoView({behavior:'smooth'});
      if(cap){cap.style.opacity='0';
        setTimeout(function(){if(gen!==pilotGen)return;cap.textContent=s.cap;
          cap.style.transition='opacity .6s';cap.style.opacity='1'},650)}
      if(s.fn)setTimeout(function(){if(gen===pilotGen&&pilotOn)s.fn()},900);
      setTimeout(next,s.dur);
    }
    next();
  }
  var b1=$('pilotBtn'),b2=$('pilotBtn2'),st=$('pilotstop');
  if(b1)b1.addEventListener('click',startPilot);
  if(b2)b2.addEventListener('click',startPilot);
  if(st)st.addEventListener('click',stopPilot);
  addEventListener('wheel',function(){if(pilotOn)stopPilot()},{passive:true});
  addEventListener('touchmove',function(){if(pilotOn)stopPilot()},{passive:true});
})();
})();
