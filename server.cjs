'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{promisify}=require('node:util');
const {WebSocketServer,WebSocket}=require('ws'),physics=require('./physics.cjs');
const scrypt=promisify(crypto.scrypt),kits=new Set(['red','blue','river','boca','arg-racing']);
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function createServer({publicDir=path.join(__dirname,'public'),maxRooms=100}={}){
 const rooms=new Map(),attempts=new Map(),connections=new Map();
 const server=http.createServer((req,res)=>{
  const pathname=(req.url||'/').split('?')[0];
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
  if(pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,version:1}));return;}
  if(pathname!=='/'&&pathname!=='/index.html'){res.writeHead(404);res.end('No encontrado');return;}
  fs.readFile(path.join(publicDir,'index.html'),(error,body)=>{res.writeHead(error?503:200,{'Content-Type':'text/html; charset=utf-8'});res.end(error?'El juego se está preparando.':body);});
 });
 const wss=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false});
 const send=(ws,data)=>{if(ws?.readyState===WebSocket.OPEN){if(ws.bufferedAmount>1024*1024){ws.close(1013,'Conexión lenta');return;}ws.send(JSON.stringify(data));}};
 const error=(ws,message)=>send(ws,{type:'error',message});
 const captain=(room,team)=>room.players.find(p=>p.team===team&&p.connected)?.id;
 function lobby(room){return {code:room.code,size:room.size,host:room.host,phase:room.phase,paused:room.paused,kits:room.kits,players:room.players.map(p=>({id:p.id,name:p.name,number:p.number,classId:p.classId,team:p.team,ready:p.ready,connected:p.connected,rematchReady:Boolean(p.rematchReady),captain:captain(room,p.team)===p.id})),canStart:canStart(room)};}
 function canStart(room){return room.phase==='lobby'&&room.players.length===room.size*2&&[1,2].every(t=>room.players.filter(p=>p.team===t).length===room.size)&&room.players.every(p=>p.ready&&p.connected);}
 function broadcast(room,message){for(const p of room.players)send(p.ws,message);}
 const publish=room=>broadcast(room,{type:'lobby',room:lobby(room)});
 function returnLobby(room,message){room.phase='lobby';room.paused=false;room.replay=null;for(const p of room.players){p.ready=false;p.actions=[];}broadcast(room,{type:'returned',message,room:lobby(room)});}
 function remove(room,p){
  if(p.ws){p.ws.room=null;p.ws.player=null;}room.players=room.players.filter(x=>x!==p);
  if(!room.players.length){rooms.delete(room.code);return;}
  if(room.host===p.id)room.host=room.players.find(x=>x.connected)?.id||room.players[0].id;
  if(room.phase==='finished'){room.paused=room.players.some(p=>!p.connected);publish(room);}else if(room.phase!=='lobby')returnLobby(room,'Un jugador salió. Volvieron a la sala.');else publish(room);
 }
 server.on('upgrade',(req,socket,head)=>{
  if((req.url||'').split('?')[0]!=='/ws'){socket.destroy();return;}
  // Render is the only trusted proxy in the supplied deployment. Set TRUST_PROXY=0 elsewhere.
  const forwarded=process.env.TRUST_PROXY==='1'?String(req.headers['x-forwarded-for']||'').split(',')[0].trim():'';
  const ip=forwarded||socket.remoteAddress||'unknown';
  if((connections.get(ip)||0)>=20){socket.write('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>{ws.ip=ip;connections.set(ip,(connections.get(ip)||0)+1);wss.emit('connection',ws,req);});
 });
 wss.on('connection',ws=>{
  ws.alive=true;ws.on('pong',()=>ws.alive=true);ws.window=Date.now();ws.count=0;ws.busy=false;
  send(ws,{type:'hello',version:1});
  ws.on('message',async(raw,isBinary)=>{
   if(isBinary){ws.close(1003);return;}
   const now=Date.now();if(now-ws.window>1000){ws.window=now;ws.count=0;}if(++ws.count>90){ws.close(1008,'Demasiados mensajes');return;}
   let m;try{m=JSON.parse(raw);}catch{error(ws,'Mensaje inválido.');return;}if(!m||typeof m!=='object'||Array.isArray(m))return;
   if(m.type==='ping'){send(ws,{type:'pong',at:m.at});return;}
   if(m.type==='create'||m.type==='join'||m.type==='reconnect'){
    if(ws.player||ws.busy)return;ws.busy=true;
    try{
     if(m.version!==1)throw Error('Esta versión del juego es antigua. Recargá la página.');
     const record=attempts.get(ws.ip)||{at:now,count:0};if(now-record.at>60000){record.at=now;record.count=0;}record.count++;attempts.set(ws.ip,record);if(record.count>12)throw Error('Demasiados intentos. Esperá un minuto.');
     let room,p;
     if(m.type==='reconnect'){
      room=rooms.get(String(m.code||'').toUpperCase());p=room?.players.find(x=>x.token===m.token&&typeof m.token==='string');
      if(!p)throw Error('La sala ya no existe o venció la reconexión.');
      if(p.connected)throw Error('El jugador ya está conectado.');
      p.connected=true;p.goneAt=0;p.actions=[];
     }else{
      const name=typeof m.name==='string'?m.name.trim().slice(0,18):'';
      if(!name||!Number.isInteger(m.number)||m.number<1||m.number>99||!physics.stats[m.classId])throw Error('Revisá tu nombre, número y clase.');
      const password=typeof m.password==='string'?m.password:'';if(password.length<1||password.length>64)throw Error('La contraseña debe tener entre 1 y 64 caracteres.');
      if(m.type==='create'){
       if(rooms.size>=maxRooms)throw Error('El servidor está lleno. Probá en unos minutos.');
       if(![1,2,3].includes(m.size))throw Error('Formato inválido.');
       const salt=crypto.randomBytes(16),hash=await scrypt(password,salt,32);
       if(ws.readyState!==WebSocket.OPEN)return;
       // Recheck limits after asynchronous hashing; never reserve an orphan room.
       if(rooms.size>=maxRooms)throw Error('El servidor está lleno.');
       let code;do{code=Array.from({length:4},()=>alphabet[crypto.randomInt(alphabet.length)]).join('');}while(rooms.has(code));
       room={code,size:m.size,players:[],host:null,salt,hash,kits:{1:kits.has(m.kit)?m.kit:'blue',2:'red'},phase:'lobby',paused:false,createdAt:Date.now()};rooms.set(code,room);
      }else{
       room=rooms.get(String(m.code||'').toUpperCase());if(!room)throw Error('Código o contraseña incorrectos.');
       const hash=await scrypt(password,room.salt,32);if(ws.readyState!==WebSocket.OPEN)return;
       if(!crypto.timingSafeEqual(hash,room.hash))throw Error('Código o contraseña incorrectos.');
       if(rooms.get(room.code)!==room)throw Error('La sala ya se cerró.');
       if(room.phase!=='lobby')throw Error('El partido ya empezó.');
       if(room.players.length>=room.size*2)throw Error('La sala está llena.');
      }
      const team=room.players.filter(x=>x.team===1).length<=room.players.filter(x=>x.team===2).length?1:2;
      p=physics.player(crypto.randomUUID(),{name,number:m.number,classId:m.classId},team);p.token=crypto.randomBytes(32).toString('hex');room.players.push(p);if(!room.host)room.host=p.id;
     }
     p.ws=ws;ws.player=p;ws.room=room;
     if(room.players.every(x=>x.connected))room.paused=false;
     send(ws,{type:'joined',id:p.id,token:p.token,room:lobby(room)});publish(room);
     if(room.phase!=='lobby'){send(ws,{type:'started',room:lobby(room),state:physics.snapshot(room)});if(room.replay)send(ws,{type:'replay',replay:room.replay,events:room.events});}
    }catch(e){error(ws,e.message);}finally{ws.busy=false;}return;
   }
   const room=ws.room,p=ws.player;if(!room||!p)return;
   if(m.type==='leave'){remove(room,p);send(ws,{type:'left'});return;}
   if(m.type==='return'&&room.host===p.id){returnLobby(room,'El anfitrión volvió a la sala.');return;}
   if(m.type==='rematch'&&room.phase==='finished'){
    p.rematchReady=m.ready===true;publish(room);
    if(room.players.length===room.size*2&&room.players.every(x=>x.connected&&x.rematchReady)&&!room.paused){physics.start(room);broadcast(room,{type:'started',room:lobby(room),state:physics.snapshot(room)});}return;
   }
   if(m.type==='input'){
    if(room.phase!=='playing'||room.paused)return;
    if(!['x','y','ax','ay','bend'].every(k=>Number.isFinite(m[k])))return;
    p.input={x:Math.max(-1,Math.min(1,m.x)),y:Math.max(-1,Math.min(1,m.y)),ax:Math.max(-1000,Math.min(2400,m.ax)),ay:Math.max(-1000,Math.min(1700,m.ay)),bend:Math.max(-.6,Math.min(.6,m.bend)),sprint:m.sprint===true,charging:m.charging===true};p.inputAt=now;
    if(Array.isArray(m.actions))for(const a of m.actions.slice(0,3))if(['shoot','pass','dash','ability'].includes(a)&&p.actions.length<6)p.actions.push(a);
    return;
   }
   if(room.phase!=='lobby')return;
   if(m.type==='size'&&room.host===p.id&&[1,2,3].includes(m.size)){
    if(room.players.some(x=>room.players.filter(y=>y.team===x.team).length>m.size)){error(ws,'Hay más jugadores que lugares en ese formato.');return;}
    room.size=m.size;for(const x of room.players)x.ready=false;
   }else if(m.type==='team'&&[1,2].includes(m.team)){
    if(p.team===m.team)return;if(room.players.filter(x=>x.team===m.team).length>=room.size){error(ws,'Ese equipo está lleno.');return;}p.team=m.team;p.ready=false;
   }else if(m.type==='class'&&physics.stats[m.classId]){p.classId=m.classId;p.ready=false;}
   else if(m.type==='kit'&&captain(room,m.team)===p.id&&kits.has(m.kit)){room.kits[m.team]=m.kit;for(const x of room.players.filter(x=>x.team===m.team))x.ready=false;}
   else if(m.type==='ready'){p.ready=m.ready===true;}
   else if(m.type==='start'&&room.host===p.id){
    if(!canStart(room)){error(ws,'Completá los equipos y esperá a que todos estén listos.');return;}
    physics.start(room);broadcast(room,{type:'started',room:lobby(room),state:physics.snapshot(room)});return;
   }else return;
   publish(room);
  });
  ws.on('error',()=>{});
  ws.on('close',()=>{
   connections.set(ws.ip,Math.max(0,(connections.get(ws.ip)||1)-1));const p=ws.player,room=ws.room;if(!p||!room||p.ws!==ws)return;p.connected=false;p.goneAt=Date.now();p.ws=null;p.ready=false;p.actions=[];p.input={x:0,y:0,ax:p.x+p.dx*200,ay:p.y+p.dy*200,sprint:false,charging:false};
   if(room.host===p.id)room.host=room.players.find(x=>x.connected)?.id||p.id;
   if(room.phase!=='lobby')room.paused=true;publish(room);
  });
 });
 let previous=performance.now(),accumulator=0,broadcastClock=0;
 const timer=setInterval(()=>{
  const now=performance.now();accumulator+=Math.min(.15,(now-previous)/1000);previous=now;
  while(accumulator>=1/120){for(const room of rooms.values())if(room.phase!=='lobby'&&!room.paused){const phase=room.phase;physics.step(room,1/120);if(phase!=='replay'&&room.phase==='replay')broadcast(room,{type:'replay',replay:room.replay,events:room.events});}accumulator-=1/120;}
  broadcastClock+=1;
  if(broadcastClock%3===0)for(const room of rooms.values())if(room.phase!=='lobby')broadcast(room,{type:'state',state:physics.snapshot(room),paused:room.paused,events:room.events,replayElapsed:room.replay?.elapsed||0});
 },1000/60);
 const cleanup=setInterval(()=>{
  const now=Date.now();for(const room of rooms.values()){for(const p of room.players.slice())if(!p.connected&&now-p.goneAt>20000)remove(room,p);}
  for(const [ip,record] of attempts)if(now-record.at>120000)attempts.delete(ip);
  for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}
 },5000);
 timer.unref();cleanup.unref();
 async function close(){clearInterval(timer);clearInterval(cleanup);for(const ws of wss.clients)ws.terminate();await new Promise(r=>wss.close(r));if(server.listening)await new Promise(r=>server.close(r));}
 return {server,wss,rooms,close,lobby};
}
if(require.main===module){const app=createServer();app.server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Canchita online listo en puerto '+app.server.address().port));for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>app.close().then(()=>process.exit(0)));}
module.exports={createServer};
