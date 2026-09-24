// Native locking is optional. The rotated game surface works even when the browser refuses it.
export class GameDisplay {
 constructor(surface,onResize){
  this.surface=surface;this.onResize=onResize;this.mode='auto';this.rotated=false;this.active=false;
  this.resize=()=>this.layout();window.addEventListener('resize',this.resize);
  window.visualViewport?.addEventListener('resize',this.resize);document.addEventListener('fullscreenchange',this.resize);
 }
 enter(){this.active=true;document.body.classList.add('playing');this.layout();}
 exit(){this.active=false;document.body.classList.remove('playing','game-rotated','game-compact');this.surface.classList.remove('landscape-rotated');this.rotated=false;try{screen.orientation?.unlock?.();}catch{}}
 async landscape(){
  this.mode='landscape';this.layout(); // Apply synchronously; never leave a non-working button on iPhone.
  try{
   if(screen.orientation?.lock){
    if(!document.fullscreenElement&&document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
    await screen.orientation.lock('landscape');
   }
  }catch{}finally{this.layout();}
 }
 portrait(){this.mode='portrait';try{screen.orientation?.unlock?.();}catch{}this.layout();}
 toggle(){if(this.mode==='landscape'&&this.rotated)this.portrait();else this.landscape();}
 layout(){
  if(!this.active)return;
  const view=window.visualViewport,w=Math.round(view?.width||innerWidth),h=Math.round(view?.height||innerHeight);
  const turn=this.mode==='landscape'&&h>w;this.rotated=turn;this.width=turn?h:w;this.height=turn?w:h;
  document.documentElement.style.setProperty('--game-w',this.width+'px');document.documentElement.style.setProperty('--game-h',this.height+'px');
  document.documentElement.style.setProperty('--screen-x',(view?.offsetLeft||0)+'px');document.documentElement.style.setProperty('--screen-y',(view?.offsetTop||0)+'px');
  document.documentElement.style.setProperty('--screen-w',w+'px');document.documentElement.style.setProperty('--screen-h',h+'px');
  this.surface.classList.toggle('landscape-rotated',turn);document.body.classList.toggle('game-rotated',turn);document.body.classList.toggle('game-compact',this.height<=500);
  const blocked=h>w&&this.mode==='auto';document.getElementById('rotate').classList.toggle('hidden',!blocked);
  const button=document.getElementById('rotate-screen');button.textContent=turn?'↶':'↻';button.setAttribute('aria-label',turn?'Вернуть вертикальный режим':'Повернуть игру горизонтально');button.setAttribute('aria-pressed',String(turn||w>h));
  this.onResize?.({width:this.width,height:this.height,blocked,rotated:turn});
 }
}
