const {test}=require('node:test'),assert=require('node:assert/strict'),{WebSocket}=require('ws');
const {createServer}=require('../server.cjs'),physics=require('../physics.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=3500){const end=Date.now()+timeout;while(Date.now()<end){const result=fn();if(result)return result;await sleep(10);}throw Error('Timed out');}
async function client(url){const ws=new WebSocket(url),messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return {ws,messages,send:m=>ws.send(JSON.stringify(m)),wait:type=>until(()=>messages.find(m=>m.type===type)),last:type=>messages.filter(m=>m.type===type).at(-1)};}
const profile={version:1,name:'Prueba',number:10,classId:'midfield',password:'test-secret'};
test('private rooms, authorization, real movement, reconnect, six players',async t=>{
 const app=createServer();app.server.listen(0,'127.0.0.1');await new Promise(r=>app.server.once('listening',r));const url='ws://127.0.0.1:'+app.server.address().port+'/ws',clients=[];
 t.after(async()=>{for(const c of clients)c.ws.terminate();await app.close();});
 const connect=async()=>{const c=await client(url);clients.push(c);return c;};
 const a=await connect();a.send({...profile,type:'create',size:1,kit:'river'});const joined=await a.wait('joined'),code=joined.room.code;assert.match(code,/^[A-HJ-NP-Z2-9]{4}$/);assert.equal(joined.room.kits[1],'river');assert.equal('password' in joined.room,false);assert.equal('token' in joined.room.players[0],false);
 const wrong=await connect();wrong.send({...profile,type:'join',code,password:'wrong'});assert.match((await wrong.wait('error')).message,/incorrectos/);
 const b=await connect();b.send({...profile,type:'join',name:'Segundo',number:7,code});const bjoin=await b.wait('joined');assert.equal(bjoin.room.players.length,2);assert.equal(bjoin.room.players[1].team,2);
 b.send({type:'kit',team:1,kit:'boca'});b.send({type:'size',size:3});await sleep(60);assert.equal(app.rooms.get(code).kits[1],'river');assert.equal(app.rooms.get(code).size,1);
 const full=await connect();full.send({...profile,type:'join',code});assert.match((await full.wait('error')).message,/llena/);
 a.send({type:'start'});assert.match((await a.wait('error')).message,/listos/);
 a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await until(()=>app.rooms.get(code).players.every(p=>p.ready));a.send({type:'start'});await Promise.all([a.wait('started'),b.wait('started')]);const room=app.rooms.get(code),p=room.players[0],x=p.x;room.kickoff=0;
 const control={type:'input',x:1,y:0,ax:1000,ay:372.5,bend:0,sprint:false,charging:false,actions:[]};a.send(control);await sleep(240);assert.ok(p.x>x+25);assert.equal(b.last('state').state.players.find(p=>p.id===joined.id).x> x,true);
 const stableScore=room.score.slice();a.send({type:'input',x:NaN,y:0,ax:Infinity,ay:0,bend:0});a.send({type:'score',score:[999,0]});await sleep(30);assert.deepEqual(room.score,stableScore);assert.ok(Number.isFinite(p.x));
 // Charge/release goes through the real controls, rather than accepting a client shot power.
 room.ball.owner=p.id;room.ball.x=p.x+29;room.ball.y=p.y;a.send({...control,x:0,charging:true});await sleep(160);assert.ok(p.charge>.1);a.send({...control,x:0,charging:false,actions:['shoot']});await until(()=>room.events.some(e=>e.type==='kick'));assert.equal(room.ball.owner,null);assert.ok(room.ball.vx>240);
 b.ws.terminate();await until(()=>room.paused);const before=room.clock;await sleep(70);assert.equal(room.clock,before);
 const restored=await connect();restored.send({type:'reconnect',version:1,code,token:bjoin.token});assert.equal((await restored.wait('joined')).id,bjoin.id);await until(()=>!room.paused);assert.equal(room.players.length,2);
 a.send({type:'return'});await a.wait('returned');assert.equal(room.phase,'lobby');a.send({type:'size',size:3});await until(()=>room.size===3);
 // Keep within the intentionally small per-IP join budget, including wrong-password test.
 for(let i=0;i<4;i++){const c=await connect();c.send({...profile,type:'join',code,name:'P'+i,number:i+1});await c.wait('joined');}
 assert.equal(room.players.length,6);assert.equal(room.players.filter(p=>p.team===1).length,3);assert.equal(room.players.filter(p=>p.team===2).length,3);
 for(const p of room.players)p.ready=true;a.send({type:'start'});await until(()=>room.phase==='playing');assert.equal(physics.snapshot(room).players.length,6);
});
test('server physics: geometry, curved kicks, classes, soft wall bounce, goals and replay',()=>{
 function fixture(classId='midfield'){const p=physics.player('a',{name:'A',number:10,classId},1),q=physics.player('b',{name:'B',number:7,classId:'goalkeeper'},2),r={players:[p,q],size:1,kits:{1:'blue',2:'red'}};physics.start(r);r.kickoff=0;p.inputAt=q.inputAt=Date.now();return {p,q,r};}
 const {p,q,r}=fixture('goalkeeper');p.x=130;p.y=370;r.ball.y=372;p.input={x:0,y:1,ax:600,ay:372,sprint:false,charging:false};physics.action(r,p,'dash');physics.step(r,1/120);assert.ok(Math.abs(p.y-372)<.01,'stretch stops at the ball instead of overshooting');p.input.y=0;for(let i=0;i<7;i++)physics.step(r,1/120);assert.ok(Math.abs(p.y-372)<.01);
 p.x=400;p.y=200;p.dash=0;p.stamina=1;p.input.y=1;r.ball.y=202;physics.action(r,p,'dash');physics.step(r,1/120);assert.equal(p.stretch,false);assert.ok(p.y>202,'outside area uses a normal dash');
 const f=fixture('defender');f.r.ball.owner=f.p.id;f.r.ball.x=f.p.x+29;f.r.ball.y=f.p.y;f.p.input.ax=1200;physics.action(f.r,f.p,'ability');assert.ok(f.r.ball.vx>1400);assert.equal(f.p.ability,3);
 const m=fixture();m.r.ball.owner=m.p.id;physics.action(m.r,m.p,'ability');assert.equal(m.p.wallArmed,3);physics.action(m.r,m.p,'pass');assert.equal(m.p.wallBoost,1.5);
 const b=fixture();b.p.x=300;b.p.y=500;b.r.ball.x=700;b.r.ball.y=69.1;b.r.ball.vy=-200;physics.step(b.r,1/120);const soft=b.r.events.find(e=>e.type==='bounce').volume;
 b.r.clock+=.2;b.r.ball.y=69.1;b.r.ball.vy=-900;physics.step(b.r,1/120);assert.ok(b.r.events.at(-1).volume>soft*2);
 b.r.ball.x=1238;b.r.ball.y=372.5;b.r.ball.vx=800;b.r.ball.owner=null;physics.step(b.r,1/120);assert.deepEqual(b.r.score,[1,0]);assert.equal(b.r.phase,'replay');assert.ok(b.r.replay.frames.length>0);for(let i=0;i<1800&&b.r.phase==='replay';i++)physics.step(b.r,1/120);assert.equal(b.r.phase,'playing');assert.equal(b.r.ball.x,655);assert.deepEqual(b.r.score,[1,0]);
});
