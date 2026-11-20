// Gjurmët e Tempullit — realistic 3D endless runner (three.js)
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const $=id=>document.getElementById(id);
const rnd=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,k)=>a+(b-a)*k;
const pick=(arr,w)=>{let tot=w.reduce((a,b)=>a+b,0),r=Math.random()*tot;for(let i=0;i<arr.length;i++){r-=w[i];if(r<=0)return arr[i];}return arr[0];};
const LANE=1.5,TL=4,NT=20,SPAWNZ=-70,BL=700;
const isTouch=('ontouchstart' in window)||navigator.maxTouchPoints>0;

// ================= renderer, quality =================
const renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance',stencil:false});
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.info.autoReset=false;renderer.domElement.id='c';document.body.prepend(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(60,1,.1,700);
let camZ=6;
const composer=new EffectComposer(renderer);
composer.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new THREE.Vector2(256,256),.55,.45,1.05);composer.addPass(bloom);
composer.addPass(new OutputPass());
const DPR=window.devicePixelRatio||1;
const QL=[
  {name:'E lartë',pr:Math.min(DPR,1.5),sh:true,bloom:true,treeSh:true,soft:true,leaf:1},
  {name:'Mesatare',pr:Math.min(DPR,1.1),sh:true,bloom:false,treeSh:false,soft:false,leaf:0},
  {name:'E ulët',pr:Math.min(DPR,.8),sh:false,bloom:false,treeSh:false,soft:false,leaf:0}];
let qi=isTouch?1:0,qUser=false;
try{const v=localStorage.getItem('gjt_q');if(v!==null){qi=clamp(+v,0,2);qUser=true;}}catch(e){}
let lastW=0,lastH=0,baseFov=60;
function applyQuality(){const q=QL[qi];renderer.setPixelRatio(q.pr);composer.setPixelRatio(q.pr);
  const ty=q.soft?THREE.PCFSoftShadowMap:THREE.PCFShadowMap;
  if(renderer.shadowMap.enabled!==q.sh||renderer.shadowMap.type!==ty){renderer.shadowMap.enabled=q.sh;renderer.shadowMap.type=ty;scene.traverse(o=>{if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.needsUpdate=true);}});}
  bloom.enabled=q.bloom;const el=$('qbtn');if(el)el.textContent='⚙ Grafika: '+q.name;resize(true);}
function resize(force){
  const w=innerWidth,h=innerHeight;if(!force&&w===lastW&&h===lastH)return;lastW=w;lastH=h;const a=w/h;renderer.setSize(w,h);composer.setSize(w,h);
  camera.aspect=a;baseFov=camera.fov=a<.8?66:54;camZ=a<.8?4.9:4.6;camera.updateProjectionMatrix();
}
let rsT=0;addEventListener('resize',()=>{clearTimeout(rsT);rsT=setTimeout(()=>resize(false),200);});
// FPS meter (display only: quality never changes while playing)
let fpsAcc=0,fpsN=0;
function trackFps(dt){fpsAcc+=dt;fpsN++;if(fpsAcc>=1){const el=$('fps');if(el)el.textContent=Math.round(fpsN/fpsAcc)+' fps';fpsAcc=fpsN=0;}}
let benchT=0,benchN=0,benchDone=false;
function benchmark(dt){if(benchDone||qUser)return;benchN++;if(benchN<20)return;benchT+=dt;if(benchT>3){const fps=(benchN-20)/benchT;benchDone=true;if(fps<40&&qi<2){qi++;applyQuality();}}}

// ================= procedural textures =================
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function texFrom(c,srgb=true){const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;}
function ctex(w,h,draw,srgb=true){const c=canvas(w,h);draw(c.getContext('2d'),w,h);return texFrom(c,srgb);}
function rep(t,x,y){const c=t.clone();c.repeat.set(x,y);c.needsUpdate=true;return c;}
function normalFrom(srcCanvas,strength=2){
  const w=srcCanvas.width,h=srcCanvas.height,src=srcCanvas.getContext('2d').getImageData(0,0,w,h).data;
  const H=new Float32Array(w*h);for(let i=0;i<w*h;i++)H[i]=(src[i*4]*.3+src[i*4+1]*.59+src[i*4+2]*.11)/255;
  const c=canvas(w,h),g=c.getContext('2d'),out=g.createImageData(w,h),d=out.data;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const l=H[y*w+(x-1+w)%w],r=H[y*w+(x+1)%w],u=H[((y-1+h)%h)*w+x],dn=H[((y+1)%h)*w+x];
    let nx=(l-r)*strength,ny=(u-dn)*strength,nz=1;const len=Math.hypot(nx,ny,nz);nx/=len;ny/=len;nz/=len;
    const i=(y*w+x)*4;d[i]=(nx*.5+.5)*255;d[i+1]=(ny*.5+.5)*255;d[i+2]=(nz*.5+.5)*255;d[i+3]=255;}
  g.putImageData(out,0,0);return texFrom(c,false);
}
function speck(g,w,h,n,cols,r0,r1,a){for(let i=0;i<n;i++){g.globalAlpha=a*Math.random();g.fillStyle=cols[(Math.random()*cols.length)|0];g.beginPath();g.arc(Math.random()*w,Math.random()*h,r0+Math.random()*(r1-r0),0,7);g.fill();}g.globalAlpha=1;}
function rrp(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
function cobble(g,w,h,opt={}){
  g.fillStyle='#3e352c';g.fillRect(0,0,w,h);
  const rows=8,rh=h/rows;
  for(let r=0;r<rows;r++){let x=-Math.random()*60;
    while(x<w){const sw=rnd(80,150),l=rnd(42,64),hue=rnd(26,40),sat=rnd(6,18);
      for(const off of[0,w,-w]){if(x+off>w||x+sw+off<0)continue;
        const gx=x+off+4,gy=r*rh+4,gw=sw-8,gh=rh-8;
        const gr=g.createLinearGradient(0,gy,0,gy+gh);gr.addColorStop(0,`hsl(${hue},${sat}%,${l+8}%)`);gr.addColorStop(.5,`hsl(${hue},${sat}%,${l}%)`);gr.addColorStop(1,`hsl(${hue},${sat}%,${l-14}%)`);
        g.fillStyle=gr;rrp(g,gx,gy,gw,gh,16);g.fill();}
      x+=sw;}
  }
  speck(g,w,h,5000,['#000','#fff','#4a3a2a','#8a7a66'],.4,2,.22);
  speck(g,w,h,90,['#000'],8,30,.07);
  g.strokeStyle='rgba(0,0,0,.4)';g.lineWidth=1.2;
  for(let i=0;i<18;i++){let x=Math.random()*w,y=Math.random()*h;g.beginPath();g.moveTo(x,y);for(let k=0;k<6;k++){x+=rnd(-14,14);y+=rnd(-14,14);g.lineTo(x,y);}g.stroke();}
  if(opt.moss){g.globalCompositeOperation='source-atop';speck(g,w,h,500,['#35502a','#4a6a2c','#2a4220'],2,9,.45);g.globalCompositeOperation='source-over';}
  if(opt.snow){speck(g,w,h,400,['#eef4fa','#ffffff'],2,10,.6);}
}
function rockDraw(g,w,h){g.fillStyle='#6a655e';g.fillRect(0,0,w,h);speck(g,w,h,1400,['#4e4a44','#857f76','#3c3934','#9a948a','#5a5248'],3,26,.3);speck(g,w,h,4000,['#000','#fff'],.4,1.6,.22);
  g.strokeStyle='rgba(0,0,0,.45)';g.lineWidth=1.6;for(let i=0;i<26;i++){let x=Math.random()*w,y=Math.random()*h;g.beginPath();g.moveTo(x,y);for(let k=0;k<7;k++){x+=rnd(-20,20);y+=rnd(-20,20);g.lineTo(x,y);}g.stroke();}}
function barkDraw(g,w,h){g.fillStyle='#46342a';g.fillRect(0,0,w,h);
  for(let i=0;i<220;i++){g.strokeStyle=Math.random()<.55?'rgba(18,12,8,.6)':'rgba(130,108,86,.35)';g.lineWidth=rnd(1,5);let x=Math.random()*w;g.beginPath();g.moveTo(x,0);for(let y=0;y<=h;y+=12){x+=rnd(-3,3);g.lineTo(x,y);}g.stroke();}
  speck(g,w,h,300,['#4a5a30','#3a4a26'],2,8,.3);}
function snowDraw(g,w,h){g.fillStyle='#e4ebf2';g.fillRect(0,0,w,h);speck(g,w,h,900,['#cbd6e3','#ffffff','#b6c4d6'],3,20,.35);speck(g,w,h,2500,['#fff','#aab8cc'],.5,1.5,.5);}
function leafCluster(g,w,h){
  for(let i=0;i<260;i++){
    const x=rnd(20,w-20),y=rnd(20,h-20),a=rnd(0,Math.PI*2),L=rnd(18,34),W2=L*rnd(.32,.45);
    const hue=rnd(80,118),l=rnd(18,38),s=rnd(35,60);
    g.save();g.translate(x,y);g.rotate(a);
    const gr=g.createLinearGradient(-W2,0,W2,0);gr.addColorStop(0,`hsl(${hue},${s}%,${l-6}%)`);gr.addColorStop(.5,`hsl(${hue},${s}%,${l+10}%)`);gr.addColorStop(1,`hsl(${hue},${s}%,${l-8}%)`);
    g.fillStyle=gr;g.beginPath();g.moveTo(0,-L);g.quadraticCurveTo(W2,-L*.2,0,L*.6);g.quadraticCurveTo(-W2,-L*.2,0,-L);g.fill();
    g.strokeStyle=`hsla(${hue},40%,${l+22}%,.6)`;g.lineWidth=1;g.beginPath();g.moveTo(0,-L*.9);g.lineTo(0,L*.55);g.stroke();
    g.restore();}
}
function fernDraw(g,w,h){g.strokeStyle='#2c4a1e';g.lineWidth=4;g.beginPath();g.moveTo(w/2,h);g.quadraticCurveTo(w/2+8,h*.45,w/2,6);g.stroke();
  for(let y=h-14;y>14;y-=9){const k=y/h,len=10+50*Math.sin(k*Math.PI)*.9;for(const s of[-1,1]){const hue=rnd(85,110);g.fillStyle=`hsl(${hue},45%,${rnd(22,34)}%)`;g.beginPath();g.ellipse(w/2+s*len*.55,y-len*.16,len*.55,4.2,s*-.35,0,7);g.fill();}}}
function grassBlades(g,w,h){for(let i=0;i<70;i++){const x=rnd(8,w-8),bh=rnd(h*.4,h*.98),bend=rnd(-25,25);const hue=rnd(70,105);
  g.strokeStyle=`hsl(${hue},${rnd(30,55)}%,${rnd(20,40)}%)`;g.lineWidth=rnd(2,4);g.beginPath();g.moveTo(x,h);g.quadraticCurveTo(x+bend*.3,h-bh*.6,x+bend,h-bh);g.stroke();}}
function scalesDraw(g,w,h){g.fillStyle='#2f5a2a';g.fillRect(0,0,w,h);for(let y=0;y<h;y+=8)for(let x=(y/8%2)*6;x<w;x+=12){g.fillStyle=Math.random()<.12?'#b9a040':`hsl(${rnd(95,110)},40%,${rnd(18,30)}%)`;g.beginPath();g.ellipse(x,y,5.5,3.8,0,0,7);g.fill();g.strokeStyle='rgba(0,0,0,.35)';g.stroke();}}
function needlesDraw(g,w,h){g.fillStyle='#1d3a2a';g.fillRect(0,0,w,h);for(let i=0;i<3000;i++){const x=Math.random()*w,y=Math.random()*h;g.strokeStyle=`hsl(${rnd(140,160)},${rnd(25,40)}%,${rnd(12,30)}%)`;g.lineWidth=1.2;g.beginPath();g.moveTo(x,y);g.lineTo(x+rnd(-4,4),y+rnd(5,10));g.stroke();}}
const T={};
const texLoader=new THREE.TextureLoader();
function loadTex(url,srgb){return new Promise((res,rej)=>texLoader.load(url,t=>{t.wrapS=t.wrapT=THREE.RepeatWrapping;if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());res(t);},undefined,rej));}
function cv2(w,h,draw){const c=canvas(w,h);draw(c.getContext('2d'),w,h);return c;}
async function buildTextures(){
  const cobM=cv2(512,512,(g,w,h)=>cobble(g,w,h,{moss:true})),cob=cv2(512,512,(g,w,h)=>cobble(g,w,h)),cobS=cv2(512,512,(g,w,h)=>cobble(g,w,h,{snow:true}));
  T.cobM=texFrom(cobM);T.cobMN=normalFrom(cobM,3);T.cob=texFrom(cob);T.cobN=normalFrom(cob,3);T.cobS=texFrom(cobS);T.cobSN=normalFrom(cobS,3);
  const rk=cv2(512,512,rockDraw);T.rock=texFrom(rk);T.rockN=normalFrom(rk,4);
  const bk=cv2(256,512,barkDraw);T.bark=texFrom(bk);T.barkN=normalFrom(bk,5);
  const sn=cv2(512,512,snowDraw);T.snow=texFrom(sn);T.snowN=normalFrom(sn,1.5);
  const sc=cv2(128,128,scalesDraw);T.scales=texFrom(sc);T.scalesN=normalFrom(sc,3);
  const nd=cv2(256,256,needlesDraw);T.needles=texFrom(nd);T.needlesN=normalFrom(nd,3);
  T.leaf=texFrom(cv2(512,512,leafCluster));T.leaf.wrapS=T.leaf.wrapT=THREE.ClampToEdgeWrapping;
  T.fern=texFrom(cv2(128,256,fernDraw));T.fern.wrapS=T.fern.wrapT=THREE.ClampToEdgeWrapping;
  T.blades=texFrom(cv2(256,256,grassBlades));T.blades.wrapS=T.blades.wrapT=THREE.ClampToEdgeWrapping;
  T.endcap=ctex(256,256,(g,w,h)=>{g.fillStyle='#b8885a';g.fillRect(0,0,w,h);g.strokeStyle='rgba(90,50,20,.55)';for(let r=5;r<128;r+=rnd(4,8)){g.lineWidth=rnd(1,2.5);g.beginPath();g.arc(128+rnd(-2,2),128,r,0,7);g.stroke();}g.fillStyle='#4a2c14';g.beginPath();g.arc(128,128,128,0,7);g.arc(128,128,116,0,7,true);g.fill();speck(g,w,h,600,['#000'],.5,1.5,.2);});
  T.glow=ctex(128,128,(g)=>{const r=g.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.25,'rgba(255,255,255,.5)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,128,128);});
  T.soft=ctex(64,64,(g)=>{const r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(255,255,255,.9)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,64,64);});
  T.flame=ctex(64,128,(g)=>{const r=g.createRadialGradient(32,90,2,32,80,60);r.addColorStop(0,'rgba(255,250,200,1)');r.addColorStop(.25,'rgba(255,190,80,.95)');r.addColorStop(.6,'rgba(255,90,20,.5)');r.addColorStop(1,'rgba(255,40,0,0)');g.fillStyle=r;g.beginPath();g.moveTo(32,0);g.quadraticCurveTo(64,70,52,104);g.quadraticCurveTo(32,128,12,104);g.quadraticCurveTo(0,70,32,0);g.fill();});
  T.cloud=ctex(256,128,(g)=>{for(let i=0;i<26;i++){const x=rnd(50,206),y=rnd(50,90),r=rnd(18,44);const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,'rgba(255,255,255,.7)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,256,128);}});
  T.mask=ctex(256,256,(g)=>{g.fillStyle='#8a4e22';g.fillRect(0,0,256,256);for(let i=0;i<120;i++){g.strokeStyle='rgba(50,25,8,.35)';g.lineWidth=1;g.beginPath();const y=Math.random()*256;g.moveTo(0,y);g.bezierCurveTo(80,y+rnd(-8,8),170,y+rnd(-8,8),256,y);g.stroke();}
    g.fillStyle='#e8dcc0';g.fillRect(30,108,196,10);g.fillRect(50,180,156,8);g.fillRect(122,30,12,70);
    g.fillStyle='#a8261f';g.beginPath();g.moveTo(40,150);g.lineTo(80,135);g.lineTo(80,165);g.fill();g.beginPath();g.moveTo(216,150);g.lineTo(176,135);g.lineTo(176,165);g.fill();
    g.fillStyle='#120804';g.beginPath();g.ellipse(88,92,30,20,-.2,0,7);g.ellipse(168,92,30,20,.2,0,7);g.fill();
    g.fillStyle='#7ff5dc';g.beginPath();g.arc(88,94,8,0,7);g.arc(168,94,8,0,7);g.fill();
    g.fillStyle='#120804';rrp(g,86,196,84,34,12);g.fill();g.fillStyle='#e8dcc0';for(let i=0;i<6;i++)g.fillRect(92+i*13,198,8,13);});
  T.maskE=ctex(256,256,(g)=>{g.fillStyle='#000';g.fillRect(0,0,256,256);g.fillStyle='#7ff5dc';g.beginPath();g.arc(88,94,10,0,7);g.arc(168,94,10,0,7);g.fill();});
  const [brick,brickB,brickR,wood,woodB,woodR,grass]=await Promise.all([
    loadTex('assets/tex/brick.jpg',true),loadTex('assets/tex/brick_bump.jpg'),loadTex('assets/tex/brick_roughness.jpg'),
    loadTex('assets/tex/wood.jpg',true),loadTex('assets/tex/wood_bump.jpg'),loadTex('assets/tex/wood_roughness.jpg'),loadTex('assets/tex/grass.jpg',true)]);
  Object.assign(T,{brick,brickB,brickR,wood,woodB,woodR,grass});
}

// ================= geometry helpers =================
function merge(parts){
  const pos=[],nor=[],uv=[],col=[];
  for(const p of parts){
    let g=p.g.index?p.g.toNonIndexed():p.g.clone();if(p.m)g.applyMatrix4(p.m);
    const P=g.attributes.position.array,N=g.attributes.normal.array,U=g.attributes.uv?g.attributes.uv.array:null,c=new THREE.Color(p.c===undefined?0xffffff:p.c);
    const v=p.vary?1+rnd(-p.vary,p.vary):1;
    for(let i=0;i<P.length/3;i++){pos.push(P[i*3],P[i*3+1],P[i*3+2]);
      if(p.nOut){const nx=P[i*3]-p.nOut.x,ny=P[i*3+1]-p.nOut.y,nz=P[i*3+2]-p.nOut.z,l=Math.hypot(nx,ny,nz)||1;nor.push(nx/l,ny/l,nz/l);}else nor.push(N[i*3],N[i*3+1],N[i*3+2]);
      if(U)uv.push(U[i*2],U[i*2+1]);else uv.push(0,0);col.push(c.r*v,c.g*v,c.b*v);}
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  return g;
}
const M4=(x,y,z,rx=0,ry=0,rz=0,sx=1,sy=1,sz=1)=>new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(sx,sy,sz));
function lumpy(r,detail,amt,flat){const g=new THREE.IcosahedronGeometry(r,detail);const p=g.attributes.position,v=new THREE.Vector3();const s=Math.random()*100;
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const n=Math.sin(v.x*3.1/r+s)*Math.cos(v.y*2.7/r+s*.5)*Math.sin(v.z*3.3/r+s*.3)+.4*Math.sin(v.x*7/r+s)*Math.sin(v.z*6/r);v.multiplyScalar(1+n*amt);p.setXYZ(i,v.x,v.y,v.z);}
  if(!flat){g.deleteAttribute('normal');const m=mergeVerts(g);m.computeVertexNormals();return m;}g.computeVertexNormals();return g;}
function mergeVerts(g){ // weld vertices so normals are smooth
  const p=g.attributes.position,uv=g.attributes.uv,map=new Map(),pos=[],uvs=[],idx=[];
  const src=g.index?g.index.array:[...Array(p.count).keys()];
  for(const i of src){const k=Math.round(p.getX(i)*1e4)+','+Math.round(p.getY(i)*1e4)+','+Math.round(p.getZ(i)*1e4);
    let j=map.get(k);if(j===undefined){j=pos.length/3;map.set(k,j);pos.push(p.getX(i),p.getY(i),p.getZ(i));uvs.push(uv?uv.getX(i):0,uv?uv.getY(i):0);}idx.push(j);}
  const o=new THREE.BufferGeometry();o.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));o.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));o.setIndex(idx);return o;}

