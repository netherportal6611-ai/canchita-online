'use strict';
const OriginalRules=require('./original.cjs');
// Server-owned simulation. Clients submit controls, never positions or scores.
const field={l:80,r:1230,t:60,b:685},goal={top:286,bottom:459},cy=372.5,cx=655;
const stats={forward:{shot:1.2,charge:.75,base:1,drain:1},midfield:{shot:1,charge:1,base:1,drain:1},defender:{shot:1,charge:1,base:1.1,drain:1},goalkeeper:{shot:.9,charge:1.3,base:1.15,drain:1/.7}};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const unit=(x,y,fallback={x:1,y:0})=>{const n=Math.hypot(x,y);return n>.001?{x:x/n,y:y/n}:fallback;};
function player(id,profile,team){return {id,name:profile.name,number:profile.number,classId:profile.classId,team,ready:false,connected:true,x:0,y:cy,r:17,vx:0,vy:0,dx:team===1?1:-1,dy:0,mx:team===1?1:-1,my:0,stamina:1,regen:0,exhausted:false,dash:0,stretch:false,dashX:1,dashY:0,targetY:cy,cooldown:0,ability:0,wallArmed:0,wallBoost:0,firstTouch:0,receiveAt:-99,receiveFast:false,charge:0,charging:false,input:{x:0,y:0,ax:cx,ay:cy,sprint:false,charging:false},inputAt:0,actions:[]};}
function periodDuration(room){return room.overtime||!room.settings.duration?Infinity:room.settings.duration;}
function goalLimitReached(room){return room.settings.goalLimit>0&&Math.max(...room.score)>=room.settings.goalLimit;}
function start(room){room.settings=OriginalRules.settings(room.settings);room.overtime=false;room.score=[0,0];room.clock=0;room.phase='playing';room.events=[];room.eventId=0;room.history=[];room.replay=null;room.matchId=(room.matchId||0)+1;room.half=1;room.periodElapsed=0;room.halftimeRemaining=0;room.goalLog=[];room.result=null;for(const p of room.players){p.matchStats={goals:0,assists:0,steals:0,saves:0,ownGoals:0};p.rematchReady=false;}reset(room);}
function attacksRight(room,team){return (team===1)===(room.half!==2);}
function finish(room){
 room.phase='finished';room.replay=null;
 const players=room.players.map(p=>{const s=p.matchStats||{goals:0,assists:0,steals:0,saves:0,ownGoals:0};return {id:p.id,name:p.name,number:p.number,team:p.team,...s,points:s.goals*5+s.assists*3+s.steals+s.saves-s.ownGoals*2};});
 const best=Math.max(0,...players.map(p=>p.points));room.result={id:room.matchId,score:[...room.score],winner:room.score[0]===room.score[1]?0:room.score[0]>room.score[1]?1:2,players,mvps:best>0?players.filter(p=>p.points===best):[],goals:room.goalLog.slice()};
 for(const p of room.players){p.actions=[];p.charging=false;p.charge=0;p.vx=0;p.vy=0;}event(room,'finished');
}
function endPeriod(room){const periods=room.settings.periods;if(room.half<periods){room.phase='halftime';room.halftimeRemaining=0;room.replay=null;for(const p of room.players){p.halftimeReady=false;p.actions=[];p.charging=false;p.charge=0;p.vx=0;p.vy=0;}event(room,'halftime');}else if(room.settings.goldenGoal&&room.score[0]===room.score[1]){room.overtime=true;room.periodElapsed=0;room.phase='playing';reset(room);event(room,'goldenGoal');}else finish(room);}
function resumeHalf(room){if(room.phase!=='halftime')return;room.half++;room.periodElapsed=0;room.phase='playing';reset(room);event(room,'secondHalf');}
function reset(room){
 const original=room.mode==='original',field=original?OriginalRules.field:module.exports.field,cx=(field.l+field.r)/2,cy=(field.t+field.b)/2;
 room.roundId=(room.roundId||0)+1;
 room.ball={x:cx,y:cy,r:9,vx:0,vy:0,spin:0,owner:null,lastKickTime:0,lastPasserId:null,lastPasserTeam:0,lastPasserClass:null,lastTouchId:null,assistId:null,curve:null};
 for(const team of [1,2]){const members=room.players.filter(p=>p.team===team);members.forEach((p,i)=>{const dir=attacksRight(room,team)?1:-1;p.x=cx-dir*235;p.y=cy+(i-(members.length-1)/2)*125;if(!original&&p.classId==='goalkeeper')p.x=dir>0?field.l+55:field.r-55;Object.assign(p,{vx:0,vy:0,dx:dir,dy:0,mx:dir,my:0,stamina:1,regen:0,dash:0,dashGhost:0,stretch:false,charging:false,charge:0,cooldown:0,ability:0,wallArmed:0,wallBoost:0,firstTouch:0,exhausted:false,input:{x:0,y:0,ax:cx,ay:cy,sprint:false,charging:false},actions:[]});});}
 room.kickoff=1;room.history=[];
}
function event(room,type,data={}){room.events.push({id:++room.eventId,t:room.clock,type,...data});if(room.events.length>48)room.events.shift();}
function inside(p){return p.y>=cy-142&&p.y<=cy+142&&(p.x<=field.l+145||p.x>=field.r-145);}
function release(room,p,speed,dir,target,bend=0){
 const b=room.ball,d=unit(dir.x,dir.y);b.owner=null;b.vx=d.x*speed+p.vx*.25;b.vy=d.y*speed+p.vy*.25;b.lastKickTime=room.clock;b.lastPasserId=p.id;b.lastPasserTeam=p.team;b.lastPasserClass=p.classId;b.lastTouchId=p.id;b.curve=null;b.spin=0;
 if(target){b.curve={sx:b.x,sy:b.y,ex:target.x,ey:target.y,cx:(b.x+target.x)/2,cy:(b.y+target.y)/2-bend*140*(p.classId==='forward'?1.1:1),t:0,speed};const d0=unit(b.curve.cx-b.x,b.curve.cy-b.y);b.vx=d0.x*speed;b.vy=d0.y*speed;}
 p.cooldown=.38;p.charging=false;p.charge=0;event(room,'kick',{volume:p.classId==='defender'?.28:.22,rate:.98});
}
function action(room,p,a){
 const b=room.ball,s=stats[p.classId],dir=unit(p.input.ax-p.x,p.input.ay-p.y,{x:p.dx,y:p.dy});
 if(a==='dash'&&p.dash<=0&&p.stamina>=s.drain/3){p.stamina-=s.drain/3;p.regen=.55;p.stretch=p.classId==='goalkeeper'&&inside(p);p.targetY=clamp(b.y,field.t+p.r,field.b-p.r);const d=unit(p.input.x,p.input.y,{x:p.mx,y:p.my});p.dashX=p.stretch?0:d.x;p.dashY=p.stretch?Math.sign(p.targetY-p.y):d.y;p.dash=p.classId==='goalkeeper'?.2325:.155;p.dashGhost=p.dash+.12;}
 if(a==='ability'&&p.ability<=0&&b.owner===p.id){
  if(p.classId==='defender'){let best=null,bestScore=-Infinity;for(const mate of room.players){if(mate.id===p.id||mate.team!==p.team||!mate.connected)continue;const x=mate.x-p.x,y=mate.y-p.y,n=Math.hypot(x,y),dot=(x*dir.x+y*dir.y)/(n||1),quality=dot*2-Math.min(n,1000)*.00025;if(dot>=.5&&quality>bestScore){best=mate;bestScore=quality;}}release(room,p,1090*1.4,best?{x:best.x-p.x,y:best.y-p.y}:dir);p.ability=3;}
  if(p.classId==='midfield'){p.wallArmed=3;p.ability=8;}
 }
 if(a==='pass'){
  const vx=b.vx,vy=b.vy,v2=vx*vx+vy*vy,px=p.x-b.x,py=p.y-b.y,t=v2?(px*vx+py*vy)/v2:99;
  const near=v2>=14400&&t>=-.02&&t<=.2&&Math.hypot(px-vx*Math.max(0,t),py-vy*Math.max(0,t))<=p.r+b.r+14;
  if(p.classId==='forward'&&p.firstTouch<=0&&((b.owner===p.id&&p.receiveFast&&room.clock-p.receiveAt<=.18)||(!b.owner&&near))){release(room,p,(240+.9*850)*s.shot,dir,{x:b.x+dir.x*730,y:b.y+dir.y*730},b.y<cy?.6:-.6);p.firstTouch=3;}
  else if(b.owner===p.id){if(p.wallArmed>0){p.wallArmed=0;p.wallBoost=1.5;}release(room,p,495*s.shot,dir);}
 }
 if(a==='shoot'&&b.owner===p.id&&p.charging){const target=p.target||{x:p.input.ax,y:p.input.ay};release(room,p,(240+p.charge*850)*s.shot*(1-.15*Math.abs(p.input.bend||0)),dir,target,p.input.bend||0);}
}
function rounded(p){const out={};for(const key of ['id','name','number','classId','team','connected','x','y','r','vx','vy','dx','dy','stamina','dash','stretch','ability','wallArmed','wallBoost','firstTouch','receiveAt','receiveFast','charge','charging','kicking'])out[key]=typeof p[key]==='number'?Math.round(p[key]*1000)/1000:p[key];return out;}
function snapshot(room){const b=room.ball;return {mode:room.mode||'normal',field:room.mode==='original'?OriginalRules.field:field,goal:room.mode==='original'?OriginalRules.goal:goal,t:room.clock,players:room.players.map(rounded),ball:{x:b.x,y:b.y,r:9,vx:b.vx,vy:b.vy,owner:b.owner,lastKickTime:b.lastKickTime},score:[...room.score],phase:room.phase,kickoff:room.kickoff,roundId:room.roundId,replay:room.replay?{id:room.replay.id,scorerId:room.replay.scorerId,elapsed:room.replay.elapsed}:null,match:{id:room.matchId,half:room.half,remaining:Number.isFinite(periodDuration(room))?Math.max(0,periodDuration(room)-room.periodElapsed):null,elapsed:room.periodElapsed,unlimited:!Number.isFinite(periodDuration(room)),overtime:Boolean(room.overtime),periods:room.settings.periods,goalLimit:room.settings.goalLimit,intermission:room.halftimeRemaining||0,ready:room.phase==='halftime'?room.players.filter(p=>p.halftimeReady).map(p=>p.id):[],goals:room.phase==='halftime'?room.goalLog:[]},result:room.phase==='finished'?room.result:null};}
function scoreGoal(room,team){
 const scorer=room.players.find(p=>p.id===(room.ball.owner||room.ball.lastTouchId||room.ball.lastPasserId)),ownGoal=Boolean(scorer&&scorer.team!==team);
 if(scorer){scorer.matchStats[ownGoal?'ownGoals':'goals']++;const assist=room.players.find(p=>p.id===room.ball.assistId&&p.id!==scorer.id&&p.team===team);if(assist&&!ownGoal)assist.matchStats.assists++;}
 room.goalLog.push({team,id:scorer?.id||null,name:scorer?.name||'SIN AUTOR',number:scorer?.number||0,ownGoal,half:room.half,overtime:Boolean(room.overtime),second:Math.floor(room.periodElapsed)});
 room.score[team-1]++;room.phase='replay';room.history.push(snapshot(room));
 const frames=room.history.slice(),from=frames[0]?.t||room.clock,to=room.clock,slowStart=Math.max(from,room.ball.lastKickTime-.5);
 room.replay={id:room.matchId+':'+room.goalLog.length,scorerId:scorer?.id||null,frames,from,to,slowStart,elapsed:0,duration:Math.max(0,slowStart-from)+(to-Math.max(from,slowStart))/.6+.8};
 event(room,'goal',{team,score:room.score});
 for(const p of room.players){p.actions=[];p.charging=false;}
 if(!room.settings.replays)finishReplay(room);
}
function finishReplay(room){if(room.phase!=='replay')return;room.replay=null;if(goalLimitReached(room)||(room.overtime&&room.score[0]!==room.score[1]))finish(room);else if(room.periodElapsed>=periodDuration(room))endPeriod(room);else{room.phase='playing';reset(room);event(room,'kickoff');}}
function step(room,dt){
 if(room.phase==='halftime')return;
 if(room.phase==='replay'){room.replay.elapsed+=dt;if(room.replay.elapsed>=room.replay.duration)finishReplay(room);return;}
 if(room.phase!=='playing')return;
 if(room.mode==='original'){OriginalRules.step(room,dt,{event,snapshot,scoreGoal,endPeriod,periodDuration:periodDuration(room)});return;}
 room.clock+=dt;room.kickoff=Math.max(0,room.kickoff-dt);
 if(!room.kickoff)room.periodElapsed=Math.min(periodDuration(room),room.periodElapsed+dt);
 const active=room.players.filter(p=>p.connected),b=room.ball;
 for(const p of active){
  const s=stats[p.classId];p.previousX=p.x;p.previousY=p.y;p.dashGhost=Math.max(0,(p.dashGhost||0)-dt);for(const k of ['regen','cooldown','ability','wallArmed','wallBoost','firstTouch'])p[k]=Math.max(0,p[k]-dt);
  if(Date.now()-p.inputAt>750)p.input={x:0,y:0,ax:p.x+p.dx*270,ay:p.y+p.dy*270,sprint:false,charging:false};
  if(room.kickoff>0){p.actions=[];continue;}
  if(p.input.charging&&b.owner===p.id&&!p.charging){p.charging=true;p.target={x:p.input.ax,y:p.input.ay};p.charge=0;}
  for(const a of p.actions.splice(0))action(room,p,a);
  if(!p.input.charging&&!p.actions.includes('shoot')&&p.charging){p.charging=false;p.charge=0;}
  if(p.charging&&b.owner===p.id)p.charge=clamp(p.charge+dt/(.7*s.charge),0,1);
  const n=Math.hypot(p.input.x,p.input.y),x=p.input.x/Math.max(1,n),y=p.input.y/Math.max(1,n);if(n>.1){p.mx=x/n;p.my=y/n;}
  if(p.exhausted&&p.stamina>=.28)p.exhausted=false;
  const sprint=p.input.sprint&&!p.exhausted&&p.stamina>0&&n>.1&&p.dash<=0;
  if(sprint){p.stamina=Math.max(0,p.stamina-dt/4*s.drain);p.regen=.55;if(!p.stamina)p.exhausted=true;}else if(!p.regen)p.stamina=Math.min(1,p.stamina+dt/3.6);
  p.dashingThisStep=p.dash>0;
  if(p.dash>0){p.dash=Math.max(0,p.dash-dt);if(p.stretch){const delta=p.targetY-p.y,dy=Math.sign(delta)*Math.min(Math.abs(delta),675*dt);p.vx=0;p.vy=dy/dt;if(Math.abs(delta)<=675*dt){p.y=p.targetY;p.dash=0;p.vy=0;}}else{p.vx=p.dashX*675;p.vy=p.dashY*675;}}
  else{p.stretch=false;const speed=(p.charging?160:245)*(p.classId==='defender'&&sprint?1:s.base)*(sprint?1.25*(p.classId==='midfield'?1.25:1):1)*(p.wallBoost>0?1.3:1),blend=1-Math.exp(-18*dt);p.vx+=(x*speed-p.vx)*blend;p.vy+=(y*speed-p.vy)*blend;}
  p.x=clamp(p.x+p.vx*dt,field.l+p.r,field.r-p.r);p.y=clamp(p.y+p.vy*dt,field.t+p.r,field.b-p.r);
  const aim=p.charging?p.target:{x:p.input.ax,y:p.input.ay},d=unit(aim.x-p.x,aim.y-p.y,{x:p.dx,y:p.dy});p.dx=d.x;p.dy=d.y;
 }
 // Dash crosses an opponent's body and transfers possession at contact.
 let carrier=active.find(p=>p.id===b.owner);
 for(const p of active){if(!carrier||p.team===carrier.team||!p.dashingThisStep||p.cooldown>0)continue;const vx=p.x-p.previousX,vy=p.y-p.previousY,v2=vx*vx+vy*vy,t=v2?clamp(((carrier.x-p.previousX)*vx+(carrier.y-p.previousY)*vy)/v2,0,1):0;if(Math.hypot(carrier.x-(p.previousX+vx*t),carrier.y-(p.previousY+vy*t))<=p.r+carrier.r+3){carrier.cooldown=.55;carrier.charging=false;carrier.charge=0;p.matchStats.steals++;p.cooldown=0;b.owner=p.id;b.lastTouchId=p.id;b.assistId=null;b.curve=null;b.vx=0;b.vy=0;b.x=p.x+p.dx*29;b.y=clamp(p.y+p.dy*29,field.t+9,field.b-9);carrier=p;event(room,'steal',{playerId:p.id});}}
 for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){const a=active[i],p=active[j];if(a.team!==p.team&&(a.dashGhost>0||p.dashGhost>0))continue;const dx=p.x-a.x,dy=p.y-a.y,d=Math.hypot(dx,dy),min=a.r+p.r;if(d<min){const nx=d?dx/d:1,ny=d?dy/d:0,shift=(min-d)/2;a.x=clamp(a.x-nx*shift,field.l+a.r,field.r-a.r);a.y=clamp(a.y-ny*shift,field.t+a.r,field.b-a.r);p.x=clamp(p.x+nx*shift,field.l+p.r,field.r-p.r);p.y=clamp(p.y+ny*shift,field.t+p.r,field.b-p.r);}}
 let owner=active.find(p=>p.id===b.owner);if(!owner)b.owner=null;
 if(owner){const follow=1-Math.exp(-15*dt);b.x+=(owner.x+owner.dx*29-b.x)*follow;b.y+=(clamp(owner.y+owner.dy*29,field.t+9,field.b-9)-b.y)*follow;b.vx=0;b.vy=0;}
 else if(!room.kickoff){
  if(b.curve){const q=b.curve,dx=2*((1-q.t)*(q.cx-q.sx)+q.t*(q.ex-q.cx)),dy=2*((1-q.t)*(q.cy-q.sy)+q.t*(q.ey-q.cy));q.t=Math.min(1,q.t+q.speed*dt/Math.max(30,Math.hypot(dx,dy)));const t=q.t;b.x=(1-t)**2*q.sx+2*(1-t)*t*q.cx+t*t*q.ex;b.y=(1-t)**2*q.sy+2*(1-t)*t*q.cy+t*t*q.ey;const d=unit(2*((1-t)*(q.cx-q.sx)+t*(q.ex-q.cx)),2*((1-t)*(q.cy-q.sy)+t*(q.ey-q.cy)));b.vx=d.x*q.speed;b.vy=d.y*q.speed;if(t===1)b.curve=null;
  }else{b.x+=b.vx*dt;b.y+=b.vy*dt;b.vx*=Math.exp(-.58*dt);b.vy*=Math.exp(-.58*dt);}
 }
 function bounce(speed,rate){if(room.clock-(room.lastBounce||-99)<.095||speed<150)return;room.lastBounce=room.clock;event(room,'bounce',{volume:.015+clamp((speed-100)/850,0,1)*.215,rate});}
 if(b.y<field.t+9||b.y>field.b-9){bounce(Math.abs(b.vy),.96);b.y=clamp(b.y,field.t+9,field.b-9);b.vy=(b.y===field.t+9?1:-1)*Math.abs(b.vy)*.78;b.curve=null;}
 for(const post of [{x:field.l,y:goal.top},{x:field.l,y:goal.bottom},{x:field.r,y:goal.top},{x:field.r,y:goal.bottom}]){const dx=b.x-post.x,dy=b.y-post.y,d=Math.hypot(dx,dy);if(d<14){const nx=d?dx/d:1,ny=d?dy/d:0,dot=b.vx*nx+b.vy*ny;b.x=post.x+nx*14;b.y=post.y+ny*14;if(dot<0){bounce(-dot,1);b.vx-=1.8*dot*nx;b.vy-=1.8*dot*ny;b.curve=null;}}}
 const mouth=b.y>goal.top+9&&b.y<goal.bottom-9;
 if(mouth&&(b.x>field.r+9||b.x<field.l-9)){scoreGoal(room,(b.x>field.r)===(room.half!==2)?1:2);return;}
 if(!mouth&&(b.x<field.l+9||b.x>field.r-9)){bounce(Math.abs(b.vx),1);b.x=clamp(b.x,field.l+9,field.r-9);b.vx=(b.x===field.l+9?1:-1)*Math.abs(b.vx)*.8;b.curve=null;}
 // Nearest eligible player wins a loose ball. Dash tackles dislodge possession.
 if(!room.kickoff){
  let candidate=null,best=Infinity;
  for(const p of active){if(p.cooldown>0||p.id===b.owner)continue;const distance=Math.hypot(p.x-b.x,p.y-b.y),bonus=b.lastPasserClass==='midfield'&&b.lastPasserTeam===p.team&&b.lastPasserId!==p.id?1.25:1,reach=(p.r+9+12)*bonus+(p.stretch&&p.dash>0?16:0);if(owner&&(!(p.dash>0)||p.team===owner.team))continue;if(distance<reach&&distance<best){candidate=p;best=distance;}}
  if(candidate){if(owner){owner.cooldown=.55;owner.charging=false;owner.charge=0;candidate.matchStats.steals++;b.assistId=null;}else{b.assistId=b.lastPasserTeam===candidate.team&&b.lastPasserId!==candidate.id&&room.clock-b.lastKickTime<8?b.lastPasserId:null;if(candidate.classId==='goalkeeper'&&b.lastPasserTeam&&b.lastPasserTeam!==candidate.team&&Math.hypot(b.vx,b.vy)>120)candidate.matchStats.saves++;}candidate.receiveFast=Math.hypot(b.vx,b.vy)>120;candidate.receiveAt=room.clock;b.owner=candidate.id;b.lastTouchId=candidate.id;b.curve=null;b.vx=0;b.vy=0;}
 }
 if(!room.history.length||room.clock-room.history[room.history.length-1].t>=1/20-1e-6){room.history.push(snapshot(room));while(room.history.length>2&&room.history[1].t<room.clock-7)room.history.shift();}
 if(room.periodElapsed>=periodDuration(room))endPeriod(room);
}
module.exports={settings:OriginalRules.settings,field,goal,stats,player,start,resumeHalf,finishReplay,reset,step,snapshot,action,scoreGoal};
