/* DeckFlip Showcase V2 — 오프닝 무중력 카드장 (데스크톱 전용, 실패 시 CSS 카드장 유지) */
(function(){
'use strict';
var REDUCE=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var MOBILE=window.matchMedia('(max-width: 940px)').matches;
var canvas=document.getElementById('openCanvas');
var field=document.getElementById('cardfield');
var hero=document.getElementById('open');
if(!canvas||REDUCE||MOBILE){if(canvas)canvas.style.display='none';return}
function webglOK(){
  try{var c=document.createElement('canvas');
    return !!(window.WebGLRenderingContext&&(c.getContext('webgl')||c.getContext('experimental-webgl')))}
  catch(e){return false}
}
if(!webglOK()){canvas.style.display='none';return}

var booted=false,running=true;
function loadThree(cb){
  if(window.THREE)return cb();
  var s=document.createElement('script');
  s.src='https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
  s.onload=cb;
  s.onerror=function(){canvas.style.display='none'};
  document.head.appendChild(s);
}
function makeFace(variant){
  var cv=document.createElement('canvas');cv.width=512;cv.height=320;
  var x=cv.getContext('2d');
  var g=x.createLinearGradient(0,0,512,320);
  g.addColorStop(0,'#0E1830');g.addColorStop(.6,'#0A1324');g.addColorStop(1,'#10203E');
  x.fillStyle=g;x.fillRect(0,0,512,320);
  x.strokeStyle='rgba(156,194,255,.6)';x.lineWidth=3;x.strokeRect(1.5,1.5,509,317);
  x.fillStyle='rgba(156,194,255,.9)';x.fillRect(38,42,150,14);
  x.fillStyle='rgba(200,216,255,.3)';
  if(variant===0){
    x.fillRect(38,86,340,10);x.fillRect(38,112,300,10);x.fillRect(38,138,320,10);
    x.fillStyle='rgba(57,168,255,.8)';
    [46,84,60,110].forEach(function(h,i){x.fillRect(38+i*54,300-h-36,30,h)});
  }else if(variant===1){
    x.strokeStyle='rgba(156,194,255,.75)';x.lineWidth=4;x.beginPath();
    x.moveTo(40,240);x.bezierCurveTo(150,225,240,160,330,130);x.quadraticCurveTo(420,102,472,72);
    x.stroke();
    x.fillStyle='rgba(198,242,82,.95)';x.beginPath();x.arc(472,72,7,0,7);x.fill();
  }else if(variant===2){
    x.beginPath();x.arc(256,190,72,0,7);
    x.strokeStyle='rgba(62,123,255,.85)';x.lineWidth=26;x.stroke();
    x.beginPath();x.arc(256,190,72,-1.57,0.9);
    x.strokeStyle='rgba(198,242,82,.95)';x.stroke();
  }else{
    x.fillRect(38,86,200,10);x.fillRect(38,112,240,10);
    x.fillStyle='rgba(57,168,255,.4)';x.fillRect(300,86,170,150);
    x.strokeStyle='rgba(156,194,255,.65)';x.lineWidth=2;x.strokeRect(300,86,170,150);
  }
  x.fillStyle='rgba(90,102,128,.9)';x.fillRect(38,286,90,7);
  return cv;
}
function boot(){
  if(booted||!window.THREE)return;booted=true;
  var T=window.THREE;
  var renderer;
  try{renderer=new T.WebGLRenderer({canvas:canvas,antialias:true,alpha:true})}
  catch(e){canvas.style.display='none';return}
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
  var W=hero.clientWidth,Hh=hero.clientHeight;
  renderer.setSize(W,Hh,false);
  var scene=new T.Scene();
  scene.fog=new T.FogExp2(0x08080d,0.05);
  var cam=new T.PerspectiveCamera(42,W/Hh,.1,60);
  cam.position.set(0,0,9.2);
  scene.add(new T.AmbientLight(0x36486e,1.05));
  var key=new T.PointLight(0x9cc2ff,1.35,50);key.position.set(5,4,7);scene.add(key);
  var rim=new T.PointLight(0x3e7bff,.95,50);rim.position.set(-6,-3,4);scene.add(rim);
  var warm=new T.PointLight(0xc6f252,.3,40);warm.position.set(2,-5,6);scene.add(warm);
  var group=new T.Group();scene.add(group);
  var mats=[];
  for(var v=0;v<4;v++){
    var tex=new T.CanvasTexture(makeFace(v));tex.anisotropy=4;
    mats.push(new T.MeshStandardMaterial({map:tex,metalness:.3,roughness:.42,
      emissive:0x0b162e,emissiveIntensity:.55,side:T.DoubleSide,transparent:true}));
  }
  var geo=new T.PlaneGeometry(1.6,1.0);
  var cards=[];
  var RINGS=[[3.3,10,1.5],[5.1,14,2.1]];
  RINGS.forEach(function(rg,ri){
    var R=rg[0],N=rg[1],ys=rg[2];
    for(var i=0;i<N;i++){
      var m=new T.Mesh(geo,mats[(i+ri)%4].clone());
      var a=(i/N)*Math.PI*2+ri*.6;
      var y=Math.sin(i*2.7+ri)*ys*.55;
      m.position.set(Math.cos(a)*R,y,Math.sin(a)*R);
      m.lookAt(0,y*.4,0);
      m.rotation.z=(Math.sin(i*7.3)+Math.cos(i*3.1))*.12;
      m.userData={ph:(i*1.7+ri*2.3)%6.28,amp:.14+((i*29)%20)/100,y:y};
      m.material.opacity=ri===0?.98:.8;
      group.add(m);cards.push(m);
    }
  });
  var heroTex=new T.CanvasTexture(makeFace(1));heroTex.anisotropy=4;
  var heroCard=new T.Mesh(new T.PlaneGeometry(2.7,1.69),
    new T.MeshStandardMaterial({map:heroTex,metalness:.34,roughness:.36,
      emissive:0x12234a,emissiveIntensity:.7,side:T.DoubleSide}));
  heroCard.position.set(1.9,.25,1.4);
  group.add(heroCard);
  var dragT=0,dragV=0,down=false,lx=0,tmx=0,tmy=0,mx=0,my=0,touched=false;
  var coach=document.getElementById('openCoach');
  canvas.addEventListener('pointerdown',function(e){down=true;lx=e.clientX;canvas.classList.add('dragging');
    if(!touched){touched=true;if(coach)coach.classList.add('done')}
    try{canvas.setPointerCapture(e.pointerId)}catch(_){}});
  canvas.addEventListener('pointermove',function(e){
    if(down){var dx=e.clientX-lx;lx=e.clientX;dragV=dx*.0042;dragT+=dragV}
    tmx=(e.clientX/innerWidth-.5);tmy=(e.clientY/innerHeight-.5);
  });
  function up(){down=false;canvas.classList.remove('dragging')}
  canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
  var clock=new T.Clock();var visible=true;
  hero.addEventListener('scene:in',function(){visible=true});
  hero.addEventListener('scene:out',function(){visible=false});
  document.addEventListener('visibilitychange',function(){running=!document.hidden});
  function clamp01(v){return Math.max(0,Math.min(1,v))}
  function easeIO(p){return p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2}
  var flipT=-5.7;
  function render(){
    requestAnimationFrame(render);
    if(!running||!visible)return;
    var t=clock.getElapsedTime();
    if(!down){dragV*=.94;dragT+=dragV}
    group.rotation.y=t*.028+dragT;
    mx+=(tmx-mx)*.04;my+=(tmy-my)*.04;
    cam.position.x=mx*.9;cam.position.y=-my*.6;
    cam.lookAt(0,0,0);
    cards.forEach(function(m){
      var u=m.userData;
      m.position.y=u.y+Math.sin(t*.5+u.ph)*u.amp;
    });
    var cyc=(t-flipT)%8;
    var p=clamp01(cyc/2.3);
    heroCard.rotation.x=easeIO(p)*Math.PI*2;
    heroCard.position.y=.25+Math.sin(easeIO(p)*Math.PI)*.5;
    key.position.x=Math.sin(t*.32)*5.4;key.position.z=Math.cos(t*.32)*5.4+2;
    renderer.render(scene,cam);
  }
  render();
  if(field)field.classList.add('off');
  addEventListener('resize',function(){
    var w=hero.clientWidth,h=hero.clientHeight;
    cam.aspect=w/h;cam.updateProjectionMatrix();renderer.setSize(w,h,false);
  });
}
if('IntersectionObserver' in window){
  var io=new IntersectionObserver(function(en){
    en.forEach(function(e){if(e.isIntersecting){loadThree(boot);io.disconnect()}});
  },{rootMargin:'320px'});
  io.observe(hero);
}else loadThree(boot);
})();