// ================= materials =================
const MAT={},GEO={};
const std=o=>new THREE.MeshStandardMaterial(o);
function hdrColor(hex,k){return new THREE.Color(hex).multiplyScalar(k);}
function buildMaterials(){
  const P=(map,nrm,rx,ry,o={})=>std(Object.assign({map:rep(map,rx,ry),normalMap:rep(nrm,rx,ry),normalScale:new THREE.Vector2(1.2,1.2),roughness:.92},o));
  MAT.path=[P(T.cobM,T.cobMN,1.5,1,{color:0xd8c8ac}),P(T.cob,T.cobN,1.5,1,{color:0x8a7f74,roughness:.8}),
    std({map:rep(T.wood,1.2,2),bumpMap:rep(T.woodB,1.2,2),bumpScale:3,roughnessMap:rep(T.woodR,1.2,2),color:0x9a7458}),
    P(T.cobS,T.cobSN,1.5,1,{color:0xcfd0d4,roughness:.75})];
  MAT.curb=P(T.cob,T.cobN,.25,1,{color:0x8a7c66});
  MAT.grass=std({map:rep(T.grass,5,.75),color:0xb8c890,roughness:1});
  MAT.snow=std({map:rep(T.snow,7,1),normalMap:rep(T.snowN,7,1),roughness:.75,color:0xffffff});
  MAT.brick=std({map:rep(T.brick,.9,.9),bumpMap:rep(T.brickB,.9,.9),bumpScale:5,roughnessMap:rep(T.brickR,.9,.9),color:0x9a8070});
  MAT.ceil=std({map:rep(T.brick,2,2),bumpMap:rep(T.brickB,2,2),bumpScale:3,color:0x4a3e36});
  MAT.bark=std({map:rep(T.bark,2,3),normalMap:rep(T.barkN,2,3),normalScale:new THREE.Vector2(1.5,1.5),roughness:1});
  MAT.leaf=std({map:T.leaf,alphaTest:.5,side:THREE.DoubleSide,vertexColors:true,roughness:.8});
  MAT.leafDepth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:T.leaf,alphaTest:.5});
  MAT.fern=std({map:T.fern,alphaTest:.45,side:THREE.DoubleSide,roughness:.85,color:0xd8f0c8});
  MAT.blades=std({map:T.blades,alphaTest:.4,side:THREE.DoubleSide,roughness:.9,color:0xc8e0a0});
  MAT.pine=std({map:rep(T.needles,3,2),normalMap:rep(T.needlesN,3,2),roughness:.9,color:0xb0c8b8});
  MAT.stone=std({map:rep(T.rock,1,1.4),normalMap:rep(T.rockN,1,1.4),normalScale:new THREE.Vector2(1.4,1.4),roughness:.95,color:0xc8b898});
  MAT.mossStone=std({map:rep(T.cobM,.7,.9),normalMap:rep(T.cobMN,.7,.9),roughness:.95,color:0xb8aa90});
  MAT.rock=std({map:rep(T.rock,1,1),normalMap:rep(T.rockN,1,1),normalScale:new THREE.Vector2(1.5,1.5),roughness:.95,color:0xa09a92});
  MAT.cliff=std({map:rep(T.rock,6,4),normalMap:rep(T.rockN,6,4),roughness:1,color:0x8a8680});
  MAT.wood=std({map:rep(T.wood,.6,.6),bumpMap:rep(T.woodB,.6,.6),bumpScale:3,roughnessMap:rep(T.woodR,.6,.6),color:0x8a6448});
  MAT.rope=std({color:0xb8945a,roughness:1});
  MAT.red=std({color:0x9a2a24,roughness:.4,metalness:.05});
  MAT.black=std({color:0x1a1514,roughness:.5});
  MAT.metal=std({color:0xa8a8b0,metalness:1,roughness:.3});
  MAT.darkmetal=std({color:0x3a3634,metalness:.8,roughness:.5});
  MAT.gold=std({color:0xffc84a,metalness:1,roughness:.18,emissive:0x2a1800});
  MAT.gem=std({color:0x55d8ff,metalness:.1,roughness:.04,emissive:0x0d5a8a,transparent:true,opacity:.9});
  MAT.idol=std({color:0x8a3dff,metalness:.5,roughness:.25,emissive:0x30087a});
  MAT.golem=std({map:rep(T.rock,2,2),normalMap:rep(T.rockN,2,2),normalScale:new THREE.Vector2(1.5,1.5),roughness:.95,color:0x9aa098});
  MAT.moss=std({color:0x3f5f2a,roughness:1});
  MAT.ember=new THREE.MeshBasicMaterial({color:hdrColor(0xff6a20,4)});
  MAT.teal=new THREE.MeshBasicMaterial({color:hdrColor(0x7ff5dc,4)});
  MAT.yellowE=new THREE.MeshBasicMaterial({color:hdrColor(0xffe03a,3)});
  MAT.snake=std({map:T.scales,normalMap:T.scalesN,roughness:.35,metalness:.05});
  MAT.snakeBelly=std({color:0xd8c47a,roughness:.5});
  MAT.pit=new THREE.MeshBasicMaterial({color:0x020101});
  MAT.voidm=new THREE.MeshBasicMaterial({color:0x22384c});
  MAT.endcap=std({map:T.endcap,roughness:.9});
  MAT.snowcap=std({color:0xf4f8fc,roughness:.7,map:rep(T.snow,1,1),normalMap:rep(T.snowN,1,1)});
  MAT.maskFace=std({map:T.mask,emissiveMap:T.maskE,emissive:hdrColor(0xffffff,3),roughness:.7});
  MAT.maskWood=std({color:0x5a3214,roughness:.8});
  MAT.arrow=new THREE.MeshBasicMaterial({color:hdrColor(0xffd44a,2.2),side:THREE.DoubleSide});
  MAT.gunmetal=std({color:0x2a2c30,metalness:.85,roughness:.35});MAT.gungrip=std({color:0x1a1816,roughness:.8});
  MAT.bullet=new THREE.MeshBasicMaterial({color:hdrColor(0xffc070,4)});GEO.bullet=new THREE.CapsuleGeometry(.03,.35,4,8).rotateX(Math.PI/2);
  MAT.lampE=new THREE.MeshBasicMaterial({color:hdrColor(0xffc070,3)});
  // geometries
  GEO.path=new THREE.PlaneGeometry(5,TL).rotateX(-Math.PI/2);
  GEO.bridge=new THREE.PlaneGeometry(4.6,TL).rotateX(-Math.PI/2);
  GEO.side=new THREE.PlaneGeometry(28,TL).rotateX(-Math.PI/2);
  GEO.curb=new THREE.BoxGeometry(.45,.32,TL);
  GEO.canopy=[0,1,2].map(()=>{const parts=[],q=new THREE.PlaneGeometry(1.7,1.7),c=new THREE.Vector3(0,0,0);
    for(let i=0;i<34;i++){const v=new THREE.Vector3(rnd(-1,1),rnd(-.6,.8),rnd(-1,1)).normalize().multiplyScalar(rnd(.6,1.9));
      parts.push({g:q,m:M4(v.x*1.2,v.y,v.z*1.2,rnd(0,6),rnd(0,6),rnd(0,6),rnd(.8,1.3),rnd(.8,1.3),1),c:new THREE.Color().setHSL(rnd(.22,.3),rnd(.3,.5),rnd(.32,.5)),nOut:c});}
    return merge(parts);});
  GEO.canopyLo=GEO.canopy.map(g=>{const n=g.attributes.position.count,keep=Math.floor(n/6*.5)*6,o=new THREE.BufferGeometry();for(const k of Object.keys(g.attributes)){const a=g.attributes[k];o.setAttribute(k,new THREE.BufferAttribute(a.array.slice(0,keep*a.itemSize),a.itemSize));}return o;});
  GEO.bush=merge(Array.from({length:14},()=>{const v=new THREE.Vector3(rnd(-1,1),rnd(0,1),rnd(-1,1)).normalize().multiplyScalar(rnd(.2,.7));
    return {g:new THREE.PlaneGeometry(1,1),m:M4(v.x,v.y+.45,v.z,rnd(0,6),rnd(0,6),rnd(0,6)),c:new THREE.Color().setHSL(rnd(.22,.3),.45,rnd(.3,.45)),nOut:new THREE.Vector3(0,.3,0)};}));
  GEO.trunk=new THREE.CylinderGeometry(.15,.3,1,10,4);
  GEO.branch=new THREE.CylinderGeometry(.04,.09,1,6);
  GEO.fern=(()=>{const parts=[],pl=new THREE.PlaneGeometry(.55,1.25);pl.translate(0,.62,0);
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2;parts.push({g:pl,m:M4(0,0,0,0,a,0).multiply(M4(0,0,0,-.8,0,0)),c:new THREE.Color().setHSL(.27,.4,rnd(.45,.6))});}return merge(parts);})();
  GEO.tuft=(()=>{const parts=[],pl=new THREE.PlaneGeometry(.7,.6);pl.translate(0,.3,0);for(let i=0;i<3;i++)parts.push({g:pl,m:M4(0,0,0,0,i*Math.PI/3,0),c:0xffffff});return merge(parts);})();
  GEO.pine=[0,1].map(()=>{const parts=[{g:new THREE.CylinderGeometry(.1,.2,1.4,8),m:M4(0,.7,0),c:0x6a5040}];
    for(let i=0;i<5;i++){const r=1.6-i*.3,y=1.0+i*.75;parts.push({g:new THREE.ConeGeometry(r,1.5,12,2,true),m:M4(0,y+.6,0,0,rnd(0,1),0),c:new THREE.Color().setHSL(.4,.25,rnd(.5,.65))});}
    return merge(parts);});
  GEO.pineSnow=merge([0,1,2,3,4].map(i=>{const r=1.6-i*.3,y=1.0+i*.75;return {g:new THREE.ConeGeometry(r*.6,.62,12,1,true),m:M4(0,y+1.07,0),c:0xffffff};}));
  GEO.boulder=[0,1,2].map(()=>lumpy(.9,3,.18));
  GEO.coin=new THREE.CylinderGeometry(.24,.24,.05,32).rotateX(Math.PI/2);
  GEO.gem=new THREE.OctahedronGeometry(.24);
}

