// Disc contact, damping and radial kicks, following the HaxBall stadium physics model.
// Reference: https://github.com/haxball/haxball-issues/wiki/Stadium-(.hbs)-File
const OriginalRules=(()=>{
 const field={l:80,r:1805,t:60,b:997.5},cx=(field.l+field.r)/2,cy=(field.t+field.b)/2,goal={top:cy-129.75,bottom:cy+129.75,depth:48};
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function settings(value={}){const raw=value&&typeof value==='object'&&!Array.isArray(value)?value:{},number=(key,fallback,min,max,step=1)=>typeof raw[key]==='number'&&Number.isFinite(raw[key])?clamp(Math.round(raw[key]/step)*step,min,max):fallback;return {duration:number('duration',60,0,1800,30),periods:number('periods',2,1,2),goalLimit:number('goalLimit',0,0,50),replays:typeof raw.replays==='boolean'?raw.replays:true,goldenGoal:typeof raw.goldenGoal==='boolean'?raw.goldenGoal:false};}

 function move(p,input,dt){const n=Math.max(1,Math.hypot(input.x,input.y)),speed=input.kick?205:280,ease=1-Math.exp(-12*dt);p.vx+=(input.x/n*speed-p.vx)*ease;p.vy+=(input.y/n*speed-p.vy)*ease;p.x=clamp(p.x+p.vx*dt,field.l+p.r,field.r-p.r);p.y=clamp(p.y+p.vy*dt,field.t+p.r,field.b-p.r);if(Math.hypot(input.x,input.y)>.1){const size=Math.hypot(input.x,input.y);p.dx=input.x/size;p.dy=input.y/size;}p.kicking=Boolean(input.kick);}
 function touch(room,p,impact){const b=room.ball,old=room.players.find(q=>q.id===b.lastTouchId);if(old&&old.id!==p.id&&old.team===p.team&&room.clock-b.lastKickTime<8)b.assistId=old.id;else if(old?.team!==p.team)b.assistId=null;if(old&&old.team!==p.team&&impact>35)p.matchStats.steals++;b.lastTouchId=p.id;}
 function kick(room,p,event){const b=room.ball,dx=b.x-p.x,dy=b.y-p.y,d=Math.hypot(dx,dy);if(room.kickoff>0||p.cooldown>0||d>p.r+b.r+7)return false;const nx=d>.001?dx/d:p.dx,ny=d>.001?dy/d:p.dy;touch(room,p,0);b.vx+=nx*620+p.vx*.18;b.vy+=ny*620+p.vy*.18;const speed=Math.hypot(b.vx,b.vy);if(speed>1000){b.vx*=1000/speed;b.vy*=1000/speed;}b.lastKickTime=room.clock;b.lastPasserId=p.id;b.lastPasserTeam=p.team;b.owner=null;p.cooldown=.16;event(room,'kick',{volume:.22,rate:1});return true;}
 function step(room,dt,api){
  const duration=api.periodDuration??60;room.clock+=dt;room.kickoff=Math.max(0,room.kickoff-dt);if(!room.kickoff)room.periodElapsed=Math.min(duration,room.periodElapsed+dt);
  const active=room.players.filter(p=>p.connected),b=room.ball;b.owner=null;b.curve=null;
  for(const p of active){if(p.practiceKeeper){const right=(p.team===2)===(room.half%2===1),guardX=right?field.r-45:field.l+45,incoming=right?b.vx>30:b.vx< -30,arrival=incoming?clamp((guardX-b.x)/b.vx,0,.45):0,targetY=clamp(b.y+b.vy*arrival,goal.top+p.r*.5,goal.bottom-p.r*.5);p.input={x:clamp((guardX-p.x)/45,-1,1),y:clamp((targetY-p.y)/45,-1,1),kick:false};p.inputAt=Date.now();p.actions=[];}p.cooldown=Math.max(0,p.cooldown-dt);p.stamina=1;p.dash=0;p.stretch=false;p.charging=false;p.charge=0;if(Date.now()-p.inputAt>750)p.input={x:0,y:0,kick:false};const requested=p.actions.splice(0).some(a=>['kick','shoot','pass'].includes(a));if(room.kickoff>0){p.vx=p.vy=0;p.kicking=false;continue;}move(p,p.input,dt);if(requested||p.input.kick)kick(room,p,api.event);}
  for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){const a=active[i],p=active[j],dx=p.x-a.x,dy=p.y-a.y,d=Math.hypot(dx,dy),radius=a.r+p.r;if(d<radius){const nx=d?dx/d:1,ny=d?dy/d:0,shift=(radius-d)/2;a.x=clamp(a.x-nx*shift,field.l+a.r,field.r-a.r);a.y=clamp(a.y-ny*shift,field.t+a.r,field.b-a.r);p.x=clamp(p.x+nx*shift,field.l+p.r,field.r-p.r);p.y=clamp(p.y+ny*shift,field.t+p.r,field.b-p.r);const speed=(p.vx-a.vx)*nx+(p.vy-a.vy)*ny;if(speed<0){const impulse=-speed*.6;a.vx-=nx*impulse;a.vy-=ny*impulse;p.vx+=nx*impulse;p.vy+=ny*impulse;}}}
  if(!room.kickoff){b.x+=b.vx*dt;b.y+=b.vy*dt;const damping=Math.exp(-.6*dt);b.vx*=damping;b.vy*=damping;
   for(const p of active){const dx=b.x-p.x,dy=b.y-p.y,d=Math.hypot(dx,dy),radius=p.r+b.r;if(d<radius){const speed=Math.hypot(p.vx,p.vy),nx=d>.001?dx/d:speed>0?p.vx/speed:p.dx,ny=d>.001?dy/d:speed>0?p.vy/speed:p.dy,depth=radius-d;b.x+=nx*depth*.85;b.y+=ny*depth*.85;p.x=clamp(p.x-nx*depth*.15,field.l+p.r,field.r-p.r);p.y=clamp(p.y-ny*depth*.15,field.t+p.r,field.b-p.r);const impact=(b.vx-p.vx)*nx+(b.vy-p.vy)*ny;if(impact<0){const impulse=-impact*1.45/1.15;b.vx+=nx*impulse;b.vy+=ny*impulse;p.vx-=nx*impulse*.15;p.vy-=ny*impulse*.15;}if(p.practiceKeeper&&impact< -120&&room.players.find(q=>q.id===b.lastTouchId)?.team!==p.team)p.matchStats.saves++;touch(room,p,-impact);if(p.input.kick)kick(room,p,api.event);}}
  }
  const bounce=(speed)=>{if(speed<120||room.clock-(room.lastBounce??-99)<.095)return;room.lastBounce=room.clock;api.event(room,'bounce',{volume:.015+clamp((speed-100)/850,0,1)*.215,rate:1});};
  if(b.y<field.t+b.r||b.y>field.b-b.r){bounce(Math.abs(b.vy));b.y=clamp(b.y,field.t+b.r,field.b-b.r);b.vy=(b.y===field.t+b.r?1:-1)*Math.abs(b.vy)*.82;}
  for(const post of [{x:field.l,y:goal.top},{x:field.l,y:goal.bottom},{x:field.r,y:goal.top},{x:field.r,y:goal.bottom}]){const dx=b.x-post.x,dy=b.y-post.y,d=Math.hypot(dx,dy),radius=b.r+5;if(d<radius){const nx=d?dx/d:1,ny=d?dy/d:0,dot=b.vx*nx+b.vy*ny;b.x=post.x+nx*radius;b.y=post.y+ny*radius;if(dot<0){bounce(-dot);b.vx-=1.85*dot*nx;b.vy-=1.85*dot*ny;}}}
  const mouth=b.y>goal.top+b.r&&b.y<goal.bottom-b.r;if(mouth&&(b.x>field.r+b.r||b.x<field.l-b.r)){api.scoreGoal(room,(b.x>field.r)===(room.half!==2)?1:2);return;}
  if(!mouth&&(b.x<field.l+b.r||b.x>field.r-b.r)){bounce(Math.abs(b.vx));b.x=clamp(b.x,field.l+b.r,field.r-b.r);b.vx=(b.x===field.l+b.r?1:-1)*Math.abs(b.vx)*.82;}
  if(!room.history.length||room.clock-room.history.at(-1).t>=1/20-1e-6){room.history.push(api.snapshot(room));while(room.history.length>2&&room.history[1].t<room.clock-7)room.history.shift();}
  if(room.periodElapsed>=duration)api.endPeriod(room);
 }
 return {field,goal,cx,cy,move,step,settings};
})();

module.exports=OriginalRules;
