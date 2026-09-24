'use strict';
const $=id=>document.getElementById(id);
const duration=15000;
const lines=[{at:0,who:'Felipe',text:'Achei o mapa da nossa próxima aventura!',f:1,l:1},{at:3800,who:'Laís',text:'Você sabe o caminho… ou vai perguntar ao mapa?',f:5,l:2},{at:7600,who:'Felipe',text:'Com você, até me perder vale a pena.',f:2,l:0},{at:11200,who:'Laís',text:'Então vem. Mas eu fico com o mapa!',f:3,l:3}];
let elapsed=0,playing=false,last=0,frame=0,current=-1,audio=null,music=true,noteAt=0,noteIndex=0,voices=[];
let resumeOnVisible=false;
const melody=[523.25,659.25,783.99,659.25,587.33,698.46,880,698.46,659.25,783.99,1046.5,783.99,587.33,659.25,523.25,0];
function pose(id,n){$(id).style.backgroundPosition=`${(n%3)*50}% ${Math.floor(n/3)*100}%`;}
function stopNotes(){voices.forEach(v=>{try{v.stop()}catch{}});voices=[];}
function note(){if(!music||!playing||!audio||audio.state!=='running')return;const now=audio.currentTime;if(now<noteAt)return;noteAt=now+.30;const frequency=melody[noteIndex++%melody.length];if(!frequency)return;const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.value=frequency;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.045,now+.015);gain.gain.exponentialRampToValueAtTime(.001,now+.27);osc.connect(gain).connect(audio.destination);osc.start(now);osc.stop(now+.29);voices.push(osc);osc.onended=()=>{voices=voices.filter(v=>v!==osc);osc.disconnect();gain.disconnect();};}
async function enableAudio(){try{const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return false;audio ||= new Context();await audio.resume();return audio.state==='running';}catch{return false;}}
function render(){const seconds=Math.min(15,Math.floor(elapsed/1000));$('clock').textContent=`0:${String(seconds).padStart(2,'0')} / 0:15`;$('progress').style.width=`${elapsed/duration*100}%`;document.querySelector('.progress').setAttribute('aria-valuenow',seconds);let i=lines.findLastIndex(l=>elapsed>=l.at);if(i!==current){current=i;const line=lines[i];$('speaker').textContent=line.who;$('line').textContent=line.text;$('speech').dataset.who=line.who;$('speech').classList.toggle('portrait-dialogue',i===3);pose('felipe',line.f);pose('lais',line.l);$('scene').classList.toggle('depart',i===3);}}
function tick(now){if(!playing)return;elapsed=Math.min(duration,elapsed+Math.max(0,now-last));last=now;render();note();if(elapsed>=duration){playing=false;$('ending').hidden=false;$('speech').hidden=true;$('pause').disabled=true;$('scene').classList.remove('depart');stopNotes();return;}frame=requestAnimationFrame(tick);}
function start(){resumeOnVisible=false; if(music)void enableAudio(); cancelAnimationFrame(frame);stopNotes();elapsed=0;current=-1;noteIndex=0;noteAt=0;playing=true;$('cover').hidden=true;$('ending').hidden=true;$('speech').hidden=false;$('pause').disabled=false;$('pause').innerHTML='Ⅱ <span>Pausar</span>';$('pause').setAttribute('aria-label','Pausar animação');$('scene').classList.remove('paused','depart');render();last=performance.now();frame=requestAnimationFrame(tick);if(music)void enableAudio();}
function pause(){if(elapsed>=duration||!$('cover').hidden)return;playing=!playing;$('scene').classList.toggle('paused',!playing);$('pause').innerHTML=playing?'Ⅱ <span>Pausar</span>':'▶ <span>Continuar</span>';$('pause').setAttribute('aria-label',playing?'Pausar animação':'Continuar animação');if(playing){last=performance.now();frame=requestAnimationFrame(tick);if(music)void enableAudio();}else{cancelAnimationFrame(frame);stopNotes();}}
$('start').onclick=start;$('replay').onclick=start;$('replay-end').onclick=start;$('pause').onclick=()=>{resumeOnVisible=false;pause();};
$('sound').onclick=async()=>{if(!music){music=await enableAudio();}else{music=false;stopNotes();}$('sound').setAttribute('aria-pressed',String(music));$('sound').innerHTML=`♫ <span>${music?'Som ligado':'Som desligado'}</span>`;};
// Resume an automatic background suspension, but never override a deliberate pause.
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){resumeOnVisible=playing;if(playing){pause();resumeOnVisible=true;}}
 else if(resumeOnVisible){resumeOnVisible=false;if(!playing&&elapsed<duration)pause();}
});
window.addEventListener('pageshow',()=>{last=performance.now();if(playing){cancelAnimationFrame(frame);frame=requestAnimationFrame(tick);}});