// ================= biomes =================
const BI=[
 {name:'Xhungla e Artë',top:0x4a7fc0,bot:0xf0caa0,fog:0xd8c7a4,fn:18,ff:80,sun:0xffd8aa,si:3.2,sd:[.45,.35,-1],hs:0xc8dcff,hg:0x4a5a30,hi:.35,ex:.95,dark:0,dust:0xb8a080,env:.9},
 {name:'Varret e Harruara',top:0x000000,bot:0x080604,fog:0x070504,fn:4,ff:38,sun:0xffb070,si:.02,sd:[0,1,-.2],hs:0x4a3a30,hg:0x100a08,hi:.08,ex:1.25,dark:1,dust:0x6a5a4a,env:.25},
 {name:'Ura mbi Greminë',top:0x3a78c8,bot:0xd4e6f2,fog:0xc4d8e8,fn:25,ff:100,sun:0xfff4e4,si:3.4,sd:[.3,.6,-.8],hs:0xd2e6ff,hg:0x5a6e80,hi:.4,ex:.9,dark:0,dust:0x9a7a5a,env:1},
 {name:'Tempulli i Maleve',top:0x3a3068,bot:0xf2b08a,fog:0xd8b0a0,fn:20,ff:85,sun:0xffbc90,si:2.8,sd:[-.5,.22,-1],hs:0xb4acdf,hg:0xdde4ee,hi:.35,ex:.95,dark:.2,dust:0xe8eef4,env:.9}
];
const biAt=d=>Math.floor(Math.max(0,d)/BL)%4;

// ================= sky / lights =================
const skyU={top:{value:new THREE.Color()},bot:{value:new THREE.Color()},sunDir:{value:new THREE.Vector3(0,.3,-1)},sunCol:{value:new THREE.Color()},sunAmt:{value:1}};
const skyMat=new THREE.ShaderMaterial({uniforms:skyU,side:THREE.BackSide,depthWrite:false,fog:false,
  vertexShader:`varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform vec3 top,bot,sunCol;uniform vec3 sunDir;uniform float sunAmt;varying vec3 vP;
  float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n2(p);p*=2.03;a*=.5;}return v;}
  void main(){vec3 d=normalize(vP);float h=clamp(d.y*1.8,0.,1.);vec3 c=mix(bot,top,pow(h,.55));
  float s=max(dot(d,normalize(sunDir)),0.);
  if(d.y>0.){vec2 uv=d.xz/(d.y+.12)*1.4;float cl=smoothstep(.5,.85,fbm(uv+vec2(3.,1.)));c=mix(c,mix(bot*1.05,vec3(1.),.55)+sunCol*pow(s,4.)*.3,cl*.55*sunAmt*smoothstep(0.,.25,d.y));}
  c+=sunCol*sunAmt*(smoothstep(.9988,.9993,s)*8.+pow(s,12.)*.4+pow(s,90.)*.8);gl_FragColor=vec4(c,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  }`});
const sky=new THREE.Mesh(new THREE.SphereGeometry(500,32,16),skyMat);sky.renderOrder=-1;scene.add(sky);
const hemi=new THREE.HemisphereLight(0xffffff,0x444444,.4);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffffff,3);sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-11,right:11,top:13,bottom:-9,near:1,far:90});sun.shadow.bias=-.0005;sun.shadow.normalBias=.035;
scene.add(sun);scene.add(sun.target);
const plLight=new THREE.PointLight(0xffd8a8,0,9,2);scene.add(plLight);
const lampLights=[0,1,2].map(()=>{const l=new THREE.PointLight(0xff8a3a,0,13,2);scene.add(l);return l;});
scene.fog=new THREE.Fog(0xffffff,20,80);
const envMaps=[];
async function buildEnv(onProg){
  const pm=new THREE.PMREMGenerator(renderer),rl=new RGBELoader();
  for(const n of['jungle','tomb','bridge','mountain']){const t=await rl.loadAsync(`assets/hdri/${n}.hdr`);envMaps.push(pm.fromEquirectangular(t).texture);t.dispose();onProg();}
  pm.dispose();
}

// ================= backdrops (distant scenery) =================
const backdrops=[];
function hazeMat(c){const col=new THREE.Color(c);return new THREE.MeshLambertMaterial({color:col,emissive:col.clone().multiplyScalar(.55),fog:false});}
function mountain(r,h,c){const g=new THREE.ConeGeometry(r,h,40,12);const p=g.attributes.position,v=new THREE.Vector3(),s=Math.random()*10;
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const k=(v.y+h/2)/h;const n=Math.sin(Math.atan2(v.z,v.x)*5+s)*.12+Math.sin(Math.atan2(v.z,v.x)*13+s*2)*.05+Math.sin(v.y*.2+s)*.05;
    v.x*=1+n;v.z*=1+n;v.y+=Math.sin(v.x*.15+s)*h*.03*(1-k);p.setXYZ(i,v.x,v.y,v.z);}g.computeVertexNormals();return new THREE.Mesh(g,hazeMat(c));}
function buildBackdrops(){
  let g=new THREE.Group();
  for(let i=0;i<12;i++){const h=rnd(40,90),m=mountain(rnd(40,70),h,i%2?0x8aa49a:0x98b0a6);m.position.set(rnd(-280,280),h/2-10,rnd(-360,-280));g.add(m);}
  for(let i=0;i<70;i++){const m=new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(7,14),2),hazeMat(new THREE.Color().setHSL(.28,.25,rnd(.42,.52))));m.position.set(rnd(-260,260),rnd(-2,6),rnd(-220,-150));m.scale.y=rnd(.8,1.3);g.add(m);}
  const pyr=new THREE.Group();for(let i=0;i<7;i++){const w=44-i*6,m=new THREE.Mesh(new THREE.BoxGeometry(w,5,w),hazeMat(0xa8987e));m.position.y=i*5+2.5;pyr.add(m);}
  pyr.position.set(-70,-4,-250);g.add(pyr);
  backdrops.push(g);backdrops.push(new THREE.Group());
  g=new THREE.Group();
  for(let s of[-1,1])for(let i=0;i<7;i++){const h=rnd(70,140),m=mountain(rnd(18,30),h,s<0?0x8c9cab:0x9aa8b6);m.position.set(s*rnd(45,150),-h*.35,-50-i*45+rnd(-10,10));g.add(m);}
  for(let i=0;i<10;i++){const h=rnd(60,120),m=mountain(rnd(40,70),h,0xa8bccc);m.position.set(rnd(-300,300),h/2-30,rnd(-380,-300));g.add(m);}
  backdrops.push(g);
  g=new THREE.Group();
  for(let i=0;i<12;i++){const h=rnd(70,140),r=rnd(40,70),m=mountain(r,h,0x7e6e96);m.position.set(rnd(-300,300),h/2-10,rnd(-360,-280));g.add(m);
    const sc=mountain(r*.36,h*.36,0xf4eef6);sc.position.set(m.position.x,m.position.y+h*.32,m.position.z);g.add(sc);}
  backdrops.push(g);
  const L=new THREE.Vector3(.4,.6,.5).normalize();
  for(let i=0;i<backdrops.length;i++){const g=backdrops[i];g.updateMatrixWorld(true);const geos=[];
    g.traverse(o=>{if(!o.isMesh)return;let ge=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();ge.applyMatrix4(o.matrixWorld);
      const n=ge.attributes.normal,c=o.material.color,col=new Float32Array(n.count*3);
      for(let j=0;j<n.count;j++){const k=.72+.38*Math.max(0,n.getX(j)*L.x+n.getY(j)*L.y+n.getZ(j)*L.z);col[j*3]=c.r*k;col[j*3+1]=c.g*k;col[j*3+2]=c.b*k;}
      ge.setAttribute('color',new THREE.BufferAttribute(col,3));for(const a of Object.keys(ge.attributes))if(!['position','normal','color'].includes(a))ge.deleteAttribute(a);geos.push(ge);});
    const ng=new THREE.Group();if(geos.length){ng.add(new THREE.Mesh(mergeGeometries(geos,false),new THREE.MeshBasicMaterial({vertexColors:true,fog:false})));}
    backdrops[i]=ng;}
  for(const b of backdrops){b.visible=false;scene.add(b);}
}

// ================= Shukli: commando (Mixamo soldier, native mocap) =================
const ARA={};const gltfLoader=new GLTFLoader();
const _q=new THREE.Quaternion(),_q2=new THREE.Quaternion(),_v=new THREE.Vector3(),_v2=new THREE.Vector3();
const AX=new THREE.Vector3(1,0,0),AY=new THREE.Vector3(0,1,0),AZ=new THREE.Vector3(0,0,1);
function cleanClip(c){const k=c.clone();k.tracks=k.tracks.filter(t=>!t.name.endsWith('.scale')&&!(t.name.endsWith('.position')&&t.name!=='mixamorigHips.position'));
  for(const t of k.tracks)if(t.name==='mixamorigHips.position'){const v=t.values,x0=v[0],z0=v[2];for(let i=0;i<v.length;i+=3){v[i]=x0;v[i+2]=z0;}}return k;}
