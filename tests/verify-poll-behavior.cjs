const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const repo=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(repo,'index.html'),'utf8');
const a=html.indexOf('/* ── S5 손끝 스테이지:');
const b=html.indexOf('/* ── S6 리컴파일',a);
assert(a>=0&&b>a);
const source=html.slice(a,b);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const results=[];
function setup({url='http://127.0.0.1:8765/?poll=review-session',storageThrows=false,config}={}){
  const els={},requests=[],saved=new Map(),timers=new Map(),attrs=new Map();let timerId=0;
  function el(){return {textContent:'',hidden:false,disabled:false,listeners:{},style:{setProperty(){}},classList:{toggle(){},add(){}},addEventListener(n,f){this.listeners[n]=f},querySelector(sel){return this.children[sel]},setAttribute(k,v){attrs.set(k,v)},children:{}}}
  ['voice','pollstate','polltotal','orbwrap','pollq','qswitch','voiceCoach','opt0','opt1','pollactions','pollretry','polllocal','polltotalLabel','pollqrnote','pollsharelink'].forEach(id=>els[id]=el());
  const options=[el(),el()];options.forEach(o=>{o.children['.opct']=el();o.children['.obar']=el()});
  const buttons=[el(),el()],img=el(),qrBox=el();img.parentNode=qrBox;
  els.voice.querySelector=()=>img;
  const location={href:url,search:new URL(url).search};
  const ctx={document:{hidden:false},REDUCE:true,location,URL,URLSearchParams,encodeURIComponent,Math,JSON,Promise,Error,Object,Array,AbortController,
    $:id=>els[id],$$:(sel,parent)=>sel==='.popt'?options:buttons,
    localStorage:{getItem:k=>{if(storageThrows)throw Error('opaque origin');return saved.has(k)?saved.get(k):null},setItem:(k,v)=>{if(storageThrows)throw Error('opaque origin');saved.set(k,v)}},
    history:{replaceState(a,b,next){location.href=next;location.search=new URL(next).search}},
    setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id),setInterval:()=>1,
    fetch:(url,opts)=>new Promise((resolve,reject)=>requests.push({url,opts,resolve,reject})),
    IR_POLL_CONFIG:config};
  ctx.window=ctx;
  vm.runInNewContext(fs.readFileSync(path.join(repo,'vendor/qrcode.js'),'utf8'),ctx);
  vm.runInNewContext(source,ctx);
  function enter(){els.voice.listeners['scene:in']()}
  function change(i){els.qswitch.listeners.click({target:{closest:()=>({getAttribute:()=>String(i)})}})}
  function vote(i){options[i].listeners.click()}
  function action(id){els[id].listeners.click()}
  function respond(i,rows=[],status=200){requests[i].resolve({ok:status>=200&&status<300,status,json:()=>Promise.resolve(rows)})}
  function expire(){for(const [id,t] of [...timers])if(t.ms===6000){timers.delete(id);t.fn()}}
  return {els,requests,saved,timers,attrs,location,options,img,qrBox,enter,change,vote,action,respond,expire};
}
async function test(name,run){await run();results.push(name)}
(async()=>{
  await test('Local query starts at zero and never calls the network, including with blocked storage',async()=>{
    const x=setup({url:'http://127.0.0.1:8765/?poll=local-session&mode=local',storageThrows:true});x.enter();await tick();
    assert.equal(x.els.polltotal.textContent,'0');assert.equal(x.requests.length,0);
    x.vote(1);x.change(1);assert.equal(x.els.polltotal.textContent,'0');x.vote(0);x.vote(0);assert.equal(x.els.polltotal.textContent,'2');
    x.change(0);assert.equal(x.els.polltotal.textContent,'1');assert.match(x.els.pollstate.textContent,/로컬 체험/);assert.equal(x.requests.length,0);
    assert.equal(new URL(x.attrs.get('data-poll-url')).searchParams.get('mode'),'local');assert.match(x.els.pollqrnote.textContent,/합쳐지지/);
    x.action('pollretry');await tick();assert.equal(x.requests.length,1);assert.equal(x.requests[0].opts.method,undefined);assert.equal(x.els.polltotal.textContent,'0');
    x.respond(0,[]);await tick();assert.equal(x.els.polltotal.textContent,'0');assert.equal(x.requests.filter(r=>r.opts.method==='POST').length,0);
  });
  await test('Switching questions ignores the stale GET response and fetches the new question immediately',async()=>{
    const x=setup();x.enter();await tick();x.change(1);await tick();assert.equal(x.requests.length,2);
    x.respond(0,Array(9).fill({choice:0}));await tick();assert.equal(x.els.polltotal.textContent,'0');
    x.respond(1,[{choice:1},{choice:1}]);await tick();assert.equal(x.els.polltotal.textContent,'2');assert.match(x.els.pollq.textContent,/오늘 이 무대/);
  });
  await test('Pending POST captures its question and storage key without optimistic or cross-question totals',async()=>{
    const x=setup();x.enter();await tick();x.respond(0,[]);await tick();x.vote(1);assert.equal(x.els.polltotal.textContent,'0');await tick();
    x.change(1);await tick();x.respond(2,[{choice:0},{choice:0}]);await tick();x.respond(1,[],201);await tick();
    assert.equal(JSON.parse(x.requests[1].opts.body).poll,'review-session-q1');assert.equal(x.saved.get('sc26v_review-session-q1'),'1');assert.equal(x.saved.has('sc26v_review-session-q2'),false);
    assert.equal(x.els.polltotal.textContent,'2');assert.doesNotMatch(x.els.pollstate.textContent,/살아 있는 웹으로/);
    x.respond(3,[{choice:1}]);await tick();assert.equal(x.els.polltotal.textContent,'2');
  });
  await test('Repeated read failures retain the last confirmed count and expose retry and local actions',async()=>{
    const x=setup();x.enter();await tick();x.respond(0,Array(8).fill({choice:0}));await tick();x.action('pollretry');await tick();x.respond(1,[],503);await tick();
    assert.equal(x.els.polltotal.textContent,'8');assert.equal(x.els.pollactions.hidden,false);assert.match(x.els.pollstate.textContent,/HTTP 503/);
    x.action('pollretry');await tick();x.respond(2,[],503);await tick();assert.equal(x.els.polltotal.textContent,'8');
    x.action('polllocal');assert.equal(x.els.polltotal.textContent,'0');assert.match(x.els.pollstate.textContent,/로컬 체험/);assert.equal(new URL(x.location.href).searchParams.get('mode'),'local');
  });
  await test('HTTP rejection leaves confirmed totals and vote storage unchanged',async()=>{
    const x=setup();x.enter();await tick();x.respond(0,[{choice:0}]);await tick();x.vote(1);await tick();x.respond(1,[],403);await tick();
    assert.equal(x.els.polltotal.textContent,'1');assert.equal(x.saved.size,0);assert.match(x.els.pollstate.textContent,/HTTP 403/);assert.equal(x.els.pollactions.hidden,false);
  });
  await test('Read timeout becomes retryable and cannot apply a late response',async()=>{
    const x=setup();x.enter();await tick();x.expire();await tick();assert.match(x.els.pollstate.textContent,/応答|응답/);assert.equal(x.els.pollretry.disabled,false);
    x.action('pollretry');await tick();x.respond(1,[{choice:1}]);await tick();x.respond(0,Array(9).fill({choice:0}));await tick();assert.equal(x.els.polltotal.textContent,'1');
  });
  await test('POST timeout releases controls and reports uncertainty rather than claiming a saved vote',async()=>{
    const x=setup();x.enter();await tick();x.respond(0,[]);await tick();x.vote(0);await tick();x.action('polllocal');assert.equal(new URL(x.location.href).searchParams.get('mode'),null);
    x.expire();await tick();assert.equal(x.options[0].disabled,false);assert.match(x.els.pollstate.textContent,/전송 결과를 확인하지 못/);assert.equal(x.saved.size,0);
    x.respond(1,[],201);await tick();assert.equal(x.saved.size,0);assert.equal(x.els.polltotal.textContent,'0');
  });
  await test('Configured same-origin proxy URL is honored and QR preserves the actual address and poll',async()=>{
    const x=setup({url:'http://192.168.1.2:8765/index.html?poll=event-2026',config:{url:'http://192.168.1.2:8765/poll-api',key:'test-public-key'}});x.enter();await tick();
    assert.match(x.requests[0].url,/^http:\/\/192\.168\.1\.2:8765\/poll-api\/rest\/v1\/deck_votes/);
    assert.equal(x.attrs.get('data-poll-url'),'http://192.168.1.2:8765/index.html?poll=event-2026#voice');assert.match(x.img.src,/^data:image\/gif;base64,/);
  });
  const report={pass:results.length,fail:0,network:'All requests replaced by deferred in-memory mocks',tests:results};
  console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