pose('felipe',0);pose('lais',0);

function buildWalk(id,parts){
 const ns='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 512 512');svg.classList.add('walk-rig');svg.setAttribute('aria-hidden','true');
 const defs=document.createElementNS(ns,'defs');svg.append(defs);
 const mask=document.createElementNS(ns,'mask');mask.id=id+'-body';mask.setAttribute('maskUnits','userSpaceOnUse');mask.innerHTML='<rect width="512" height="512" fill="white"/>';defs.append(mask);
 function texture(){const im=document.createElementNS(ns,'image');im.setAttribute('href','assets/'+id+'.webp');im.setAttribute('width','1536');im.setAttribute('height','1024');im.setAttribute('y','-512');return im;}
 const body=texture();body.setAttribute('mask','url(#'+mask.id+')');
 const groups=[];
 parts.forEach((part,i)=>{const clip=document.createElementNS(ns,'clipPath');clip.id=id+'-part-'+i;const polygon=document.createElementNS(ns,'polygon');polygon.setAttribute('points',part.points);clip.append(polygon);defs.append(clip);const cut=polygon.cloneNode();cut.setAttribute('fill','black');mask.append(cut);const g=document.createElementNS(ns,'g');g.classList.add('limb',part.kind);g.style.transformOrigin=part.origin;const image=texture();image.setAttribute('clip-path','url(#'+clip.id+')');g.append(image);groups.push(g);});
 groups.filter((g,i)=>parts[i].behind).forEach(g=>svg.append(g));svg.append(body);groups.filter((g,i)=>!parts[i].behind).forEach(g=>svg.append(g));$(id).append(svg);
}
buildWalk('felipe',[
 {kind:'leg-back',origin:'275px 260px',points:'257,235 295,257 269,320 230,400 226,438 238,463 212,486 140,475 140,440 191,352 234,290',behind:true},
 {kind:'leg-front',origin:'285px 250px',points:'277,237 312,236 332,308 369,379 413,425 457,427 462,477 365,497 327,428 283,362 248,299'},
 {kind:'arm-back',origin:'224px 146px',points:'190,180 237,185 222,235 220,276 210,312 174,310 171,270 181,218',behind:true},
 {kind:'arm-front',origin:'327px 152px',points:'321,178 350,167 380,204 423,235 441,260 420,278 384,256 346,228 325,210'}
]);
buildWalk('lais',[
 {kind:'hair-sway',origin:'331px 62px',points:'323,33 352,40 345,83 319,134 298,182 262,214 244,193 260,139 285,93',behind:true},
 {kind:'leg-back',origin:'362px 247px',points:'335,233 376,251 355,306 320,365 292,427 289,452 309,472 292,497 230,492 235,451 273,374 307,293',behind:true},
 {kind:'leg-front',origin:'375px 247px',points:'367,230 400,242 411,306 456,389 489,433 529,438 542,477 457,497 423,445 382,371 339,295'},
 {kind:'arm-back',origin:'337px 154px',points:'306,183 340,194 326,234 319,276 306,310 275,305 281,258 292,215',behind:true},
 {kind:'arm-front',origin:'412px 162px',points:'397,180 430,182 450,216 479,237 502,261 484,280 457,263 424,235 403,218'}
]);