function makePistol(){const g=new THREE.Group(),m=MAT.gunmetal;
  const slide=new THREE.Mesh(new THREE.BoxGeometry(.034,.042,.2),m);slide.position.set(0,.02,-.06);g.add(slide);
  const grip=new THREE.Mesh(new THREE.BoxGeometry(.03,.11,.05),MAT.gungrip);grip.position.set(0,-.04,.02);grip.rotation.x=-.25;g.add(grip);
  const bar=new THREE.Mesh(new THREE.CylinderGeometry(.009,.009,.05,8),m);bar.rotation.x=Math.PI/2;bar.position.set(0,.022,-.18);g.add(bar);
  const fl=new THREE.Sprite(new THREE.SpriteMaterial({map:T.glow,color:hdrColor(0xffb050,4),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));fl.position.set(0,.022,-.24);fl.scale.setScalar(.01);g.add(fl);
  g.traverse(o=>{if(o.isMesh)o.castShadow=true;});return {g,flash:fl};}
async function buildAra(onProg){
  const gl=await gltfLoader.loadAsync('assets/models/Shukli.glb');onProg();onProg();
  const model=gl.scene,bones={};
  model.traverse(o=>{if(o.isBone)bones[o.name]=o;if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;if(o.material){o.material.envMapIntensity=.9;o.material.roughness=Math.max(.55,o.material.roughness??.8);}}});
  const holder=new THREE.Group(),tilt=new THREE.Group(),body=new THREE.Group();holder.add(tilt);tilt.add(body);body.add(model);scene.add(holder);
  const clips={};for(const c of gl.animations)clips[c.name]=cleanClip(c);
  const mixer=new THREE.AnimationMixer(model);
  const run=mixer.clipAction(clips.Run),idle=mixer.clipAction(clips.Idle);run.play();idle.play();run.setEffectiveWeight(0);idle.setEffectiveWeight(1);
  mixer.update(0);holder.updateMatrixWorld(true);
  const hy=bones.mixamorigHead.getWorldPosition(new THREE.Vector3()).y;body.scale.setScalar(1.55/hy);
  const pistol=makePistol();scene.add(pistol.g);
  // soft contact shadow (helps on low quality where real shadows are off)
  const blob=new THREE.Mesh(new THREE.PlaneGeometry(1.1,1.1).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:T.soft,color:0x000000,transparent:true,opacity:.42,depthWrite:false}));blob.position.y=.015;holder.add(blob);
  const shm=new THREE.Mesh(new THREE.SphereGeometry(.85,28,18),new THREE.MeshBasicMaterial({color:hdrColor(0x4fd2ff,1),transparent:true,opacity:.16,depthWrite:false,blending:THREE.AdditiveBlending}));shm.position.y=.95;shm.scale.set(.8,1.2,.8);holder.add(shm);
  const mg=new THREE.Mesh(new THREE.RingGeometry(.5,.56,48).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:hdrColor(0xc77dff,2),transparent:true,opacity:.6,depthWrite:false,blending:THREE.AdditiveBlending}));mg.position.y=.03;holder.add(mg);
  Object.assign(ARA,{model,holder,tilt,body,mixer,run,idle,bones,pistol,blob,shield:shm,mag:mg,runDur:clips.Run.duration,w:0,head:bones.mixamorigHead});
}
// rotate a bone about a WORLD axis (character faces -z): deterministic, independent of rig bone axes
function wRot(name,axis,ang){const b=ARA.bones[name];if(!b||!ang)return;b.parent.getWorldQuaternion(_q2);b.getWorldQuaternion(_q);
  _q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis,ang));b.quaternion.copy(_q2.invert().multiply(_q));b.updateMatrixWorld(true);}
let slideK=0,airK=0,shootK=0;
function poseAra(dt){
  if(!ARA.model)return;
  const sl=pl.slide>0,air=pl.y>.02,playing=st==='play';
  ARA.w=lerp(ARA.w,playing?1:0,Math.min(1,dt*6));
  ARA.run.setEffectiveWeight(ARA.w);ARA.idle.setEffectiveWeight(1-ARA.w);
  ARA.run.timeScale=playing?(air?.45:clamp(speed/14,1,1.8)):1;
  ARA.mixer.update(dt);
  slideK=lerp(slideK,sl?1:0,Math.min(1,dt*16));airK=lerp(airK,air?1:0,Math.min(1,dt*12));shootK=lerp(shootK,pl.shootT>0?1:0,Math.min(1,dt*22));
  const ph=ARA.run.time/ARA.runDur*Math.PI*2;
  const bob=playing&&!air&&!sl?Math.abs(Math.sin(ph))*.025*ARA.w:0;
  ARA.tilt.rotation.x=slideK*.95;
  ARA.holder.position.set(pl.x,pl.y+bob-slideK*.08,0);
  ARA.holder.rotation.z=-(pl.lane*LANE-pl.x)*.1;ARA.holder.rotation.y=(pl.lane*LANE-pl.x)*.12;
  ARA.holder.updateMatrixWorld(true);
  if(airK>.01){const k=airK;wRot('mixamorigLeftUpLeg',AX,1.0*k);wRot('mixamorigLeftLeg',AX,-1.3*k);wRot('mixamorigRightUpLeg',AX,.35*k);wRot('mixamorigRightLeg',AX,-.9*k);}
  if(slideK>.01){const k=slideK;wRot('mixamorigLeftUpLeg',AX,1.0*k);wRot('mixamorigRightUpLeg',AX,.7*k);wRot('mixamorigRightLeg',AX,-.9*k);}
  if(shootK>.01){wRot('mixamorigRightArm',AX,0);const b=ARA.bones.mixamorigRightArm,f=ARA.bones.mixamorigRightForeArm;
    // aim: point the right arm straight ahead
    b.getWorldPosition(_v);f.getWorldPosition(_v2);const cur=_v2.sub(_v).normalize(),want=new THREE.Vector3(.08,-.05,-1).normalize().applyQuaternion(ARA.holder.quaternion);
    wRot('mixamorigRightArm',new THREE.Vector3().crossVectors(cur,want).normalize(),Math.acos(clamp(cur.dot(want),-1,1))*shootK);
    const fa=ARA.bones.mixamorigRightForeArm,hd=ARA.bones.mixamorigRightHand;fa.getWorldPosition(_v);hd.getWorldPosition(_v2);const c2=_v2.sub(_v).normalize();
    wRot('mixamorigRightForeArm',new THREE.Vector3().crossVectors(c2,want).normalize(),Math.acos(clamp(c2.dot(want),-1,1))*shootK);}
  // pistol in the right hand, pointing ahead
  const hand=ARA.bones.mixamorigRightHand,P=ARA.pistol;hand.getWorldPosition(_v);
  P.g.position.copy(_v);P.g.quaternion.copy(ARA.holder.quaternion);P.g.rotateX(lerp(-1.25,0,shootK));P.g.translateY(-.02);P.g.translateZ(-.03);
  P.g.visible=ARA.holder.visible;P.flash.scale.setScalar(pl.shootT>.15?rnd(.25,.4):.001);
  ARA.holder.visible=!(pl.inv>0&&Math.floor(t*20)%2)&&!(st==='over'&&overT<.7);P.g.visible=ARA.holder.visible;
  ARA.blob.material.opacity=.42*(1-clamp(pl.y,0,1)*.6);ARA.blob.position.y=.015-pl.y;
  ARA.shield.visible=pl.shield>0;ARA.shield.material.opacity=.12+.06*Math.sin(t*10);
  ARA.mag.visible=pl.mag>0;ARA.mag.scale.setScalar(1+((t*1.5)%1)*.8);ARA.mag.material.opacity=.6*(1-((t*1.5)%1));
}
function araHeadY(){ARA.head.getWorldPosition(_v);return _v.y;}
function muzzlePos(out){return ARA.pistol.flash.getWorldPosition(out);}

// ================= Guardian wolf (animated) =================
let WOLF=null;
async function loadWolf(onProg){const g=await gltfLoader.loadAsync('assets/models/Fox.glb');onProg();
  g.scene.traverse(o=>{if(o.isMesh){if(!o.geometry.attributes.normal)o.geometry.computeVertexNormals();o.material=MAT.golem;o.castShadow=true;o.frustumCulled=false;}});
  WOLF={scene:g.scene,clip:g.animations.find(a=>a.name==='Run'),pool:[]};}
function makeWolf(){
  const w=SkeletonUtils.clone(WOLF.scene);w.scale.setScalar(.0155);
  const g=new THREE.Group();g.add(w);
  const mixer=new THREE.AnimationMixer(w);const a=mixer.clipAction(WOLF.clip);a.play();a.time=Math.random();a.timeScale=1.25;
  let head=null;w.traverse(o=>{if(o.isBone&&o.name==='b_Head_05')head=o;});
  if(head){g.updateMatrixWorld(true);const hp=new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
    for(const s of[-1,1]){const wpos=hp.clone().add(new THREE.Vector3(s*.075,.06,.2));const lp=head.worldToLocal(wpos.clone());
      const gl=new THREE.Sprite(new THREE.SpriteMaterial({map:T.glow,color:hdrColor(0xff6a2a,3),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));
      gl.position.copy(lp);gl.scale.setScalar(.2/.0155);head.add(gl);}}
  g.userData.mixer=mixer;return g;
}

// ================= world: tiles & props =================
const world=new THREE.Group();scene.add(world);
function glowSprite(col,s,op=.6){const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:T.glow,color:col,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:op}));sp.scale.setScalar(s);return sp;}
function add(g,o,x,y,z,ry=0,s=1){o.position.set(x,y,z);o.rotation.y=ry;if(s!==1)o.scale.setScalar(s);const veg=o.userData.veg;o.traverse(m=>{if(m.isMesh){m.castShadow=veg?QL[qi].treeSh:true;m.receiveShadow=true;}});g.add(o);return o;}
function tree(big){const g=new THREE.Group(),h=rnd(4.5,7.5)*(big?1.2:1);
  const tr=new THREE.Mesh(GEO.trunk,MAT.bark);tr.scale.set(1,h,1);tr.position.y=h/2;g.add(tr);
  for(let i=0;i<3;i++){const b=new THREE.Mesh(GEO.branch,MAT.bark);const a=rnd(0,6),len=rnd(1.2,2);b.scale.set(1,len,1);b.position.set(Math.cos(a)*len*.35,h*rnd(.65,.9),Math.sin(a)*len*.35);b.rotation.set(Math.sin(a)*.9,0,-Math.cos(a)*.9);g.add(b);}
  const CAN=QL[qi].leaf?GEO.canopy:GEO.canopyLo;const c=new THREE.Mesh(CAN[(Math.random()*3)|0],MAT.leaf);c.customDepthMaterial=MAT.leafDepth;c.position.y=h+.4;c.scale.setScalar(rnd(1.1,1.6));c.rotation.y=rnd(0,6);g.add(c);
  const c2=new THREE.Mesh(CAN[(Math.random()*3)|0],MAT.leaf);c2.customDepthMaterial=MAT.leafDepth;c2.position.set(rnd(-1,1),h-.6,rnd(-1,1));c2.scale.setScalar(rnd(.7,1));g.add(c2);
  g.userData.veg=true;return g;}
function fern(){const m=new THREE.Mesh(GEO.fern,MAT.fern);m.scale.setScalar(rnd(.8,1.5));m.rotation.y=rnd(0,6);m.userData.veg=true;return m;}
function tuft(){const m=new THREE.Mesh(GEO.tuft,MAT.blades);m.scale.setScalar(rnd(.7,1.3));m.rotation.y=rnd(0,6);m.userData.veg=true;return m;}
function bush(){const m=new THREE.Mesh(GEO.bush,MAT.leaf);m.customDepthMaterial=MAT.leafDepth;m.scale.setScalar(rnd(1,1.8));m.userData.veg=true;return m;}
function boulder(){return new THREE.Mesh(GEO.boulder[(Math.random()*3)|0],MAT.rock);}
function pillar(){const g=new THREE.Group(),h=rnd(1.8,4);const c=new THREE.Mesh(new THREE.CylinderGeometry(.36,.42,h,16,3),MAT.stone);c.position.y=h/2;g.add(c);
  const b0=new THREE.Mesh(new THREE.BoxGeometry(1,.3,1),MAT.mossStone);b0.position.y=.15;g.add(b0);
  if(Math.random()<.55){const cp=new THREE.Mesh(new THREE.BoxGeometry(1,.3,1),MAT.mossStone);cp.position.y=h+.15;g.add(cp);}else{c.rotation.z=rnd(-.12,.12);const fb=new THREE.Mesh(new THREE.CylinderGeometry(.36,.36,1.2,16),MAT.stone);fb.rotation.z=Math.PI/2;fb.position.set(rnd(.6,1.2),.36,rnd(-.6,.6));fb.rotation.y=rnd(0,3);g.add(fb);}
  return g;}
