import {chromium,expect} from '@playwright/test';
import {starterDeck,botCommand} from '../shared/practice.ts';
const base=process.env.TEST_URL||'http://localhost:5175',browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:1440,height:900}}))),page=await contexts[0].newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
async function api(i,kind,name,...args){const res=await contexts[i].request.post(`${base}/api/${kind}/${name}`,{data:{args}});if(!res.ok())throw Error(await res.text());const value=(await res.json()).result;if(value?.error)throw Error(value.error);return value;}
try{
 for(let i=0;i<2;i++)await contexts[i].request.post(`${base}/api/auth/guest`,{data:{name:`QA Combat ${i+1}`}});
 const deck=[];for(let i=0;i<2;i++)deck.push((await api(i,'mutation','saveDeck',starterDeck(i?'fogo':'agua'))).deck.id);
 const code=(await api(0,'mutation','createRoom',deck[0])).room.code;await api(1,'mutation','joinRoom',code,deck[1],false);
 const uid=(await(await contexts[1].request.get(`${base}/api/auth`)).json()).userId;await api(0,'mutation','lobbyCommand',code,{type:'seat',seat:1,userId:uid});let room=(await api(0,'mutation','lobbyCommand',code,{type:'start'})).room;
 await page.goto(base);await page.getByRole('button',{name:new RegExp(code)}).click();await page.locator('canvas').waitFor();let combat;
 for(let n=0;n<220;n++){
  const g=room.state;let seat=g.priority;if(g.setup)seat=g.players[0].ready?1:0;else if(g.centerPending)seat=Object.hasOwn(g.centerChoices||{},0)?1:0;else if(g.duel)seat=g.duel.opponentId?g.duel.seat:1-g.duel.seat;else if(g.followup)seat=g.followup.seat;
  room=await api(seat,'query','room',code);const cmd=botCommand(room.state,seat);room=(await api(seat,'mutation','gameCommand',code,cmd,room.state.revision)).room;
  combat=room.state.events?.find(e=>e.type==='combat');if(combat){await expect(page.locator('.field-event')).toContainText('resolvendo dano',{timeout:20000});await page.waitForTimeout(500);await page.screenshot({path:'.sited/qa/combat-live.png'});await page.waitForTimeout(2300);await page.screenshot({path:'.sited/qa/combat-after.png'});break;}if(room.state.winner!==null)break;
  await page.waitForTimeout(200);await expect(page.locator('.field-event')).toHaveCount(0,{timeout:20000});
 }
 if(!combat)throw Error('No combat reached');console.log({code,combat:combat.keyword,attackDamage:combat.attackDamage,defenseDamage:combat.defenseDamage,errors});
 await api(0,'mutation','gameCommand',code,{type:'concede'},room.state.revision);
}finally{await browser.close();}if(errors.length)process.exitCode=1;
