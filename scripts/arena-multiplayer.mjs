import {layout} from '../shared/arena-layout.ts';
import {chromium,expect} from '@playwright/test';
import {starterDeck} from '../shared/practice.ts';
import {cards,summonCells} from '../shared/game.ts';
const base=process.env.TEST_URL||'http://localhost:5175';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const errors=[],contexts=await Promise.all([0,1,2].map(()=>browser.newContext({viewport:{width:1440,height:1000}})));
const pages=await Promise.all(contexts.map(c=>c.newPage()));for(const p of pages)p.on('pageerror',e=>errors.push(e.message));
async function api(i,kind,name,...args){const r=await contexts[i].request.post(`${base}/api/${kind}/${name}`,{data:{args}});if(!r.ok())throw Error(await r.text());const value=(await r.json()).result;if(value?.error)throw Error(value.error);return value;}
try{
 await pages[0].goto(base);await pages[0].getByRole('button',{name:'Entrar',exact:true}).click();await pages[0].getByRole('textbox',{name:'Seu nome'}).fill('QA Invocador');await pages[0].getByRole('button',{name:'Entrar e jogar'}).click();await expect(pages[0].locator('.login-dialog')).toHaveCount(0);
 for(const i of [1,2])await contexts[i].request.post(`${base}/api/auth/guest`,{data:{name:i===1?'QA Oponente':'QA Espectador'}});
 const da=(await api(0,'mutation','saveDeck',starterDeck('agua'))).deck,db=(await api(1,'mutation','saveDeck',starterDeck('fogo'))).deck;
 const code=(await api(0,'mutation','createRoom',da.id)).room.code;await api(1,'mutation','joinRoom',code,db.id,false);await api(2,'mutation','joinRoom',code,undefined,true);
 const uid=(await (await contexts[1].request.get(`${base}/api/auth`)).json()).userId;
 await api(0,'mutation','lobbyCommand',code,{type:'seat',seat:1,userId:uid});
 for(const p of pages){await p.goto(base);await p.getByRole('button',{name:new RegExp(code)}).click();}
 await pages[0].getByRole('button',{name:'Iniciar batalha'}).click();await Promise.all(pages.map(p=>p.locator('canvas').waitFor()));
 for(const p of pages.slice(0,2)){await p.getByRole('button',{name:'Manter estas cartas'}).click();await p.getByRole('button',{name:'Começar neste selo'}).click();}
 await expect(pages[0].locator('.position-guide')).toHaveCount(0);await expect(pages[1].locator('.position-guide')).toHaveCount(0);
 let room=await api(0,'query','room',code);await pages[0].waitForTimeout(1300);
 const i=room.state.priority;room=await api(i,'query','room',code);const hand=room.state.players[i].hand;let idx=hand.findIndex(id=>cards.get(id).kind==='unit'&&cards.get(id).stats.cost<=1);
 if(idx<0){await pages[i].getByRole('button',{name:/Concluir invocações|Concluir movimentos|Concluir magias|Concluir descarte/}).click();room=await api(1-i,'query','room',code);}
 const current=room.state.priority,player=pages[current],mine=room.state.players[current];idx=mine.hand.findIndex(id=>cards.get(id).kind==='unit'&&cards.get(id).stats.cost<=1);
 if(idx<0)throw Error('Neither opening hand has a 1 PE monster; rerun shuffled fixture');
 const cell=summonCells(room.state,current)[0],name=cards.get(mine.hand[idx]).name;
 const card=player.locator('.fan-card').nth(idx).locator('.fan-art');await card.hover();await player.waitForTimeout(300);const box=await card.boundingBox();
 await player.mouse.move(box.x+box.width/2,box.y+45);await player.mouse.down();await player.mouse.move(layout(1440,1000).point(cell.x,cell.y).x,layout(1440,1000).point(cell.x,cell.y).y,{steps:20});await player.waitForTimeout(200);await player.screenshot({path:'.sited/qa/dragging.png'});await player.mouse.up();await player.screenshot({path:'.sited/qa/after-drag.png'});
 await expect.poll(async()=>((await api(current,'query','room',code)).state.units.length)).toBe(7);
 await expect(pages[2].locator('.arena-accessibility button')).toHaveCount(7);
 await player.waitForTimeout(2500);await player.screenshot({path:'.sited/qa/arena-multiplayer.png'});
 const unit=(await api(current,'query','room',code)).state.units.find(u=>u.kind==='unit');await player.mouse.move(layout(1440,1000).point(unit.x,unit.y).x,layout(1440,1000).point(unit.x,unit.y).y);await expect(player.locator('.arena-hover')).toBeVisible();await player.keyboard.press('f');await expect(player.getByRole('dialog')).toBeVisible();await player.screenshot({path:'.sited/qa/arena-inspect.png'});await player.keyboard.press('Escape');

 // Walk an Omionji through a real canvas drag once both invocation priorities pass.
 let movement=await api(current,'query','room',code);
 for(let n=0;n<3&&movement.state.phase===1;n++){await pages[movement.state.priority].getByRole('button',{name:/Concluir invocações|Concluir movimentos|Concluir magias|Concluir descarte/}).click();await player.waitForTimeout(160);movement=await api(current,'query','room',code);}
 const mover=movement.state.priority,leader=movement.state.units.find(u=>u.kind==='omionji'&&u.owner===mover),mp=pages[mover];
 await mp.mouse.move(layout(1440,1000).point(leader.x,leader.y).x,layout(1440,1000).point(leader.x,leader.y).y);await mp.mouse.down();await mp.mouse.move(layout(1440,1000).point(leader.x,3).x,layout(1440,1000).point(leader.x,3).y,{steps:20});await mp.mouse.up();
 await expect.poll(async()=>(await api(mover,'query','room',code)).state.units.find(u=>u.id===leader.id).y).toBe(3);
 await mp.getByRole('button',{name:'Menu da partida'}).click();await mp.getByRole('button',{name:'Conceder partida',exact:true}).click();await mp.getByRole('button',{name:'Conceder',exact:true}).click();
 await Promise.all(pages.map(p=>expect(p.locator('.arena-victory')).toBeVisible()));
 console.log(JSON.stringify({code,summoned:name,players:2,spectators:1,websocket:true,movement:true,victory:true,errors}));
}finally{await browser.close();}if(errors.length)process.exitCode=1;