function torch(side){const g=new THREE.Group();
  const br=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.25),MAT.darkmetal);g.add(br);
  const h=new THREE.Mesh(new THREE.CylinderGeometry(.04,.03,.45,6),MAT.wood);h.position.set(0,.18,0);h.rotation.z=-side*.35;g.add(h);
  const f=new THREE.Sprite(new THREE.SpriteMaterial({map:T.flame,color:hdrColor(0xffffff,2.5),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));f.scale.set(.3,.55,1);f.position.set(-side*.1,.55,0);g.add(f);
  const gl=glowSprite(0xff8a3a,1.8,.45);gl.position.copy(f.position);g.add(gl);f.name='flame';g.userData.keep=true;return g;}
function lantern(){const g=new THREE.Group();
  const b=new THREE.Mesh(new THREE.CylinderGeometry(.12,.18,.9,10),MAT.rock);b.position.y=.45;g.add(b);
  const p0=new THREE.Mesh(new THREE.BoxGeometry(.55,.08,.55),MAT.rock);p0.position.y=.92;g.add(p0);
  const box=new THREE.Mesh(new THREE.BoxGeometry(.32,.3,.32),MAT.rock);box.position.y=1.12;g.add(box);
  const lt=new THREE.Mesh(new THREE.BoxGeometry(.34,.14,.2),MAT.lampE);lt.position.y=1.12;g.add(lt);
  const roof=new THREE.Mesh(new THREE.ConeGeometry(.45,.32,4),MAT.rock);roof.position.y=1.43;roof.rotation.y=Math.PI/4;g.add(roof);
  const gl=glowSprite(0xffb060,1.4,.5);gl.position.y=1.12;g.add(gl);g.userData.keep=true;return g;}
function cloud(){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:T.cloud,transparent:true,depthWrite:false,opacity:.8}));const k=rnd(8,18);s.scale.set(k,k*.5,1);return s;}
function pine(){const g=new THREE.Group();const p=new THREE.Mesh(GEO.pine[(Math.random()*2)|0],std({map:MAT.pine.map,normalMap:MAT.pine.normalMap,vertexColors:true,roughness:.9,side:THREE.DoubleSide}));g.add(p);
  const s=new THREE.Mesh(GEO.pineSnow,MAT.snowcap);g.add(s);return g;}
let pineMat=null;
function pine2(){if(!pineMat)pineMat=std({map:MAT.pine.map,normalMap:MAT.pine.normalMap,vertexColors:true,roughness:.9,side:THREE.DoubleSide});
  const g=new THREE.Group();g.add(new THREE.Mesh(GEO.pine[(Math.random()*2)|0],pineMat));g.add(new THREE.Mesh(GEO.pineSnow,MAT.snowcap));g.userData.veg=true;return g;}

function populateTile(g,b,entrance){
    const path=new THREE.Mesh(b===2?GEO.bridge:GEO.path,MAT.path[b]);path.receiveShadow=true;g.add(path);
    if(b===0||b===3){
      for(const s of[-1,1]){const gm=new THREE.Mesh(GEO.side,b===0?MAT.grass:MAT.snow);gm.position.set(s*16.7,-.02,0);gm.receiveShadow=true;g.add(gm);
        const cb=new THREE.Mesh(GEO.curb,MAT.curb);cb.position.set(s*2.72,.1,0);cb.receiveShadow=true;cb.castShadow=false;g.add(cb);}
    }
    if(b===0){
      for(const s of[-1,1]){
        if(Math.random()<.8)add(g,tree(),s*rnd(4.4,8.5),0,rnd(-2,2),rnd(0,6));
        if(Math.random()<.45)add(g,tree(true),s*rnd(9.5,15),0,rnd(-2,2),rnd(0,6));
        for(let i=0;i<2;i++)if(Math.random()<.75)add(g,fern(),s*rnd(3.2,6),0,rnd(-2,2));
        for(let i=0;i<3;i++)add(g,tuft(),s*rnd(3.0,7),0,rnd(-2,2));
        if(Math.random()<.45)add(g,bush(),s*rnd(4.5,9),0,rnd(-2,2),rnd(0,6));
        if(Math.random()<.15)add(g,pillar(),s*rnd(3.6,5),0,rnd(-1.5,1.5));
        if(Math.random()<.2)add(g,boulder(),s*rnd(3.4,6),.1,rnd(-1.5,1.5),rnd(0,6),rnd(.3,.6));
      }
    }else if(b===1){
      for(const s of[-1,1]){const w=new THREE.Mesh(new THREE.BoxGeometry(.6,4.4,TL),MAT.brick);w.position.set(s*2.85,2.2,0);w.receiveShadow=true;g.add(w);
        const base=new THREE.Mesh(new THREE.BoxGeometry(.3,.35,TL),MAT.curb);base.position.set(s*2.45,.17,0);base.receiveShadow=true;g.add(base);}
      const c=new THREE.Mesh(new THREE.BoxGeometry(6.4,.5,TL),MAT.ceil);c.position.y=4.6;g.add(c);
      for(const s of[-1,1]){const bm=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),MAT.stone);bm.position.set(s*2.4,4.15,0);g.add(bm);}
      if(Math.random()<.5){const s=Math.random()<.5?-1:1;const tg=add(g,torch(s),s*2.45,2.1,0);tg.userData.lamp={col:0xff8a3a,i:26};}
      if(Math.random()<.15){const sk=add(g,boulder(),rnd(-1,1)>0?2.1:-2.1,.05,rnd(-1.5,1.5),0,.25);}
      if(entrance){
        const f1=new THREE.Mesh(new THREE.BoxGeometry(14,10,1.4),MAT.mossStone);f1.position.set(-9.65,5,TL/2);g.add(f1);
        const f2=f1.clone();f2.position.x=9.65;g.add(f2);
        const f3=new THREE.Mesh(new THREE.BoxGeometry(5.4,5.2,1.4),MAT.mossStone);f3.position.set(0,7.4,TL/2);g.add(f3);
        const lint=new THREE.Mesh(new THREE.BoxGeometry(6.6,.7,1.7),MAT.stone);lint.position.set(0,4.85,TL/2);g.add(lint);
        for(const s of[-1,1]){const st0=new THREE.Mesh(GEO.boulder[0],MAT.golem);st0.position.set(s*3.9,1.1,TL/2+1.5);st0.scale.set(.8,1.25,.8);g.add(st0);
          const tg=torch(s);tg.position.set(s*3.4,3.2,TL/2+.8);g.add(tg);tg.userData.lamp={col:0xff8a3a,i:30};}
        g.traverse(m=>{if(m.isMesh){m.castShadow=m.receiveShadow=true;}});
      }
    }else if(b===2){
      const beam=new THREE.Mesh(new THREE.BoxGeometry(.3,.4,TL),MAT.wood);
      for(const s of[-1,1]){const bb=beam.clone();bb.position.set(s*2.2,-.25,0);g.add(bb);
        const post=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,1.3,10),MAT.wood);post.position.set(s*2.4,.6,-TL/2+.1);post.castShadow=true;g.add(post);
        for(const y of[1.1,.6]){const r=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,TL,6),MAT.rope);r.rotation.x=Math.PI/2;r.position.set(s*2.4,y-.06,0);r.castShadow=true;g.add(r);}
        if(Math.random()<.45){const c=cloud();c.position.set(s*rnd(5,24),rnd(-14,-4),rnd(-2,2));g.add(c);}
      }
      const under=new THREE.Mesh(new THREE.BoxGeometry(4.2,.12,.25),MAT.wood);under.position.set(0,-.48,0);g.add(under);
    }else{
      for(const s of[-1,1]){
        if(Math.random()<.75)add(g,pine2(),s*rnd(4,9),0,rnd(-2,2),rnd(0,6),rnd(.8,1.3));
        if(Math.random()<.35)add(g,pine2(),s*rnd(10,16),0,rnd(-2,2),rnd(0,6),rnd(1.1,1.6));
        if(Math.random()<.3)add(g,boulder(),s*rnd(3.6,7),.1,rnd(-1.5,1.5),rnd(0,6),rnd(.4,.9));
      }
      if(Math.random()<.22){const s=Math.random()<.5?-1:1;const lt=add(g,lantern(),s*3.4,0,0);lt.userData.lamp={col:0xffb060,i:12,y:1.12};}
    }
  mergeStatic(g);return g;
}
const TPL=new Map();
function buildTemplates(){TPL.clear();for(let b=0;b<4;b++){const l=[];for(let v=0;v<7;v++)l.push(populateTile(new THREE.Group(),b,false));TPL.set(b,l);}
  TPL.set('1e',[populateTile(new THREE.Group(),1,true)]);}
class Tile{
  constructor(){this.g=new THREE.Group();world.add(this.g);this.z=0;this.b=0;this.lamps=[];}
  clear(){for(const c of[...this.g.children])this.g.remove(c);this.lamps=[];}
  build(b,prevB,hidden){
    this.clear();this.b=b;this.g.visible=!hidden;this.hidden=hidden;if(hidden)return;
    const list=TPL.get(b===1&&prevB!==1?'1e':b),c=list[(Math.random()*list.length)|0].clone();
    if(b!==1&&Math.random()<.5)c.scale.x=-1;this.g.add(c);
    c.traverse(o=>{if(o.userData.lamp)this.lamps.push(Object.assign({o,flame:o.getObjectByName('flame'),sx:c.scale.x},o.userData.lamp));});
  }
}
function mergeStatic(group){
  group.updateMatrixWorld(true);const inv=group.matrixWorld.clone().invert(),buckets=new Map();
  group.traverse(o=>{if(!o.isMesh||o.isSkinnedMesh||Array.isArray(o.material))return;
    let a=o.parent;while(a&&a!==group){if(a.userData.keep)return;a=a.parent;}
    const g=o.geometry,key=o.material.uuid+'|'+Object.keys(g.attributes).sort().join(',')+'|'+(o.castShadow?1:0)+'|'+(o.customDepthMaterial?1:0);
    if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(o);});
  for(const list of buckets.values()){if(list.length<2)continue;
    const geos=list.map(o=>{let g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();return g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld));});
    const mg=mergeGeometries(geos,false);geos.forEach(g=>g.dispose());if(!mg)continue;
    const f=list[0],mesh=new THREE.Mesh(mg,f.material);mesh.castShadow=f.castShadow;mesh.receiveShadow=true;if(f.customDepthMaterial)mesh.customDepthMaterial=f.customDepthMaterial;mesh.userData.own=true;
    for(const o of list)o.parent.remove(o);group.add(mesh);}
}
const tiles=[];let lastTileB=0;
function buildTiles(){for(let i=0;i<NT;i++)tiles.push(new Tile());}
function layoutTiles(off=0){let prev=-1;for(let i=0;i<NT;i++){const t0=tiles[i];t0.z=6+off-i*TL;t0.g.position.z=t0.z;const b=biAt(dist-t0.z);t0.build(b,i===0?biAt(dist):prev,false);prev=b;lastTileB=b;}}

// ================= junction =================
let junction=null;
function buildJunction(dir,b){
  const g=new THREE.Group();world.add(g);
  const xl=dir===1?-2.5:-60,xr=dir===-1?2.5:60,w=xr-xl,cx=(xl+xr)/2;
  const pm=MAT.path[b].clone();for(const k of['map','normalMap','bumpMap','roughnessMap'])if(pm[k]){pm[k]=pm[k].clone();pm[k].repeat.set(w/3.3,1.25);pm[k].needsUpdate=true;}
  const road=new THREE.Mesh(new THREE.PlaneGeometry(w,5).rotateX(-Math.PI/2),pm);road.position.set(cx,0,-2.5);road.receiveShadow=true;g.add(road);
  const base=b===2?MAT.cliff:b===1?MAT.brick:MAT.mossStone;const wallM=base.clone();
  for(const k of['map','normalMap','bumpMap','roughnessMap'])if(base[k]){wallM[k]=base[k].clone();wallM[k].repeat.set(b===2?20:30,b===2?8:2.5);wallM[k].needsUpdate=true;}
  const back=new THREE.Mesh(new THREE.BoxGeometry(120,b===2?40:8,1.5),wallM);back.position.set(0,b===2?-6:4,-5.8);back.receiveShadow=true;g.add(back);
  if(b===1){const c=new THREE.Mesh(new THREE.BoxGeometry(120,.5,6.2),MAT.ceil);c.position.set(0,4.6,-2.5);g.add(c);
    for(let i=-3;i<=3;i++){const tg=torch(1);tg.rotation.y=Math.PI/2;tg.position.set(i*6+3,2.4,-5);g.add(tg);}}
  for(const s of[-1,1]){
    const open=dir===0||dir===s;
    if(!open){const sw=new THREE.Mesh(new THREE.BoxGeometry(1.2,b===2?40:8,7),wallM);sw.position.set(s*3.1,b===2?-6:4,-2.5);g.add(sw);}
    else if(b===1){const fw=new THREE.Mesh(new THREE.BoxGeometry(60,4.4,.6),MAT.brick);fw.position.set(s*32.65,2.2,.3);g.add(fw);}
    else if(b===0||b===3){const gm=new THREE.Mesh(new THREE.PlaneGeometry(60,8).rotateX(-Math.PI/2),b===0?MAT.grass:MAT.snow);gm.position.set(s*32.5,-.02,4);gm.receiveShadow=true;g.add(gm);}
  }
  if(b===0){for(let i=0;i<10;i++)add(g,tree(true),rnd(-30,30),0,rnd(-9,-7),rnd(0,6));}
  if(b===3){for(let i=0;i<10;i++)add(g,pine2(),rnd(-30,30),0,rnd(-9,-7),0,1.5);}
  const sh=new THREE.Shape();sh.moveTo(.5,0);sh.lineTo(-.1,.55);sh.lineTo(-.1,.25);sh.lineTo(-.5,.25);sh.lineTo(-.5,-.25);sh.lineTo(-.1,-.25);sh.lineTo(-.1,-.55);sh.closePath();
  const ag=new THREE.ShapeGeometry(sh);
  for(const s of(dir===0?[-1,1]:[dir]))for(let i=0;i<2;i++){const a=new THREE.Mesh(ag,MAT.arrow);a.scale.set(s*.9,.9,1);a.position.set(s*(1+i*1.2),2.4,-5.0);g.add(a);
    const gl=glowSprite(0xffc040,1.6,.45);gl.position.copy(a.position);gl.position.z+=.1;g.add(gl);}
  g.traverse(m=>{if(m.isMesh&&m.material!==MAT.arrow){m.castShadow=true;m.receiveShadow=true;}});
  return g;
}

// ================= obstacles / enemies / pickups =================
function cap(r,l,m){const me=new THREE.Mesh(new THREE.CapsuleGeometry(r,l,6,14),m);me.castShadow=true;return me;}
function mk(o){o.traverse(m=>{if(m.isMesh){if(m.castShadow!==false)m.castShadow=true;m.receiveShadow=true;}});return o;}
const OBT=new Map();
function getObs(t,b){
  let m;
  if(t==='beast'){m=WOLF.pool.pop()||buildObs('beast',b);m.scale.setScalar(1);}
  else{const k=t+b;if(!OBT.has(k))OBT.set(k,buildObs(t,b));m=OBT.get(k).clone();}
  const u=m.userData;u.spin=m.getObjectByName('spin');u.m=m.getObjectByName('m');u.neck=m.getObjectByName('neck');u.tongue=m.getObjectByName('tongue');
  if(t==='snake'){u.seg=[];m.traverse(o=>{if(o.name==='seg')u.seg.push(o);});}
  world.add(m);return m;
}
function dropObs(o){world.remove(o.m);if(o.t==='beast')WOLF.pool.push(o.m);}
function prewarmObs(){const tmp=new THREE.Group();for(let b=0;b<4;b++)for(const t of['log','arch','pit','wall','mask','snake','coin','relic','idol']){const m=getObs(t,b);world.remove(m);tmp.add(m);m.position.set(0,0,-8);}
  for(let i=0;i<3;i++){const w=buildObs('beast',0);WOLF.pool.push(w);tmp.add(w);w.position.set(0,0,-8);}
  scene.add(tmp);renderer.compile(scene,camera);scene.remove(tmp);for(const w of WOLF.pool)tmp.remove(w);}
function buildObs(t,b){
  const g=new THREE.Group();
  switch(t){
  case 'log':
    if(b===1){const base=new THREE.Mesh(new THREE.BoxGeometry(1.35,.1,.7),MAT.darkmetal);base.position.y=.05;g.add(base);
      const cg=new THREE.ConeGeometry(.07,.55,8);for(let i=0;i<7;i++)for(const z of[-.15,.15]){const c=new THREE.Mesh(cg,MAT.metal);c.position.set(-.6+i*.2,.35,z+(i%2)*.05);g.add(c);}}
    else{const l=new THREE.Mesh(new THREE.CylinderGeometry(.3,.33,1.45,20,3),[MAT.bark,MAT.endcap,MAT.endcap]);l.rotation.z=Math.PI/2;l.position.y=.3;g.add(l);
      if(b===3){const s=new THREE.Mesh(new THREE.CylinderGeometry(.315,.315,1.4,20,1,false,-Math.PI/2,Math.PI*.9),MAT.snowcap);s.rotation.set(0,0,Math.PI/2);s.position.y=.33;g.add(s);}
      if(b===0){const f=fern();f.scale.setScalar(.5);f.position.set(.6,0,.35);g.add(f);}
      if(b===2){for(const x of[-.4,.4]){const r=new THREE.Mesh(new THREE.TorusGeometry(.33,.025,8,20),MAT.rope);r.rotation.y=Math.PI/2;r.position.set(x,.3,0);g.add(r);}}}
    break;
  case 'arch':
    if(b===3){for(const s of[-1,1]){const p=new THREE.Mesh(new THREE.CylinderGeometry(.11,.13,2.2,16),MAT.red);p.position.set(s*.68,1.1,0);g.add(p);}
      const t1=new THREE.Mesh(new THREE.BoxGeometry(2.3,.18,.3),MAT.black);t1.position.y=2.05;g.add(t1);
      const t2=new THREE.Mesh(new THREE.BoxGeometry(2.1,.2,.26),MAT.red);t2.position.y=1.88;g.add(t2);
      const t3=new THREE.Mesh(new THREE.BoxGeometry(1.6,.26,.2),MAT.red);t3.position.y=1.32;g.add(t3);}
    else{const pm=b===2?MAT.wood:MAT.stone;
      for(const s of[-1,1]){const p=new THREE.Mesh(new THREE.BoxGeometry(.28,2.1,.44),pm);p.position.set(s*.66,1.05,0);g.add(p);}
      const lt=new THREE.Mesh(new THREE.BoxGeometry(1.75,.6,.52),b===2?MAT.wood:MAT.mossStone);lt.position.y=1.48;g.add(lt);
      if(b===2){for(const r of[.7,-.7]){const rp=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,1.2,6),MAT.rope);rp.rotation.z=r;rp.position.set(0,1.6,.27);g.add(rp);}}
      if(b===1){const sk=new THREE.Mesh(new THREE.SphereGeometry(.13,16,12),std({color:0xd8d0bc,roughness:.55}));sk.position.set(0,1.5,.28);sk.scale.set(1,.9,.8);g.add(sk);}
      if(b===0){const f=fern();f.scale.setScalar(.45);f.rotation.x=Math.PI;f.position.set(-.3,1.2,.2);g.add(f);}}
    break;
  case 'wall':
    if(b===2){const c1=new THREE.Mesh(new THREE.BoxGeometry(1.1,1.1,1.1),MAT.wood);c1.position.y=.55;c1.rotation.y=.1;g.add(c1);
      const c2=new THREE.Mesh(new THREE.BoxGeometry(.8,.8,.8),MAT.wood);c2.position.set(.1,1.5,0);c2.rotation.y=-.2;g.add(c2);}
    else if(b===3){const bo=new THREE.Mesh(GEO.boulder[1],MAT.rock);bo.position.y=.85;bo.scale.set(.85,1,.75);g.add(bo);
      const sc=new THREE.Mesh(lumpy(.55,2,.2),MAT.snowcap);sc.position.y=1.6;sc.scale.set(1.1,.3,1);g.add(sc);}
    else{const bl=new THREE.Mesh(new THREE.BoxGeometry(1.35,2.2,.9),MAT.mossStone);bl.position.y=1.1;g.add(bl);
      const gly=new THREE.Mesh(new THREE.TorusGeometry(.2,.035,10,32),b===1?MAT.teal:MAT.yellowE);gly.position.set(0,1.3,.46);gly.castShadow=false;g.add(gly);}
    break;
  case 'pit':{
    const hole=new THREE.Mesh(new THREE.BoxGeometry(1.4,.02,2.4),b===2?MAT.voidm:MAT.pit);hole.position.y=.012;hole.castShadow=false;g.add(hole);
    if(b!==2){for(let i=0;i<10;i++){const r=boulder();r.castShadow=false;const side=i%2?1:-1;r.scale.setScalar(rnd(.08,.15));r.position.set(i<6?side*.72:rnd(-.6,.6),.03,i<6?rnd(-1.1,1.1):side*1.22);g.add(r);}}
    else{for(const z of[-1.15,1.15]){const s0=new THREE.Mesh(new THREE.BoxGeometry(1.4,.05,.12),MAT.wood);s0.position.set(0,.02,z);s0.rotation.z=rnd(-.1,.1);g.add(s0);}}
    break;}
  case 'beast':{const w=makeWolf();g.add(w);g.userData.mixer=w.userData.mixer;g.userData.wolf=1;break;}
  case 'mask':{
    const m=new THREE.Group();m.name='m';m.position.y=1.55;g.add(m);
    const face=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,.14,36),[MAT.maskWood,MAT.maskFace,MAT.maskWood]);face.rotation.x=Math.PI/2;face.scale.set(.82,1,1.1);m.add(face);
    const cols=[0x2fae8f,0xc23a2e,0xe8b83a,0xc23a2e,0x2fae8f,0xe8b83a,0x2fae8f];
    cols.forEach((c,i)=>{const a=(i-3)*.32;const f=new THREE.Mesh(new THREE.ConeGeometry(.07,.6,8),std({color:c,roughness:.6}));f.position.set(Math.sin(a)*.4,Math.cos(a)*.5,-.06);f.rotation.z=-a;f.scale.z=.35;m.add(f);});
    for(const s of[-1,1]){const gl=glowSprite(0x7ff5dc,.4,.8);gl.position.set(s*.13,.11,.12);m.add(gl);}
    break;}
  case 'snake':{
        for(let i=0;i<12;i++){const r=.14-i*.007;const s=new THREE.Mesh(new THREE.SphereGeometry(r,16,12),MAT.snake);s.position.set(0,r*.8,-.1-i*.17);s.scale.set(1,.8,1.4);s.name='seg';g.add(s);}
    const neck=new THREE.Group();neck.name='neck';g.add(neck);
    for(let i=0;i<5;i++){const s=new THREE.Mesh(new THREE.SphereGeometry(.12,14,10),MAT.snake);s.position.set(0,.13+i*.13,.04+i*.025);neck.add(s);}
    const hood=new THREE.Mesh(new THREE.SphereGeometry(.24,20,14),MAT.snake);hood.position.set(0,.66,.05);hood.scale.set(1.35,1.25,.28);neck.add(hood);
    const belly=new THREE.Mesh(new THREE.SphereGeometry(.18,16,10),MAT.snakeBelly);belly.position.set(0,.6,.11);belly.scale.set(.8,1.2,.2);neck.add(belly);
    const hd=new THREE.Mesh(new THREE.SphereGeometry(.12,16,12),MAT.snake);hd.position.set(0,.84,.12);hd.scale.set(1,.7,1.3);neck.add(hd);
    for(const s of[-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(.022,8,6),MAT.yellowE);e.position.set(s*.06,.88,.24);neck.add(e);}
    const tg=new THREE.Mesh(new THREE.BoxGeometry(.015,.005,.12),new THREE.MeshBasicMaterial({color:0xc2302a}));tg.position.set(0,.81,.3);tg.name='tongue';neck.add(tg);
    break;}
  case 'coin':{const c=new THREE.Mesh(GEO.coin,MAT.gold);c.name='spin';g.add(c);break;}
  case 'relic':{const c=new THREE.Mesh(GEO.gem,MAT.gem);c.scale.set(1,1.5,1);c.name='spin';g.add(c);g.add(glowSprite(0x4fd2ff,1.4));break;}
  case 'idol':{const i=new THREE.Group();i.name='spin';g.add(i);
    const bd=cap(.13,.18,MAT.idol);bd.position.y=-.05;i.add(bd);const hd=new THREE.Mesh(new THREE.SphereGeometry(.14,16,12),MAT.idol);hd.position.y=.25;i.add(hd);
    const bs=new THREE.Mesh(new THREE.CylinderGeometry(.18,.2,.08,20),MAT.gold);bs.position.y=-.3;i.add(bs);g.add(glowSprite(0xc77dff,1.3));break;}
  }
  return mk(g);
}

// ================= particles =================
const PP=[];
function buildParticles(){for(let i=0;i<80;i++){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:T.soft,transparent:true,depthWrite:false,opacity:0}));s.visible=false;world.add(s);PP.push({s,life:0,max:1,v:new THREE.Vector3(),g:0,sz:.1});}}
let ppI=0;
function emit(x,y,z,col,n,o={}){for(let i=0;i<n;i++){const p=PP[ppI++%PP.length];p.s.visible=true;p.s.position.set(x+rnd(-.1,.1),y,z);p.v.set(rnd(-1,1)*(o.spd||2),rnd(.3,1)*(o.up||3),rnd(-1,1)*(o.spd||2));
  p.life=p.max=rnd(.4,.8)*(o.life||1);p.g=o.g===undefined?7:o.g;p.sz=o.size||.12;p.grow=o.grow||0;p.s.material.color.set(col);if(o.add)p.s.material.color.multiplyScalar(2.5);p.s.material.blending=o.add?THREE.AdditiveBlending:THREE.NormalBlending;p.s.material.opacity=1;p.s.scale.setScalar(p.sz);}}
function updParticles(dt,dz){for(const p of PP){if(p.life<=0)continue;p.life-=dt;if(p.life<=0){p.s.visible=false;continue;}
  p.v.y-=p.g*dt;p.s.position.x+=p.v.x*dt;p.s.position.y+=p.v.y*dt;p.s.position.z+=p.v.z*dt+dz;const k=p.life/p.max;p.s.material.opacity=Math.min(1,k*1.6)*(p.grow?.45:1);p.s.scale.setScalar(p.sz*(1+p.grow*(1-k)));}}

// ================= audio =================
let ac=null;
function initAudio(){try{if(!ac)ac=new (window.AudioContext||window.webkitAudioContext)();if(ac.resume)ac.resume();}catch(e){}}
function snd(f,d,type,v,f2){if(!ac)return;try{const o=ac.createOscillator(),g=ac.createGain(),n=ac.currentTime;o.type=type||'sine';o.frequency.setValueAtTime(f,n);if(f2)o.frequency.exponentialRampToValueAtTime(f2,n+d);g.gain.setValueAtTime(v||.1,n);g.gain.exponentialRampToValueAtTime(.001,n+d);o.connect(g);g.connect(ac.destination);o.start(n);o.stop(n+d);}catch(e){}}
function vib(ms){try{navigator.vibrate&&navigator.vibrate(ms);}catch(e){}}

// ================= game state =================
let showMode='orbit',showTheta=0,camR=3.3,camH=1.4,camLY=.95,introT=0,introTh0=0,introR0=3,introH0=1.4,introL0=.95,dragging=false;const INTRO=1.5;
let st='loading',dist=0,speed=14,coins=0,kills=0,turns=0,score=0,best=0,obs=[],bullets=[],nextRow,turn=null,turnCtr,camYaw=0,shake=0,t=0,overT=0,dustT=0,curB=0,deathMsg='';
let pl={lane:0,x:0,y:0,vy:0,slide:0,shield:0,mag:0,inv:0,run:0,cool:0,shootT:0};
try{best=+localStorage.getItem('gjt_best4')||0;}catch(e){}
function clearObs(){for(const o of obs)dropObs(o);obs=[];for(const b of bullets)world.remove(b.m);bullets=[];}
function reset(){
  clearObs();dist=0;speed=16;coins=0;kills=0;turns=0;score=0;curB=0;
  pl={lane:0,x:0,y:0,vy:0,slide:0,shield:0,mag:0,inv:0,run:0,cool:0,shootT:0};
  nextRow=28;turnCtr=rnd(330,480);if(junction){world.remove(junction);junction=null;}turn=null;camYaw=0;
  layoutTiles();
}
function spawn(t0,lane,z,b,y){const o={t:t0,lane,z,b,y:y||0,dead:0,hit:0,ph:Math.random()*6,m:getObs(t0,b)};obs.push(o);return o;}
function spawnRow(){
  const z=SPAWNZ,b=biAt(dist-z),lanes=[-1,0,1].sort(()=>Math.random()-.5);
  const n=Math.random()<Math.min(.6,.15+dist/2500)?2:1;
  const e=dist>100?1.1:0;
  for(let i=0;i<n;i++){const ty=pick(['log','arch','pit','wall','beast','mask','snake'],[3,3,b===2?3.5:2,2,e,e,e]);spawn(ty,lanes[i],z,b);
    if((ty==='log'||ty==='pit'||ty==='snake')&&Math.random()<.35)for(let k=-1;k<=1;k++)spawn('coin',lanes[i],z+k*1.4,b,k===0?2.0:1.6);}
  const free=lanes[2],r=Math.random();
  if(r<.045)spawn('relic',free,z,b,.9);else if(r<.085)spawn('idol',free,z,b,.8);
  else if(r<.75)for(let k=0;k<5;k++)spawn('coin',free,z-k*1.6,b,.6);
}
function toast(name){const el=$('toast');el.innerHTML='<small>ZONA E RE</small>'+name;el.style.opacity=1;clearTimeout(toast.h);toast.h=setTimeout(()=>el.style.opacity=0,2200);}
function move(d){
  if(st!=='play')return;
  if(turn&&turn.z>-11&&turn.z<5&&(turn.dir===0||turn.dir===d)){doTurn(d);return;}
  pl.lane=clamp(pl.lane+d,-1,1);snd(420,.06,'triangle',.05);
}
function doTurn(d){
  clearObs();world.remove(junction);junction=null;turn=null;
  layoutTiles();pl.lane=0;pl.x=0;nextRow=20;turnCtr=rnd(350,560);turns++;camYaw=d*Math.PI*.42;
  snd(240,.35,'sawtooth',.06,700);
}
function jump(){if(st!=='play')return;if(pl.y<=.01){pl.slide=0;pl.vy=10.2;snd(300,.15,'sine',.08,600);}}
function slide(){if(st!=='play')return;if(pl.y>0)pl.vy=-20;pl.slide=.65;snd(200,.15,'sawtooth',.04,90);}
function shoot(){
  if(st!=='play'||pl.cool>0)return;pl.cool=.25;pl.shootT=.25;
  const m=new THREE.Mesh(GEO.bullet,MAT.bullet);muzzlePos(m.position);world.add(m);bullets.push({m,lane:pl.lane,z:m.position.z,y:m.position.y});
  snd(180,.12,'square',.09,60);snd(1400,.05,'sawtooth',.04,300);vib(15);
}
function collect(o){
  const p=o.m.position;
  if(o.t==='coin'){coins++;emit(p.x,p.y,p.z,0xffd54a,6,{spd:1.5,size:.12,add:true});snd(1250,.07,'sine',.06,1900);}
  else if(o.t==='relic'){pl.shield=8;emit(p.x,p.y,p.z,0x4fd2ff,18,{size:.2,add:true});snd(500,.4,'triangle',.1,1500);}
  else{pl.mag=8;emit(p.x,p.y,p.z,0xc77dff,18,{size:.2,add:true});snd(400,.4,'triangle',.1,1200);}
}
const MSG={log:'U pengua!',arch:'Përplasje me harkun!',pit:'Ra në greminë!',wall:'Përplasje me murin!',beast:'Ujku prej guri e kapi!',mask:'Maska e rojes e goditi!',snake:'Gjarpri e kafshoi!',turn:'Nuk e mori kthesën!'};
function die(kind){
  st='over';shake=.5;overT=.9;deathMsg=MSG[kind]||'Shukli ra!';vib(200);
  snd(220,.6,'sawtooth',.12,40);emit(pl.x,1,0,0x8a4a2a,16,{size:.18});emit(pl.x,.2,0,BI[curB].dust,14,{size:.5,grow:2,g:1});
  if(score>best){best=score;$('newbest').textContent='★ Rekord i ri! ★';try{localStorage.setItem('gjt_best4',best);}catch(e){}}else $('newbest').textContent='';
}

// ================= biome application =================
const cA=new THREE.Color(),cB=new THREE.Color(),vA=new THREE.Vector3(),vB=new THREE.Vector3();
let envIdx=-1;
function applyBiome(k,ia,ib){
  const A=BI[ia],B=BI[ib];
  skyU.top.value.copy(cA.set(A.top).lerp(cB.set(B.top),k));skyU.bot.value.copy(cA.set(A.bot).lerp(cB.set(B.bot),k));
  scene.fog.color.copy(cA.set(A.fog).lerp(cB.set(B.fog),k));scene.fog.near=lerp(A.fn,B.fn,k);scene.fog.far=lerp(A.ff,B.ff,k);
  skyU.sunCol.value.copy(cA.set(A.sun).lerp(cB.set(B.sun),k));skyU.sunAmt.value=lerp(A.dark?0:1,B.dark?0:1,k);
  vA.set(...A.sd).lerp(vB.set(...B.sd),k).normalize();skyU.sunDir.value.copy(vA);
  sun.color.copy(skyU.sunCol.value);sun.intensity=lerp(A.si,B.si,k);
  sun.position.set(vA.x*40,Math.max(vA.y,.3)*40,vA.z*40-6);sun.target.position.set(0,0,-6);
  hemi.color.copy(cA.set(A.hs).lerp(cB.set(B.hs),k));hemi.groundColor.copy(cA.set(A.hg).lerp(cB.set(B.hg),k));hemi.intensity=lerp(A.hi,B.hi,k);
  renderer.toneMappingExposure=lerp(A.ex,B.ex,k);
  const cur=k<.5?ia:ib;
  if(envIdx!==cur){envIdx=cur;scene.environment=envMaps[cur];backdrops.forEach((b,i)=>b.visible=i===cur);
    const ei=BI[cur].env;scene.traverse(o=>{if(o.material&&!Array.isArray(o.material)&&o.material.isMeshStandardMaterial)o.material.envMapIntensity=ei;});
    for(const m of Object.values(MAT)){if(m&&m.isMeshStandardMaterial)m.envMapIntensity=ei;else if(Array.isArray(m))m.forEach(x=>x.isMeshStandardMaterial&&(x.envMapIntensity=ei));}}
  return lerp(A.dark,B.dark,k);
}
function applyBiomeNow(){const d=dist%BL,b=biAt(dist);if(dist>=BL&&d<60)return applyBiome(d/60,(b+3)%4,b);return applyBiome(1,b,b);}

// ================= simulation (fixed-ish timestep) =================
function step(dt){
  let dz=0;
  if(st==='play'){
    speed=Math.min(36,16+dist*.011);dz=speed*dt;dist+=dz;
    const nb=biAt(dist);if(nb!==curB){curB=nb;toast(BI[nb].name);}
    pl.x+=(pl.lane*LANE-pl.x)*Math.min(1,dt*18);
    if(pl.y>0||pl.vy>0){pl.vy-=33*dt;pl.y+=pl.vy*dt;if(pl.y<=0){pl.y=0;pl.vy=0;emit(pl.x,.05,0,BI[curB].dust,5,{size:.3,grow:1.5,g:0,spd:1,up:.5});}}
    for(const k of['slide','shield','mag','inv','cool','shootT'])if(pl[k]>0)pl[k]-=dt;
    if(pl.y<=0&&curB!==2){dustT-=dt;if(dustT<=0){dustT=pl.slide>0?.03:.1;emit(pl.x+rnd(-.1,.1),.05,.15,BI[curB].dust,1,{size:pl.slide>0?.45:.28,grow:2,g:-.3,spd:.4,up:.6,life:.9});}}
    for(const tl of tiles){tl.z+=dz;if(tl.z-TL/2>8){tl.z-=NT*TL;const b=biAt(dist-tl.z);tl.build(b,lastTileB,!!turn);lastTileB=b;}tl.g.position.z=tl.z;}
    if(!turn){turnCtr-=dz;if(turnCtr<=0&&dist>60){
      const far=tiles.reduce((a,b)=>a.z<b.z?a:b);if(!far.hidden){const dir=[-1,1,0][(Math.random()*3)|0];turn={z:far.z-TL/2,dir};
        junction=buildJunction(dir,far.b);junction.position.z=turn.z;
        for(const o of obs)if(o.z<turn.z+7){dropObs(o);o.gone=1;}obs=obs.filter(o=>!o.gone);}}}
    else{turn.z+=dz;junction.position.z=turn.z;if(turn.z>4.6){die('turn');return dz;}}
    if(!turn){nextRow-=dz;if(nextRow<=0){spawnRow();nextRow=rnd(14,20)*(1+(speed-16)/38);}}
    for(const o of obs){o.z+=dz;
      if(!o.dead){if(o.t==='beast')o.z+=5*dt;else if(o.t==='mask')o.z+=3*dt;else if(o.t==='snake')o.z+=1.5*dt;}
      if(o.t==='coin'&&pl.mag>0&&o.z>-20&&o.z<1){o.lane+=(pl.x/LANE-o.lane)*Math.min(1,dt*7);o.y+=(pl.y+.8-o.y)*Math.min(1,dt*7);o.z+=10*dt;}}
    for(const b of bullets){const z0=b.z;b.z-=60*dt;b.m.position.x+=(b.lane*LANE-b.m.position.x)*Math.min(1,dt*20);b.m.position.y+=(1.0-b.m.position.y)*Math.min(1,dt*10);b.m.position.z=b.z;
      for(const o of obs){if(o.dead||!(o.t==='beast'||o.t==='mask'||o.t==='snake'))continue;
        if(Math.abs(o.lane-b.lane)<.5&&o.z<z0+1.3&&o.z>b.z-1.3){o.dead=.001;b.done=1;kills++;const p=o.m.position;
          emit(p.x,o.t==='mask'?1.5:.8,p.z,o.t==='mask'?0x8a5a30:o.t==='snake'?0x3d6a34:0x8a908a,18,{size:.2,spd:3});emit(p.x,1,p.z,0x7ff5dc,10,{add:true,size:.22});snd(140,.25,'square',.1,60);vib(30);break;}}}
    for(const b of bullets)if(b.done||b.z<-50){world.remove(b.m);b.done=1;}
    bullets=bullets.filter(b=>!b.done);
    for(const o of obs){
      if(o.hit||o.dead)continue;
      if(Math.abs(o.lane*LANE-pl.x)>=.7)continue;
      if(o.t==='coin'||o.t==='relic'||o.t==='idol'){if(Math.abs(o.z)<.7&&Math.abs(o.y-(pl.y+.8))<.95){o.hit=1;collect(o);}continue;}
      let hit=false;
      if(o.t==='pit'){if(o.z>-1.25&&o.z<1.25&&pl.y<.15)hit=true;}
      else if(Math.abs(o.z)<.55){
        if(o.t==='log'||o.t==='snake')hit=pl.y<.62;
        else if(o.t==='arch'||o.t==='mask')hit=pl.slide<=0;
        else hit=true;}
      if(hit){
        if(pl.shield>0||pl.inv>0){if(pl.inv<=0){pl.shield=0;pl.inv=1;shake=.25;vib(60);emit(o.m.position.x,1,o.z,0x4fd2ff,14,{add:true,size:.25});snd(300,.3,'square',.08,100);}o.hit=1;if(o.t!=='pit')emit(o.m.position.x,.8,o.z,0x9a8c76,12,{size:.2,spd:3});}
        else{die(o.t);break;}}
    }
    for(const o of obs){if(o.dead)o.dead+=dt;if(o.z>8||(o.hit&&o.t!=='pit')||o.dead>.45){dropObs(o);o.gone=1;}}
    obs=obs.filter(o=>!o.gone);
    score=Math.floor(dist)+coins*10+kills*50+turns*25;
  }
  return dz;
}

function frame(dt){
  t+=dt;if(shake>0)shake=Math.max(0,shake-dt);
  if(st==='over'&&overT>0){overT-=dt;if(overT<=0)showOver();}
  // simulation in sub-steps so game speed never depends on frame rate
  let dzTot=0;const n=Math.max(1,Math.ceil(dt/(1/60)));for(let i=0;i<n;i++)dzTot+=step(dt/n);
  for(const o of obs){
    const m=o.m;m.position.set(o.lane*LANE,o.y,o.z);const u=m.userData;
    if(u.spin){u.spin.rotation.y+=dt*(o.t==='coin'?4:2);if(o.t!=='coin')m.position.y=o.y+Math.sin(t*3+o.ph)*.1;}
    if(u.mixer&&!o.dead)u.mixer.update(dt);
    if(o.t==='mask'){u.m.position.y=1.55+Math.sin(t*4+o.ph)*.1;u.m.rotation.z=Math.sin(t*3+o.ph)*.15;u.m.rotation.y=Math.sin(t*2+o.ph)*.2;}
    if(o.t==='snake'){u.seg.forEach((s,i)=>s.position.x=Math.sin(t*6+o.ph-i*.6)*.14);u.neck.rotation.z=Math.sin(t*3+o.ph)*.08;u.tongue.visible=Math.sin(t*9)>0;}
    if(o.dead){const k=Math.max(.01,1-o.dead*2.2);m.scale.setScalar(k);}
  }
  MAT.arrow.color.copy(hdrColor(0xffd44a,1.5+Math.sin(t*10)*.8));
  const dark=applyBiomeNow();const cb=biAt(dist),lampsOn=cb===1||cb===3;lampLights.forEach(l=>l.visible=lampsOn);plLight.visible=dark>.01;
  const cand=[];
  for(const tl of tiles)for(const L of tl.lamps){const wz=tl.z+L.o.position.z;if(wz<4&&wz>-30)cand.push({L,wz,x:L.o.position.x*L.sx,y:L.o.position.y+(L.y||.55)});
    if(L.flame){const f=L.flame;const fl=.85+.15*Math.sin(t*23+tl.z)+.1*Math.sin(t*37);f.scale.set(.3*fl,.55*fl,1);}}
  cand.sort((a,b)=>Math.abs(a.wz+5)-Math.abs(b.wz+5));
  lampLights.forEach((l,i)=>{const c=cand[i];if(c){l.position.set(c.x,c.y,c.wz);l.color.set(c.L.col);l.intensity=c.L.i*(.85+.15*Math.sin(t*20+i*3));}else l.intensity=0;});
  plLight.position.set(pl.x,1.9,.9);plLight.intensity=dark*4+(pl.shootT>0?5:0);plLight.color.set(pl.shootT>0?0x9ffff0:0xffd8a8);
  updParticles(dt,dzTot);
  poseAra(dt);
  camYaw*=Math.pow(.004,dt);
  if((st==="menu"||st==="show")&&ARA.model){
    const face=st==='show'&&showMode==='face';
    if(st==='menu'||showMode==='orbit')showTheta+=dt*(st==='menu'?.22:.55);
    if(face&&!dragging)showTheta=lerp(showTheta,Math.sin(t*.5)*.45,Math.min(1,dt*1.5));
    const hy=araHeadY();
    const tr=face?.95:(st==='menu'?3.3:2.5),th=face?hy+.03:(st==='menu'?1.4:1.15),tl=face?hy-.01:(st==='menu'?.95:.88);
    const k=Math.min(1,dt*3);camR=lerp(camR,tr,k);camH=lerp(camH,th,k);camLY=lerp(camLY,tl,k);
    camera.position.set(Math.sin(showTheta)*camR,camH,-Math.cos(showTheta)*camR);camera.lookAt(0,camLY,0);
  }else{
    const cx=pl.x*.6,cy=2.45+pl.y*.25-slideK*.3;
    const ox=Math.sin(camYaw)*camZ,oz=Math.cos(camYaw)*camZ;
    const sh=shake?rnd(-1,1)*shake*.35:0;
    const gx=cx+ox+sh,gy=cy+sh,gz=oz,lx=cx-Math.sin(camYaw)*13*.9,ly=1.0,lz=-Math.cos(camYaw)*13;
    if(introT>0){introT=Math.max(0,introT-dt);const k=1-introT/INTRO,e=k*k*(3-2*k);
      const th=lerp(introTh0,Math.PI,e),r=lerp(introR0,camZ,e),h=lerp(introH0,gy,e);
      camera.position.set(Math.sin(th)*r+gx*e*0,h,-Math.cos(th)*r);camera.position.x+=cx*e;
      camera.lookAt(lerp(0,lx,e),lerp(introL0,ly,e),lerp(0,lz,e));
    }else{camera.position.set(gx,gy,gz);camera.lookAt(lx,ly,lz);}
    const tf=st==='play'?baseFov+(speed-16)*.35:baseFov;if(Math.abs(camera.fov-tf)>.05){camera.fov=lerp(camera.fov,tf,Math.min(1,dt*2));camera.updateProjectionMatrix();}
  }
  sky.position.copy(camera.position);
  for(const b of backdrops)b.position.set(camera.position.x*.9,0,0);
  sun.target.position.set(pl.x*.5,0,-6);sun.position.add(new THREE.Vector3(pl.x*.5,0,0));
}

// ================= HUD & flow =================
let lastS=-1,lastC=-1;
function hud(){
  if(score!==lastS){$('score').textContent=score;lastS=score;}
  if(coins!==lastC){$('coins').textContent='🪙 '+coins;lastC=coins;}
  $('meters').textContent=Math.floor(dist);$('best').textContent=Math.max(best,score);
  const sb=$('shieldbar'),mb=$('magbar');
  if(pl.shield>0){sb.style.display='block';$('shieldfill').style.width=(pl.shield/8*100)+'%';}else sb.style.display='none';
  if(pl.mag>0){mb.style.display='block';$('magfill').style.width=(pl.mag/8*100)+'%';}else mb.style.display='none';
}
function showOver(){
  $('overtitle').textContent=deathMsg;$('fscore').textContent=score;$('fdist').textContent=Math.floor(dist);$('fcoins').textContent=coins;$('fkills').textContent=kills;$('fbest').textContent=best;
  $('over').classList.remove('hidden');
}
function start(){
  if(st==='loading')return;
  initAudio();
  const fromShowcase=(st==='menu'||st==='show');
  if(fromShowcase){let th=((showTheta%(Math.PI*2))+Math.PI*3)%(Math.PI*2)-Math.PI;introTh0=th;introR0=camR;introH0=camH;introL0=camLY;introT=INTRO;}
  reset();st='play';lastS=lastC=-1;
  ['menu','over','pauseov','show'].forEach(id=>$(id).classList.add('hidden'));$('hud').classList.remove('hidden');toast(BI[0].name);
}
function toMenu(){st='menu';reset();layoutTiles(24);$('over').classList.add('hidden');$('show').classList.add('hidden');$('hud').classList.add('hidden');$('menu').classList.remove('hidden');}
function openShow(){if(st!=='menu')return;st='show';showMode='orbit';$('menu').classList.add('hidden');$('show').classList.remove('hidden');setShowMode('orbit');}
function setShowMode(m){showMode=m;if(m==='body')showTheta=0;document.querySelectorAll('#show [data-m]').forEach(b=>b.classList.toggle('on',b.dataset.m===m));}
$('showbtn').onclick=openShow;
$('showback').onclick=()=>{st='menu';$('show').classList.add('hidden');$('menu').classList.remove('hidden');};
document.querySelectorAll('#show [data-m]').forEach(b=>b.onclick=()=>setShowMode(b.dataset.m));
$('qbtn').onclick=()=>{qi=(qi+1)%QL.length;qUser=true;try{localStorage.setItem('gjt_q',qi);}catch(e){}applyQuality();buildTemplates();layoutTiles(24);};
$('helpbtn').onclick=()=>$('help').classList.toggle('hidden');
$('menubtn').onclick=()=>{if(overT<=0)toMenu();};
function pause(){if(st!=='play')return;st='pause';$('pauseov').classList.remove('hidden');}
function resume(){if(st!=='pause')return;st='play';$('pauseov').classList.add('hidden');last=performance.now();}
$('start').onclick=start;$('again').onclick=()=>{if(overT<=0)start();};
$('pause').onclick=e=>{e.stopPropagation();pause();};$('resume').onclick=resume;
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
document.addEventListener('backbutton',e=>{e.preventDefault();if(st==='play')pause();else if(st==='pause')resume();},false);

// ================= input =================
const cvs=renderer.domElement;let sx=null,sy=0,handled=false;
cvs.addEventListener('pointerdown',e=>{sx=e.clientX;sy=e.clientY;handled=false;if(st==='show'){dragging=true;if(showMode==='orbit')setShowMode('body');}});
cvs.addEventListener('pointermove',e=>{if(st==='show'&&dragging&&sx!==null){showTheta-=(e.clientX-sx)*.009;if(showMode==='face')showTheta=clamp(showTheta,-1.3,1.3);sx=e.clientX;return;}if(sx===null||handled)return;const dx=e.clientX-sx,dy=e.clientY-sy;if(Math.hypot(dx,dy)>26){handled=true;swipe(dx,dy);}});
cvs.addEventListener('pointerup',e=>{dragging=false;if(st==='show'){sx=null;return;}if(sx===null)return;if(!handled){const dx=e.clientX-sx,dy=e.clientY-sy;if(Math.hypot(dx,dy)<26)shoot();else swipe(dx,dy);}sx=null;});
cvs.addEventListener('pointercancel',()=>{sx=null;dragging=false;});
function swipe(dx,dy){if(Math.abs(dx)>Math.abs(dy))move(dx>0?1:-1);else if(dy<0)jump();else slide();}
addEventListener('keydown',e=>{
  const k=e.key;
  if(st==='menu'||st==='over'){if(k==='Enter'||k===' '){e.preventDefault();if(st==='menu'||overT<=0)start();}return;}
  if(st==='pause'){if(k==='Escape'||k==='p'||k==='Enter')resume();return;}
  if(k==='ArrowLeft'||k==='a')move(-1);else if(k==='ArrowRight'||k==='d')move(1);
  else if(k==='ArrowUp'||k==='w')jump();else if(k==='ArrowDown'||k==='s')slide();
  else if(k===' '||k==='f'){e.preventDefault();shoot();}else if(k==='Escape'||k==='p')pause();
});

// ================= boot =================
let last=performance.now();
function loop(now){
  const dt=Math.min(.1,Math.max(0,(now-last)/1000));last=now;
  renderer.info.reset();frame(dt);
  if(bloom.enabled)composer.render(dt);else renderer.render(scene,camera);
  if(st==='play'||st==='over')hud();
  trackFps(dt);if(st==='menu')benchmark(dt);
  requestAnimationFrame(loop);
}
(async()=>{
  applyQuality();
  let done=0;const total=8;const prog=()=>{done++;$('start').textContent='DUKE NGARKUAR… '+Math.round(done/total*100)+'%';};
  try{
    await buildTextures();prog();buildMaterials();
    await Promise.all([buildEnv(prog),buildAra(prog),loadWolf(prog)]);
    buildBackdrops();buildTemplates();buildTiles();buildParticles();layoutTiles(24);applyBiome(1,0,0);
    for(const on of[true,false]){lampLights.forEach(l=>l.visible=on);plLight.visible=on;renderer.compile(scene,camera);prewarmObs();}
    st='menu';$('start').disabled=false;$('start').textContent='VRAPO';
        requestAnimationFrame(loop);
  }catch(e){console.error(e);$('start').textContent='Gabim gjatë ngarkimit';$('err').textContent=String(e&&e.stack||e);}
})();
