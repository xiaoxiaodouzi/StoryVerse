/* 当前交互层：人物移动、事件、批量导入、最终 Prompt 与消息发送流程。 */
(()=>{
// 当前交互层只复用世界基础层的弹窗、事件绑定和记忆总结。
const V3={modal:window.modal,bind:window.bind,summarizeScene:window.summarizeScene};
const eventToolIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="3"/></svg>';
const imageToolIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m4 17 4-4 3 3 3-3 6 6"/></svg>';
const fileToolIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5M10 13h5m-5 4h5"/></svg>';

function migrateWorldV4(){
 db.stories.forEach(s=>{s.npcDefaultAgentId??=''});
 db.chats.filter(isScene).forEach(c=>{
  if(c.name==='森林调查队')c.name='森林';
  const all=chars(c.storyId).map(x=>x.id),name=String(c.name||'');
  c.scene.accessType??=(/(咖啡|森林|图书馆|教室|大厅|广场|街道|公园)/.test(name)||c.scene.allowedCharacterIds?.length>=all.length?'public':'private');
  c.scene.allowedCharacterIds=Array.isArray(c.scene.allowedCharacterIds)?c.scene.allowedCharacterIds:[];
  c.scene.presentCharacterIds=Array.isArray(c.scene.presentCharacterIds)?c.scene.presentCharacterIds:[];
 });
 db.stories.forEach(s=>{
  const occupied=new Map();
  db.chats.filter(c=>c.storyId===s.id&&isScene(c)).sort((a,b)=>String(a.updatedAt).localeCompare(String(b.updatedAt))).forEach(c=>{
   c.scene.presentCharacterIds=[...new Set(c.scene.presentCharacterIds)].filter(id=>{
    const previous=occupied.get(id);
    if(previous)previous.scene.presentCharacterIds=previous.scene.presentCharacterIds.filter(x=>x!==id);
    occupied.set(id,c);return true;
   });
  });
  db.chats.filter(c=>c.storyId===s.id&&isScene(c)).forEach(c=>c.memberIds=[...c.scene.presentCharacterIds]);
  chars(s.id).forEach(person=>{
   const existing=db.chats.find(c=>c.storyId===s.id&&c.type==='private'&&c.memberIds?.includes(person.id));
   if(existing){existing.name=person.name;existing.memberIds=[person.id]}
   else db.chats.push({id:uid('p'),storyId:s.id,type:'private',name:person.name,memberIds:[person.id],scene:{environment:'',autoMemory:true},updatedAt:now()});
  });
 });
 db.schemaVersion=5;save();
}
// 暴露给内置回归测试，用同一条正式迁移路径重建测试数据。
window.migrateWorldV4=migrateWorldV4;
migrateWorldV4();

function sceneOfCharacter(id,sid=db.currentStoryId){return db.chats.find(c=>c.storyId===sid&&isScene(c)&&c.scene.presentCharacterIds.includes(id))}
function canEnterScene(c,id){return c.scene.accessType==='public'||c.scene.allowedCharacterIds.includes(id)}
function removeFromScenes(id,sid=db.currentStoryId,except=''){
 db.chats.filter(c=>c.storyId===sid&&isScene(c)&&c.id!==except).forEach(c=>{c.scene.presentCharacterIds=c.scene.presentCharacterIds.filter(x=>x!==id);c.memberIds=[...c.scene.presentCharacterIds]});
}
function moveCharacterToScene(id,target,forceAllow=false){
 const person=char(id);if(!person||!target||target.storyId!==person.storyId)return false;
 if(!canEnterScene(target,id)&&!forceAllow)return false;
 removeFromScenes(id,person.storyId,target.id);
 if(forceAllow&&target.scene.accessType==='private'&&!target.scene.allowedCharacterIds.includes(id))target.scene.allowedCharacterIds.push(id);
 if(!target.scene.presentCharacterIds.includes(id))target.scene.presentCharacterIds.push(id);
 target.memberIds=[...target.scene.presentCharacterIds];target.updatedAt=now();return true;
}
function leaveAllScenes(id,sid=db.currentStoryId){const before=sceneOfCharacter(id,sid);removeFromScenes(id,sid);return !!before}
function sceneOnline(c){return ['我',...presentActors(c).map(x=>x.name)].join('、')}
function sceneAccessLabel(c){return c.scene.accessType==='public'?'公共场景':'私人场景'}
function npcBlueprintsForScene(name,accessType='public'){
 const place=String(name||'场景'),base={personality:'自然、可靠',speech:'符合身份，简洁自然',tone:4};let list;
 if(/咖啡|茶馆|餐厅|酒馆|饭店/.test(place))list=[['店长',`${place}店长`,'熟悉店里的日常与来往客人。'],['服务生',`${place}服务生`,'负责招待客人，也会留意店内发生的事情。']];
 else if(/图书馆|书店|档案馆/.test(place))list=[['管理员',`${place}管理员`,'熟悉馆藏、借阅规则与不易被发现的角落。'],['值班学生',`${place}值班助手`,'负责整理资料，经常听到访客之间的谈话。']];
 else if(/森林|树林|山谷|荒野/.test(place))list=[['守林人',`${place}守护者`,'熟悉道路、天气以及最近出现的异常痕迹。'],['旅行者',`途经${place}的旅行者`,'带着来自其他地方的见闻，暂时在这里停留。']];
 else if(/学院|学校|教室|宿舍/.test(place))list=[['值班老师',`${place}值班老师`,'负责维持秩序，也了解这里最近发生的事情。'],['普通学生',`${place}学生`,'经常在这里活动，可能提供日常消息。']];
 else if(/医院|诊所|医务室/.test(place))list=[['医生',`${place}医生`,'负责处理伤病，观察细致。'],['护士',`${place}护士`,'熟悉来往人员与近期情况。']];
 else if(/王宫|宫殿|大厅|城堡/.test(place))list=[['侍从',`${place}侍从`,'熟悉礼仪、出入人员和内部安排。'],['守卫',`${place}守卫`,'负责警戒，不会轻易透露机密。']];
 else if(/商店|市场|集市|广场/.test(place))list=[['商人',`${place}商人`,'消息灵通，熟悉商品和往来客人。'],['巡逻员',`${place}巡逻员`,'负责维护秩序，留意异常情况。']];
 else if(/家|住所|房间|公寓/.test(place)||accessType==='private')list=[['管家',`${place}照料者`,'负责打理这里的日常事务，言行谨慎。']];
 else list=[['值守人',`${place}常驻人员`,'熟悉这里的环境与日常变化。']];
 return list.map(([npcName,role,intro],i)=>({name:npcName,role,intro,...base,tone:(i+4)%5,agentId:story().npcDefaultAgentId||''}));
}
function createNpcForScene(c,draft){const n={id:uid('npc'),storyId:c.storyId,sceneId:c.id,name:draft.name,role:draft.role||`${c.name}的固定 NPC`,intro:draft.intro||`长期在${c.name}活动。`,personality:draft.personality||'自然、可靠',speech:draft.speech||'符合身份，简洁自然',tone:Number(draft.tone??4),isNpc:true,agentId:draft.agentId||story().npcDefaultAgentId||''};db.npcs.push(n);c.scene.npcIds.push(n.id);return n}
function autoCreateSceneNpcs(c){if(c.scene.npcIds.length)return;c.scene.npcIds=[];const made=npcBlueprintsForScene(c.name,c.scene.accessType).map(d=>createNpcForScene(c,d));if(/咖啡|茶馆|餐厅|酒馆/.test(c.name)&&made[0])db.messages.push({id:uid('m'),chatId:c.id,senderId:made[0].id,text:'欢迎光临，需要什么可以随时告诉我。',time:timeNow()})}
function addSceneEvent(c,person,kind){
 if(!c||!person)return;
 const text=`${person.name}${kind==='enter'?'进入':'离开'}${c.name}`,last=msgList(c.id).at(-1);
 if(last?.senderId==='system'&&last.text===text)return;
 db.messages.push({id:uid('event'),chatId:c.id,senderId:'system',type:'sceneEvent',eventKind:kind,text,time:timeNow()});
}
function addMovementMemory(person,place,kind,sourceChatId){
 const text=`${person.name}${kind==='enter'?'进入了':'离开了'}${place.name}。`,last=db.memories.filter(m=>m.storyId===person.storyId&&m.movementCharacterId===person.id).at(-1);
 if(last?.text===text&&Date.now()-new Date(last.createdAt||0).getTime()<30000)return;
 db.memories.push({id:uid('mem'),storyId:person.storyId,text,when:`今天 ${timeNow()}`,knownBy:[person.id],sourceChatId:sourceChatId||place.id,sceneId:place.id,createdAt:now(),auto:true,movementCharacterId:person.id,movementKind:kind});
}
function transitionCharacter(id,target){
 const person=char(id),origin=person&&sceneOfCharacter(id,person.storyId);if(!person||!target||origin?.id===target.id)return false;
 if(!moveCharacterToScene(id,target,false))return false;
 if(origin){addSceneEvent(origin,person,'leave');addMovementMemory(person,origin,'leave',origin.id)}addSceneEvent(target,person,'enter');addMovementMemory(person,target,'enter',target.id);save();return true;
}
function leaveCharacterFromContext(id,context){
 const person=char(id);if(!person)return false;
 const origin=isScene(context)&&context.scene.presentCharacterIds.includes(id)?context:sceneOfCharacter(id,context.storyId);
 if(!origin)return false;
 origin.scene.presentCharacterIds=origin.scene.presentCharacterIds.filter(x=>x!==id);origin.memberIds=[...origin.scene.presentCharacterIds];origin.updatedAt=now();addSceneEvent(origin,person,'leave');addMovementMemory(person,origin,'leave',origin.id);save();return true;
}

function detectTargetScene(text,sid){
 const scenes=sceneChats(sid).sort((a,b)=>b.name.length-a.name.length);
 const escapeReg=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 let target=scenes.find(c=>new RegExp(`(?:去|前往|进入|走进|踏入|来到|回到|回|赶往|走向|带到|抵达|到|往)\\s*(?:了|一下)?\\s*${escapeReg(c.name)}`).test(text));
 if(!target&&!/(离开|走出|退出)/.test(text)&&/(喝咖啡|喝一杯|去.*咖啡|前往.*咖啡|进入.*咖啡|到.*咖啡)/.test(text))target=scenes.find(c=>c.name.includes('咖啡'));
 if(!target&&/(树林|林子|森林)/.test(text)&&/(去|进入|前往|来到|回到)/.test(text))target=scenes.find(c=>c.name.includes('森林'));
 if(!target&&/(图书馆|借书)/.test(text)&&/(去|进入|前往|来到|回到)/.test(text))target=scenes.find(c=>c.name.includes('图书馆'));
 return target;
}
function semanticTransition(context,text,senderId){
 const sid=context.storyId,people=chars(sid),speaker=senderId==='user'?null:char(senderId);let target=detectTargetScene(text,sid);
 let movers=speaker?[speaker]:people.filter(x=>text.includes(x.name));
 if(!speaker&&!movers.length&&context.type==='private'&&/(你|一起|我们)/.test(text))movers=presentActors(context).filter(x=>!x.isNpc);
 if(!speaker&&!movers.length&&isScene(context)&&/(大家|你们|一起|我们)/.test(text))movers=presentActors(context).filter(x=>!x.isNpc);
 if(!target&&/回宿舍/.test(text))target=sceneChats(sid).find(c=>c.name.includes('宿舍'));
 if(!target&&/回家/.test(text)&&movers.length===1)target=sceneChats(sid).find(c=>(c.name.includes(movers[0].name)&&/(家|住所|房间)/.test(c.name))||c.name===`${movers[0].name}家`);
 const completedArrival=!!speaker&&(/(?:^|[。！？!?])\s*(?:我|我们).{0,12}(?:已经|刚刚|终于|现在)?(?:进入了|来到了|抵达了|走进了)/.test(text)||/^[（(][^）)]{0,24}(?:走进|踏入|抵达|来到)[^）)]*[）)]/.test(text));
 if(target&&(context.type==='private'||(speaker&&!completedArrival)))return[];
 let changed=[];
 if(target){
  movers.forEach(x=>{if(transitionCharacter(x.id,target))changed.push(`${x.name}进入${target.name}`);else if(!canEnterScene(target,x.id))changed.push(`${x.name}没有进入${target.name}的权限`)});
 }else{
  const explicitUserDeparture=senderId==='user'&&/(?:让|叫|请|你|大家|你们).{0,8}(?:离开|先走|出去|回家|回宿舍)|(?:离开|走出|退出)(?:这个|当前)?(?:场景|这里|.+厅|.+馆|.+林)/.test(text);
  const explicitSpeakerDeparture=!!speaker&&( /(?:^|[。！？!?])\s*(?:我|我们|本人).{0,10}(?:先走了|要走了|离开(?:这里|当前场景)?|告辞了|回家了|回宿舍了|退场了)(?:[。！？!?]|$)/.test(text)||/^[（(][^）)]{0,18}(?:转身离去|走出当前场景|离开这里|告辞离开)[^）)]*[）)]/.test(text) );
  if(explicitUserDeparture||explicitSpeakerDeparture){
  if(!speaker&&!movers.length&&context.type==='private'&&/(你|先走)/.test(text))movers=presentActors(context).filter(x=>!x.isNpc);
  movers.forEach(x=>{if(leaveCharacterFromContext(x.id,context))changed.push(`${x.name}离开${isScene(context)?context.name:'当前场景'}`)});
  }
 }
 if(changed.length){save();toast(changed.join('；'))}
 return changed;
}

function normalizeDestinationName(raw,sid){
 let name=String(raw||'').trim();
 chars(sid).forEach(c=>name=name.replaceAll(c.name,''));
 name=name.replace(/^(?:一个)?(?:叫|名为)/,'').replace(/(?:的地方|那里|那边)$/,'').replace(/^(?:这个|那个|附近的|学校的)/,'').replace(/(?:吧|呀|啊|呢|啦|好吗|怎么样).*$/,'').replace(/(?:看看|逛逛|走走|一趟)$/,'').replace(/[“”"'（）()\s]/g,'').trim();
 const place=name.match(/(?:大型)?(?:超市|商场|便利店|市场|集市|咖啡厅|咖啡馆|咖啡店|图书馆|书店|档案馆|森林|树林|公园|广场|教室|宿舍|食堂|餐厅|酒馆|医院|诊所|车站|王宫大厅)|[\u3400-\u9fff]{1,8}(?:馆|厅|店|院|园|林|室|场|站|宫|住所|家)/)?.[0];
 if(place)name=place;
 name=name.replace(/(?:买|拿|取|找|看|逛|吃|喝|办|做|采购|购买|寻找|调查|休息).*/,'');
 if(/喝?咖啡|咖啡馆|咖啡店/.test(name))name='咖啡厅';
 if(name.length<2||name.length>16||/^(这里|那里|外面|地方|哪儿|哪里)$/.test(name))return'';
 return name;
}
function findMatchingScene(name,sid){
 const normalized=name.replace(/馆$/,'厅');
 return sceneChats(sid).find(c=>c.name===name||c.name.replace(/馆$/,'厅')===normalized||c.name.includes(name)||name.includes(c.name));
}
function extractTravelDestination(text,sid){
 if(!/(去|前往|进入|到|回到|回|出发|带我去)/.test(text)||/(不去|别去|不要去|不想去)/.test(text))return null;
 const named=sceneChats(sid).find(c=>text.includes(c.name));
 if(named)return{name:named.name,sceneId:named.id,existing:true};
 let match=text.match(/(?:去|前往|进入|到|回到|回|带我去)\s*(?:一个)?(?:叫|名为)\s*([^，。！？!?]{2,16}?)(?:的地方|吧|呀|啊|呢|啦|$)/);
 if(!match)match=text.match(/(?:一起|我们|咱们|大家)?\s*(?:去|前往|进入|到|回到|回|带我去)\s*([^，。！？!?]{2,20})/);
 const name=normalizeDestinationName(match?.[1],sid);if(!name)return null;
 const existing=findMatchingScene(name,sid);return{name:existing?.name||name,sceneId:existing?.id||'',existing:!!existing};
}
function travelProposal(c){
 if(c?.type!=='private')return null;
 const source=[...msgList(c.id)].reverse().find(m=>m.senderId==='user');
 if(!source||source.travelHandled)return null;
 const destination=extractTravelDestination(source.text,c.storyId);return destination?{...destination,sourceId:source.id}:null;
}
function journeyCardV4(m){
 const c=chat(m.chatId);if(c?.type!=='private'||m.senderId==='user'||m.senderId==='system')return'';
 const suggestion=travelProposal(c);if(!suggestion)return'';
 const icon=/咖啡/.test(suggestion.name)?coffee:sceneIcon;
 return`<button class="journey-card" data-enter-scene="${e(suggestion.name)}" data-travel-character="${e(c.memberIds[0])}" data-travel-source="${e(suggestion.sourceId)}">${icon}<span><small>${suggestion.existing?'一起前往':'创建场景并前往'}</small><strong>${e(suggestion.name)}</strong></span>${chevron}</button>`;
}

function sceneEventPool(c){
 const s=db.stories.find(x=>x.id===c.storyId)||story(),place=c.name,npcs=(c.scene.npcIds||[]).map(npc).filter(Boolean),people=presentActors(c).filter(x=>!x.isNpc),npcName=npcs[0]?.name,personName=people[0]?.name;
 const environmental=/森林|树林|山谷|荒野|公园|广场|街道/.test(place)?[
  {title:'骤雨将至',text:`${place}上空迅速聚起厚重云层，冷风卷过四周，第一阵急雨很快落了下来。`},
  {title:'雾气漫开',text:`一层湿冷的薄雾沿地面漫开，${place}里熟悉的景物逐渐变得模糊。`}
 ]:[{title:'灯光波动',text:`${place}里的灯光忽明忽暗，周围的声音也短暂安静下来。`},{title:'物件异动',text:`${place}角落里的一件旧物忽然轻轻震动，留下了与当前剧情有关的细微迹象。`}];
 const interactions=[];
 if(personName)interactions.push({title:'意外发现',text:`${personName}在${place}里发现一件与当前剧情有关的小物件，正准备和在场的人一起确认它的用途。`});
 if(npcName)interactions.push({title:'小小意外',text:`${npcName}整理物品时不慎碰倒了手边的东西，现场留下一个值得在场人物留意的细节。`},{title:'场景提醒',text:`${npcName}注意到${place}的状态有些反常，及时提醒在场人物留意周围变化。`});
 return[...environmental,...interactions,{title:'环境异动',text:`${place}的环境出现了与故事进展呼应的变化，在场人物需要判断这是否值得继续观察。`}];
}
function recommendedSceneEvents(c){const generated=state.generatedEvents?.chatId===c.id?state.generatedEvents.items:null;if(generated?.length)return generated;const pool=sceneEventPool(c),start=(state.eventSeed||0)%pool.length;return Array.from({length:3},(_,i)=>pool[(start+i)%pool.length])}
async function generateSceneEvents(c){
 const s=db.stories.find(x=>x.id===c.storyId)||story(),bot=agent(s.npcDefaultAgentId),source=api(bot?.apiId);
 if(!bot||!source){state.eventLoading=false;state.generatedEvents={chatId:c.id,items:recommendedSceneEvents(c),local:true};render();return}
 const people=presentActors(c).filter(x=>!x.isNpc).map(x=>x.name),npcs=(c.scene.npcIds||[]).map(id=>npc(id)?.name).filter(Boolean),outdoor=/森林|树林|山谷|荒野|公园|广场|街道/.test(c.name);
 const prompt=`故事：${s.name}\n世界观：${s.worldview||''}\n当前剧情：${s.plot||''}\n场景：${c.name}\n场景介绍：${c.scene.description||''}\n场景状态：${c.scene.status||''}\n是否室外：${outdoor?'是':'否'}\n当前主要人物：${people.join('、')||'无'}\n固定NPC：${npcs.join('、')||'无'}\n请生成3个彼此明显不同、合理且有趣的场景事件。可以使用天气或环境变化、当前主要人物与场景的互动、现有固定NPC的小意外。绝对不能出现陌生人、新角色、路人、客人或未列出的姓名；不能让任何人物进入或离开；不能改变当前人物名单。严格只输出JSON数组，每项格式为{"title":"8字以内标题","text":"20至55字事件描述"}。`;
 try{const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseUrl:source.baseUrl,apiKey:source.apiKey,model:bot.model,messages:[{role:'system',content:'你是故事场景事件设计器。严格遵守现有人物名单与JSON格式，不创建任何新人物。'},{role:'user',content:source.separator?splitChinese(prompt):prompt}],temperature:1.02,maxTokens:520})});let body={};try{body=await res.json()}catch{}if(!res.ok)throw new Error(body.error||'事件生成失败');const raw=String(body.content||'').replace(/```(?:json)?|```/gi,'').trim(),parsed=JSON.parse(raw),forbidden=/陌生人|新角色|路人|客人|来客|闯入|走进|进入了|离开了/;const items=(Array.isArray(parsed)?parsed:[]).map(x=>({title:String(x.title||'').slice(0,12),text:String(x.text||'').slice(0,100)})).filter(x=>x.title&&x.text&&!forbidden.test(x.text)).slice(0,3);if(items.length<3)throw new Error('生成结果不符合场景人物约束');state.generatedEvents={chatId:c.id,items,local:false}}catch(err){state.generatedEvents={chatId:c.id,items:sceneEventPool(c).slice(0,3),local:true};toast(`AI 事件生成失败，已使用安全推荐：${err.message}`)}finally{state.eventLoading=false;render()}
}
function addStoryEvent(c,item){db.messages.push({id:uid('event'),chatId:c.id,senderId:'system',type:'storyEvent',eventKind:'story',title:item.title,text:item.text,time:timeNow()});c.updatedAt=now();story().updatedAt=now();save();state.modal=null;state.chatToolsOpen=false;render();toast('场景事件已加入聊天记录')}
function eventPickerModal(){const c=chat();if(!isScene(c))return'';const options=recommendedSceneEvents(c),mode=state.generatedEvents?.chatId===c.id&&!state.generatedEvents.local?'NPC 默认模型生成':'安全本地推荐';return`<div class="modal-layer event-picker-layer"><section class="modal event-picker"><div class="modal-handle"></div><div class="modal-head"><div><h2>选择场景事件</h2><p class="modal-sub">${state.eventLoading?'正在调用故事的 NPC 默认模型…':mode}</p></div><button class="icon-btn" data-close>×</button></div><div class="event-options ${state.eventLoading?'event-loading':''}">${state.eventLoading?'<div class="event-loading-copy">正在构思适合当前故事与场景的事件…</div>':options.map((x,i)=>`<button data-choose-event="${i}"><strong>${e(x.title)}</strong><p>${e(x.text)}</p></button>`).join('')}</div><div class="event-picker-actions"><button data-random-event ${state.eventLoading?'disabled':''}>${eventToolIcon}<span>随机事件</span></button><button data-refresh-events ${state.eventLoading?'disabled':''}>${I.plus}<span>换一组</span></button></div></section></div>`}
function chatToolsPanel(c){if(!state.chatToolsOpen)return'';return`<div class="chat-tools-panel"><button data-chat-tool="event" class="${isScene(c)?'':'disabled'}">${eventToolIcon}<span>事件</span></button><button data-chat-tool="image">${imageToolIcon}<span>图片</span></button><button data-chat-tool="file">${fileToolIcon}<span>文件</span></button><input type="file" accept="image/*" id="chat-image-input" hidden><input type="file" id="chat-file-input" hidden></div>`}

function storyModalV4(){
 const s=state.modal==='editStory'?db.stories.find(x=>x.id===state.editingId):{};
 return`<div class="modal-layer"><section class="modal"><div class="modal-handle"></div><div class="modal-head"><h2>${s?.id?'编辑故事':'创建新故事'}</h2><button class="icon-btn" data-close>×</button></div><form class="form" id="story-form"><div class="field"><label>故事名称</label><input name="name" value="${e(s?.name)}" required placeholder="给这个世界起个名字" /></div><div class="field"><label>故事简介</label><textarea name="summary" required placeholder="用一两句话介绍故事">${e(s?.summary)}</textarea></div><div class="field"><label>世界观</label><textarea name="worldview" placeholder="这个世界遵循怎样的规则？">${e(s?.worldview)}</textarea></div><div class="field"><label>故事背景</label><textarea name="background" placeholder="故事从哪里开始？">${e(s?.background)}</textarea></div><div class="field"><label>当前剧情</label><textarea name="plot" placeholder="现在正在发生什么？">${e(s?.plot)}</textarea></div><div class="field"><label>重要设定</label><textarea name="important" placeholder="AI 必须知道的规则">${e(s?.important)}</textarea></div><div class="field"><label>场景 NPC 默认智能体 / 模型</label><select name="npcDefaultAgentId"><option value="">未指定（使用本地示例回复）</option>${db.agents.map(a=>`<option value="${a.id}" ${s?.npcDefaultAgentId===a.id?'selected':''}>${e(a.name)} · ${e(a.model)}</option>`).join('')}</select><small>新建固定 NPC 时默认使用，可在具体场景中单独修改。</small></div><div class="modal-actions"><button type="button" class="btn" data-close>取消</button><button class="btn primary">${s?.id?'保存修改':'创建故事'}</button></div></form></section></div>`
}

function storySwitcherPopover(){
 const a=state.switchAnchor||{top:62,left:10,width:332};
 return`<div class="story-popover-layer" data-switch-backdrop><section class="story-popover" style="top:${a.top}px;left:${a.left}px;width:${a.width}px"><div class="story-popover-head"><span>切换故事</span><button data-close>×</button></div><div class="switch-story-list">${db.stories.map(s=>`<button data-switch-story="${s.id}" class="${s.id===db.currentStoryId?'selected':''}">${storyCover(s)}<div><strong>${e(s.name)}</strong><p>${e(s.plot||s.summary)}</p></div>${s.id===db.currentStoryId?'<i>当前</i>':chevron}</button>`).join('')}</div></section></div>`
}

function npcEditorRow(n={}){return`<div class="npc-editor-row" data-npc-row><input type="hidden" name="npcId" value="${e(n.id)}"><div class="npc-row-head"><input name="npcName" value="${e(n.name)}" placeholder="NPC 姓名" required><button type="button" data-remove-npc aria-label="移除 NPC">×</button></div><input name="npcRole" value="${e(n.role)}" placeholder="身份，例如：图书管理员"><select name="npcAgentId"><option value="">本地示例回复</option>${db.agents.map(a=>`<option value="${a.id}" ${n.agentId===a.id?'selected':''}>${e(a.name)} · ${e(a.model)}</option>`).join('')}</select></div>`}

function sceneEditorV4(){
 const c=state.modal==='editScene'?chat(state.editingId):null,s=c?.scene||{},access=s.accessType||'public',allowed=s.allowedCharacterIds||[],present=s.presentCharacterIds||[],fixed=(s.npcIds||[]).map(npc).filter(Boolean);
 return`<div class="modal-layer"><section class="modal scene-editor"><div class="modal-handle"></div><div class="modal-head"><h2>${c?'编辑场景':'创建场景'}</h2><button class="icon-btn" data-close>×</button></div><form class="form" id="v4-scene-form"><div class="field"><label>场景名称</label><input name="name" value="${e(c?.name)}" required placeholder="例如：咖啡厅" /></div><div class="field"><label>场景介绍</label><textarea name="description" placeholder="这里是什么地方？">${e(s.description)}</textarea></div><div class="field"><label>当前状态</label><input name="status" value="${e(s.status)}" placeholder="例如：傍晚，店里客人不多" /></div><div class="field"><label>场景类型</label><select name="accessType" id="scene-access"><option value="public" ${access==='public'?'selected':''}>公共场景 · 所有人都可以进入</option><option value="private" ${access==='private'?'selected':''}>私人场景 · 仅获准成员可进入</option></select></div><div class="field private-members ${access==='public'?'hidden-field':''}"><label>私人场景允许进入的成员</label><div class="check-list compact-checks">${chars().map(x=>`<label class="check-row"><input type="checkbox" name="allowed" value="${x.id}" ${allowed.includes(x.id)?'checked':''}/>${av(x,true)}<span>${e(x.name)}</span></label>`).join('')}</div><small>私人场景只允许选中的人物进入。</small></div><div class="field"><label>当前在场人物</label><div class="check-list compact-checks">${chars().map(x=>`<label class="check-row"><input type="checkbox" name="present" value="${x.id}" ${present.includes(x.id)?'checked':''}/>${av(x,true)}<span>${e(x.name)}</span></label>`).join('')}</div><small>人物进入这里后，会自动从其他场景退出。</small></div><div class="field"><div class="field-label-actions"><label>固定 NPC</label><div><button type="button" data-auto-npcs>智能推荐</button><button type="button" data-add-npc>＋ 添加</button></div></div><div id="npc-editor-list">${fixed.map(npcEditorRow).join('')}</div><small>${c?'可以添加、删除或修改多个 NPC。':'如果不手动添加，创建时会根据场景自动生成相关 NPC。'}</small></div><div class="modal-actions"><button type="button" class="btn" data-close>取消</button><button class="btn primary">${c?'保存':'创建场景'}</button></div></form></section></div>`
}

function tableImportModal(){const kind=state.importKind||'story',meta={story:{title:'导入故事表格',hint:'粘贴两列表格：第一行为“字段、填写内容”，第二行起填写故事名称、故事简介、世界观、故事背景、当前剧情、重要设定。'},character:{title:'导入人物表格',hint:'粘贴两列表格：第一行为表头，第二行起按第一列识别人物名字、性别、年龄、身份、人物介绍、性格等字段。'},scene:{title:'批量导入场景',hint:'粘贴多行表格：第一行为“场景名称、场景描述”，后续每行创建一个公共场景。'}}[kind];return`<div class="modal-layer"><section class="modal table-import-modal"><div class="modal-handle"></div><div class="modal-head"><h2>${meta.title}</h2><button class="icon-btn" data-close>×</button></div><p class="table-import-hint">${meta.hint}</p><form id="table-import-form"><div class="blank-table"><div class="blank-table-corner"></div><div>A</div><div>B</div><div>1</div><textarea id="table-import-input" name="tableData" aria-label="粘贴表格内容" spellcheck="false"></textarea></div><small class="table-import-note">粘贴区初始为空；支持 Excel / WPS / 网页表格、制表符文本和 Markdown 表格。</small><div class="modal-actions"><button type="button" class="btn" data-close>取消</button><button class="btn primary">${kind==='scene'?'批量创建':'读取并创建'}</button></div></form></section></div>`}
function parseTableRow(line){const value=String(line||'').trim();if(value.startsWith('|'))return value.replace(/^\||\|$/g,'').split('|').map(x=>x.trim());if(value.includes('\t'))return value.split('\t').map(x=>x.trim());const cells=[];let cell='',quoted=false;for(let i=0;i<value.length;i++){const ch=value[i];if(ch==='"'){if(quoted&&value[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if((ch===','||ch==='，')&&!quoted){cells.push(cell.trim());cell=''}else cell+=ch}cells.push(cell.trim());return cells}
function parsePastedTable(raw){return String(raw||'').split(/\r?\n/).map(parseTableRow).filter(row=>row.some(Boolean)&&!row.every(x=>/^:?-{3,}:?$/.test(x)))}
function canonicalField(value){return String(value||'').replace(/[\s：:()（）/]/g,'').toLowerCase()}
function importKeyValueRows(rows,map){const out={};rows.slice(1).forEach(row=>{const key=map[canonicalField(row[0])];if(key&&row.slice(1).join('').trim())out[key]=row.slice(1).join(' ').trim()});return out}
function importStoryRows(rows){const map={故事名称:'name',故事名:'name',名称:'name',故事简介:'summary',简介:'summary',世界观:'worldview',故事背景:'background',背景:'background',当前剧情:'plot',剧情:'plot',重要设定:'important',设定:'important'},d=importKeyValueRows(rows,map);if(!d.name)throw new Error('表格中没有识别到“故事名称”。');const s={id:uid('s'),name:d.name,summary:d.summary||'',worldview:d.worldview||'',background:d.background||'',plot:d.plot||'',important:d.important||'',npcDefaultAgentId:'',player:{name:'我',gender:'未知',age:'未知',identity:'未知',appearance:'未知'},theme:['magic','ember','ocean'][db.stories.length%3],cover:['magic','ember','ocean'][db.stories.length%3],updatedAt:now(),lastChatId:''};db.stories.push(s);db.currentStoryId=s.id;return s}
function importCharacterRows(rows){const map={人物名字:'name',人物名称:'name',姓名:'name',名字:'name',性别:'gender',年龄:'age',身份:'role',人物身份:'role',人物介绍:'intro',介绍:'intro',性格:'personality',说话方式:'speech',背景故事:'background',人物背景:'background',背景:'background',和我的关系:'relation',与我的关系:'relation',关系:'relation'},d=importKeyValueRows(rows,map);if(!d.name)throw new Error('表格中没有识别到“人物名字”。');const person={id:uid('c'),storyId:db.currentStoryId,tone:db.characters.length%5,agentId:'',gender:'未知',age:'未知',...d};db.characters.push(person);db.chats.push({id:uid('p'),storyId:db.currentStoryId,type:'private',name:person.name,memberIds:[person.id],scene:{environment:'',autoMemory:true},updatedAt:now()});return person}
function importSceneRows(rows){if(rows.length<2)throw new Error('表格中没有可导入的场景行。');const header=rows[0].map(canonicalField),nameIndex=header.findIndex(x=>['场景名称','场景名','名称'].includes(x)),descriptionIndex=header.findIndex(x=>['场景描述','场景介绍','描述','介绍'].includes(x));if(nameIndex<0)throw new Error('第一行没有识别到“场景名称”。');const created=[];rows.slice(1).forEach(row=>{const name=String(row[nameIndex]||'').trim();if(!name)return;let c=findMatchingScene(name,db.currentStoryId);if(c)return;const description=String(row[descriptionIndex]||'').trim();c={id:uid('scene'),storyId:db.currentStoryId,type:'scene',name,memberIds:[],updatedAt:now(),scene:{description,status:'场景持续存在',accessType:'public',allowedCharacterIds:[],presentCharacterIds:[],npcIds:[],autoMemory:true}};db.chats.push(c);autoCreateSceneNpcs(c);created.push(c)});if(!created.length)throw new Error('没有创建新场景；请检查表格内容或场景是否已存在。');return created}

window.modal=function(){
 if(state.modal==='story'||state.modal==='editStory')return storyModalV4();
 if(state.modal==='storySwitcher')return storySwitcherPopover();
 if(state.modal==='group'||state.modal==='editScene')return sceneEditorV4();
 if(state.modal==='eventPicker')return eventPickerModal();
 if(state.modal==='tableImport')return tableImportModal();
 return V3.modal();
};

function storyManageGridV4(){const s=story();return`<div class="manage-grid"><button data-go="characters">${I.users}<span>人物</span><small>${chars().length} 位</small></button><button data-go="scenes">${sceneIcon}<span>场景</span><small>${sceneChats().length} 个</small></button><button data-go="memory">${I.memory}<span>记忆</span><small>${db.memories.filter(m=>m.storyId===db.currentStoryId).length} 条</small></button><button data-edit-story="${s.id}">${I.edit}<span>编辑故事</span><small>世界与 NPC 设定</small></button></div>`}
window.storyPage=function(){
 const s=story(),recentMem=db.memories.filter(m=>m.storyId===s.id).slice(-2).reverse(),people=chars().slice(0,5),places=sceneChats().slice(0,3),last=chat(s.lastChatId)||chats()[0];
 return shell(`<main class="screen story-home"><section class="world-hero cover-${e(s.cover||s.theme||'magic')}"><div class="hero-shade"></div><div class="world-hero-copy"><span>当前故事</span><h1>${e(s.name)}</h1><p>${e(s.plot||s.summary)}</p></div></section>${storyManageGridV4()}<section class="plain-section"><div class="section-head compact"><h2>主要人物</h2><button data-go="characters">全部</button></div><div class="people-strip">${people.map(c=>`<button data-edit-char="${c.id}">${av(c)}<span>${e(c.name)}</span></button>`).join('')}<button class="person-add" data-modal="character" aria-label="添加人物">${I.plus}</button></div></section><section class="plain-section"><div class="section-head compact"><h2>场景</h2><button data-go="scenes">管理</button></div><div class="mini-place-list">${places.map(c=>`<button data-chat="${c.id}"><span>${sceneIcon}</span><div><strong>${e(c.name)}</strong><small>${e(c.scene.status||'等待故事发生')} · ${sceneAccessLabel(c)}</small></div>${chevron}</button>`).join('')||'<p class="muted-copy">还没有场景，可以从场景页创建。</p>'}</div></section><section class="plain-section"><div class="section-head compact"><h2>最近记忆</h2><button data-go="memory">查看</button></div>${recentMem.map(m=>`<div class="recent-memory"><i></i><div><p>${e(m.text)}</p><small>${e(m.when)}</small></div></div>`).join('')||'<p class="muted-copy">故事尚未留下长期记忆。</p>'}</section>${last?`<button class="continue-chat" data-chat="${last.id}"><span>${I.chat}</span><div><small>继续上一次聊天</small><strong>${e(last.name)}</strong></div>${chevron}</button>`:''}</main>`,appbar(s.name,'故事主页','home',`<button class="bar-action" data-story-menu>${I.more}</button>`),'home')
};

window.scenesPage=function(){return shell(`<main class="screen compact-screen"><div class="section-head first compact"><h2>故事场景</h2><button class="mini-create" data-modal="group">${I.plus} 创建</button></div><p class="inline-note">每个人物同一时间只能在一个场景中；移动后会自动退出原场景。</p><div class="scene-list">${sceneChats().map(c=>`<button class="scene-row" data-chat="${c.id}"><div class="place-avatar">${sceneIcon}</div><div><strong>${e(c.name)} <span class="type-tag scene-tag">${sceneAccessLabel(c)}</span></strong><p>${e(c.scene.description||'尚未填写场景介绍')}</p><small>在线：${e(sceneOnline(c))} · ${(c.scene.npcIds||[]).length} 位固定 NPC</small></div>${chevron}</button>`).join('')||'<div class="quiet-empty">还没有场景。</div>'}</div></main>`,appbar('场景',story().name,'story'),'home')};

window.chatsPage=function(){return shell(`<main class="screen chat-index"><button class="story-selector" data-story-switch><span>${storyCover(story())}</span><div><small>当前故事</small><strong>${e(story().name)}</strong></div>${down}</button><div class="section-head compact"><h2>最近聊天</h2><button class="mini-create" data-modal="group">${I.plus} 场景</button></div><div class="chat-list">${compactChatRows()}</div></main>`,appbar('聊天','私聊与故事场景'),'chats')};

function sceneHeaderV4(c){return`<header class="chat-header v3-chat-header"><button class="back" data-go="chats">${I.back}</button><div class="chat-title scene-chat-title"><strong>${e(c.name)}</strong><button class="story-line" data-story-switch>${e(story().name)} ${down}</button><span class="online-names">在线：${e(sceneOnline(c))}</span></div><button class="bar-action" data-chat-menu>${I.more}</button></header>`}
window.messageHtml=function(m,isLast=false){
 if(m.senderId==='system'&&m.type==='storyEvent')return`<div class="story-event-record" data-event-id="${m.id}"><span>场景事件 · ${e(m.title||'突发事件')}</span><p>${e(m.text)}</p></div>`;
 if(m.senderId==='system')return`<div class="scene-event-record ${m.eventKind==='enter'?'enter':'leave'}" data-event-id="${m.id}"><span>${e(m.text)}</span></div>`;
 const a=m.senderId==='user'?null:actor(m.senderId),display=m.senderId==='user'||m.error?m.text:normalize(m.text,a,chat(m.chatId));
 return`<div class="message ${m.senderId==='user'?'mine':''} ${state.modal==='bubbleActions'&&state.actionMessageId===m.id?'message-selected':''}" data-message-id="${m.id}">${m.senderId==='user'?'':`<button class="avatar-profile-button" data-character-profile="${e(a?.id)}" aria-label="查看${e(a?.name||'人物')}资料">${av(a,true)}</button>`}<div class="message-content"><div class="sender">${m.senderId==='user'?'我':e(a?.name||'未知人物')}${a?.isNpc?'<span>NPC</span>':''}</div><div class="bubble ${m.error?'error-bubble':''}">${e(display)}</div><div class="msg-time">${e(m.time||'')}</div>${m.error?`<button class="retry" data-retry="${m.id}">重新发送</button>`:''}${isLast?journeyCardV4(m):''}</div></div>`;
};
window.chatPage=function(){const c=chat();if(!c){state.page='chats';return chatsPage()}if(c.storyId!==db.currentStoryId){db.currentStoryId=c.storyId;save()}story().lastChatId=c.id;save();const people=presentActors(c),person=people[0];return`<div class="desktop-stage"><div class="phone world-v3"><section class="chat-shell">${isScene(c)?sceneHeaderV4(c):`<header class="chat-header v3-chat-header private-head"><button class="back" data-go="chats">${I.back}</button><button class="avatar-profile-button header-avatar" data-character-profile="${e(person?.id)}" aria-label="查看人物资料">${av(person)}</button><div class="chat-title"><strong>${e(c.name)}</strong><button data-story-switch>${e(story().name)} ${down}</button>${sceneOfCharacter(person?.id)?`<span class="location-chip">${sceneIcon}${e(sceneOfCharacter(person.id).name)}</span>`:''}</div><button class="bar-action" data-chat-menu>${I.more}</button></header>`}<div class="messages" id="messages"><div class="day">今天</div>${msgList().map((m,i,a)=>messageHtml(m,i===a.length-1)).join('')}${state.typingId?`<div class="typing"><span class="dots"><i></i><i></i><i></i></span>${e(actor(state.typingId)?.name||'角色')}正在输入…</div>`:''}${state.summarizing?'<div class="typing summary-typing">正在整理当前记忆…</div>':''}</div>${chatToolsPanel(c)}<div class="composer-area"><div class="composer"><textarea id="composer" rows="1" placeholder="说点什么…" ${state.sending?'disabled':''}></textarea><button class="send composer-action" id="send" aria-label="更多功能" ${state.sending?'disabled':''}>${I.plus}</button></div></div></section><div class="toast"></div>${modal()}</div></div>`};

function characterKnownMemories(person){return window.StoryVerseMemoryQuery.knownByCharacter(db,person)}
function characterProfilePage(){const person=actor(state.profileCharacterId);if(!person){state.page=state.profileBack||'characters';return window.charactersPage()}const memories=characterKnownMemories(person),editable=!!char(person.id);return shell(`<main class="screen compact-screen character-profile"><section class="profile-summary">${av(person)}<div><h1>${e(person.name)}</h1><p>${e(person.role||'未知身份')}</p></div>${editable?`<button class="mini-create" data-edit-char="${person.id}">${I.edit} 编辑</button>`:'<span class="type-tag scene-tag">NPC</span>'}</section><dl class="profile-facts"><div><dt>性别</dt><dd>${e(person.gender||'未知')}</dd></div><div><dt>年龄</dt><dd>${e(person.age||'未知')}</dd></div><div><dt>身份</dt><dd>${e(person.role||'未知')}</dd></div></dl><section class="profile-intro"><h2>人物介绍</h2><p>${e(person.intro||person.background||'还没有人物介绍。')}</p></section><section class="profile-memory"><div class="section-head compact"><h2>人物记忆线</h2><span>${memories.length} 条</span></div><p class="inline-note">按时间汇总私聊与场景中，此人物明确知道的记忆。</p><div class="character-timeline">${memories.map((m,i)=>`<article><div class="memory-rail"><i></i>${i<memories.length-1?'<span></span>':''}</div><div><time>${e(m.when||'时间未知')}</time><p>${e(m.text)}</p><small>${e(chat(m.sourceChatId)?.name||'故事共同记忆')} · ${chat(m.sourceChatId)?.type==='private'?'私聊':'场景'}</small></div></article>`).join('')||'<div class="quiet-empty">还没有此人物知道的记忆。</div>'}</div></section></main>`,appbar(person.name,story().name,state.profileBack||'characters'),'home')}

function settingRowV4(){return settingRow('AI','AI 接口与智能体','接口、模型、智能体与连接测试','ai',`${db.apis.length} 接口 · ${db.agents.length} 智能体`)}
function appVersion(){try{return String(window.StoryVerseAndroid?.getVersion?.()||window.STORYVERSE_CONFIG?.versionName||'未知')}catch{return String(window.STORYVERSE_CONFIG?.versionName||'未知')}}
function aboutPage(){return shell(`<main class="screen compact-screen about-page"><section class="about-brand"><div class="about-mark"><span>✦</span></div><h1>StoryVerse</h1><p>“让故事继续发生。”</p></section><div class="about-details"><div><span>当前版本</span><strong>${e(appVersion())}</strong></div><div><span>作者</span><strong>晓小豆梓</strong></div><div><span>作者 QQ</span><strong>3209084032</strong></div></div><footer class="about-footer">Made with <i>♥</i> by 晓小豆梓</footer></main>`,appbar('关于 StoryVerse','', 'settings'),'settings')}
window.settingsPage=function(){if(state.settingsView==='ai')return aiSettingsV4();if(state.settingsView==='about')return aboutPage();return shell(`<main class="screen compact-screen"><div class="settings-group"><h2>AI 与模型</h2>${settingRowV4()}</div><div class="settings-group"><h2>应用</h2>${settingRow(I.chat,'聊天设置','回复、记忆与输入偏好','placeholder')}${settingRow('◐','外观','深色主题与显示密度','placeholder')}${settingRow('↕','数据','备份、导入与本地存储','placeholder')}${settingRow('⌁','高级设置','兼容模式与调试选项','placeholder')}</div><div class="settings-group"><h2>关于</h2>${settingRow('✦','关于 StoryVerse','让故事继续发生','about','','')}</div></main>`,appbar('设置','全局应用设置'),'settings')};
function aiSettingsV4(){return shell(`<main class="screen compact-screen"><div class="section-head first compact"><h2>AI 接口</h2><button class="mini-create" data-modal="api">${I.plus} 添加</button></div><div class="simple-list">${db.apis.map(a=>`<button class="setting-row" data-edit-api="${a.id}"><span class="setting-icon">API</span><div><strong>${e(a.name)}</strong><p>${e(a.baseUrl)}</p></div><small>${a.models?.length||0} 模型</small>${chevron}</button>`).join('')||'<div class="quiet-empty">还没有接口。</div>'}</div><div class="section-head compact"><h2>智能体与模型</h2><button class="mini-create" data-modal="agent">${I.plus} 创建</button></div><div class="simple-list">${db.agents.map(a=>`<button class="setting-row" data-edit-agent="${a.id}"><span class="setting-icon agent">AI</span><div><strong>${e(a.name)}</strong><p>${e(api(a.apiId)?.name||'接口已删除')} · ${e(a.model)}</p></div>${chevron}</button>`).join('')||'<div class="quiet-empty">还没有智能体。</div>'}</div></main>`,appbar('AI 接口与智能体','全局设置','settings'),'settings')}

window.render=function(){const pages={home:window.homePage,story:window.storyPage,characters:window.charactersPage,characterProfile:characterProfilePage,chats:window.chatsPage,chat:window.chatPage,scenes:window.scenesPage,settings:window.settingsPage,memory:window.memoriesPage};document.querySelector('#app').innerHTML=(pages[state.page]||window.homePage)();bind();if(state.page==='chat'){const x=document.querySelector('#messages');if(x)x.scrollTop=state.modal==='bubbleActions'&&state.chatScrollTop!=null?state.chatScrollTop:x.scrollHeight}};
window.go=function(p){if(p==='story'&&!story())p='home';if(p==='settings'&&state.page==='settings'&&state.settingsView)state.settingsView='';else if(p!=='settings')state.settingsView='';state.page=p;state.modal=null;render()};

window.bind=function(){
 V3.bind();
 const importKind=state.modal==='story'?'story':state.modal==='character'?'character':state.modal==='group'?'scene':'';
 if(importKind){const head=document.querySelector('.modal-head'),close=head?.querySelector('[data-close]');if(head&&close&&!head.querySelector('[data-table-import]'))close.insertAdjacentHTML('beforebegin',`<button class="table-import-entry" data-table-import="${importKind}">表格导入</button>`)}
 document.querySelectorAll('[data-table-import]').forEach(x=>x.onclick=()=>{state.importKind=x.dataset.tableImport;state.modal='tableImport';state.editingId=null;render()});
 const tableForm=document.querySelector('#table-import-form');if(tableForm)tableForm.onsubmit=ev=>{ev.preventDefault();try{const rows=parsePastedTable(document.querySelector('#table-import-input').value);if(rows.length<2)throw new Error('请先粘贴包含表头和内容的表格。');let notice='';if(state.importKind==='story'){importStoryRows(rows);save();state.modal=null;state.page='story';notice='故事已从表格创建'}else if(state.importKind==='character'){const person=importCharacterRows(rows);save();state.modal=null;state.page='characters';notice=`人物“${person.name}”已创建`}else{const created=importSceneRows(rows);save();state.modal=null;state.page='scenes';notice=`已导入 ${created.length} 个公共场景`}render();toast(notice)}catch(err){toast(err.message||'无法读取这份表格')}};
 document.querySelectorAll('[data-character-profile]').forEach(x=>x.onclick=ev=>{ev.stopPropagation();const id=x.dataset.characterProfile;if(!id)return;state.profileCharacterId=id;state.profileBack=state.page==='chat'?'chat':'characters';state.page='characterProfile';state.modal=null;render()});
 document.querySelectorAll('[data-setting-section="about"]').forEach(x=>x.onclick=()=>{state.settingsView='about';render()});
 document.querySelectorAll('[data-story-switch]').forEach(x=>x.onclick=()=>{
  const phone=x.closest('.phone'),r=x.getBoundingClientRect(),p=phone.getBoundingClientRect(),width=Math.min(Math.max(r.width,250),p.width-20),left=Math.max(10,Math.min(r.left-p.left+r.width/2-width/2,p.width-width-10));
  state.switchAnchor={top:Math.min(r.bottom-p.top+5,p.height-250),left,width};state.modal='storySwitcher';render();
 });
 const backdrop=document.querySelector('[data-switch-backdrop]');if(backdrop)backdrop.onclick=ev=>{if(ev.target===backdrop){state.modal=null;render()}};
 document.querySelectorAll('[data-switch-story]').forEach(x=>x.onclick=()=>{db.currentStoryId=x.dataset.switchStory;const first=chats()[0];if(first)state.chatId=first.id;save();state.modal=null;state.page='chats';render()});
 const sceneForm=document.querySelector('#v4-scene-form');if(sceneForm)sceneForm.onsubmit=ev=>{
  ev.preventDefault();const d=formObj(sceneForm),accessType=d.accessType,allowed=[...sceneForm.querySelectorAll('[name=allowed]:checked')].map(x=>x.value),present=[...sceneForm.querySelectorAll('[name=present]:checked')].map(x=>x.value);let c=state.editingId?chat(state.editingId):null;const isNew=!c,oldNpcIds=c?.scene?.npcIds?[...c.scene.npcIds]:[],oldPresent=c?.scene?.presentCharacterIds?[...c.scene.presentCharacterIds]:[];
  if(!c){c={id:uid('scene'),storyId:db.currentStoryId,type:'scene',name:d.name,memberIds:[],updatedAt:now(),scene:{}};db.chats.push(c)}
  if(accessType==='private')present.forEach(id=>{if(!allowed.includes(id))allowed.push(id)});
  c.name=d.name;c.updatedAt=now();c.scene={...c.scene,description:d.description,status:d.status||'场景持续存在',accessType,allowedCharacterIds:accessType==='public'?[]:allowed,presentCharacterIds:[],npcIds:[],autoMemory:c.scene.autoMemory!==false};
  oldPresent.filter(id=>!present.includes(id)).forEach(id=>{const person=char(id);if(person){addSceneEvent(c,person,'leave');addMovementMemory(person,c,'leave',c.id)}});present.forEach(id=>{const person=char(id),origin=sceneOfCharacter(id,c.storyId);if(!oldPresent.includes(id)){if(origin&&origin.id!==c.id){addSceneEvent(origin,person,'leave');addMovementMemory(person,origin,'leave',origin.id)}moveCharacterToScene(id,c,true);addSceneEvent(c,person,'enter');addMovementMemory(person,c,'enter',c.id)}else moveCharacterToScene(id,c,true)});c.memberIds=[...c.scene.presentCharacterIds];
  const drafts=[...sceneForm.querySelectorAll('[data-npc-row]')].map(row=>({id:row.querySelector('[name=npcId]').value,name:row.querySelector('[name=npcName]').value.trim(),role:row.querySelector('[name=npcRole]').value.trim(),agentId:row.querySelector('[name=npcAgentId]').value})).filter(x=>x.name);
  drafts.forEach(draft=>{const existing=npc(draft.id);if(existing){Object.assign(existing,{name:draft.name,role:draft.role||`${c.name}的固定 NPC`,agentId:draft.agentId,sceneId:c.id});c.scene.npcIds.push(existing.id)}else createNpcForScene(c,draft)});
  db.npcs=db.npcs.filter(x=>!oldNpcIds.includes(x.id)||c.scene.npcIds.includes(x.id));if(isNew&&!c.scene.npcIds.length)autoCreateSceneNpcs(c);
  save();state.editingId=null;state.modal=null;state.chatId=c.id;go('chat');toast('场景已保存');
 };
 const accessSelect=document.querySelector('#scene-access');if(accessSelect)accessSelect.onchange=()=>document.querySelector('.private-members')?.classList.toggle('hidden-field',accessSelect.value==='public');
 const npcList=document.querySelector('#npc-editor-list'),wireNpcRows=()=>document.querySelectorAll('[data-remove-npc]').forEach(x=>x.onclick=()=>x.closest('[data-npc-row]').remove());wireNpcRows();
 const addNpc=document.querySelector('[data-add-npc]');if(addNpc)addNpc.onclick=()=>{npcList.insertAdjacentHTML('beforeend',npcEditorRow());wireNpcRows();npcList.lastElementChild?.querySelector('[name=npcName]')?.focus()};
 const autoNpcs=document.querySelector('[data-auto-npcs]');if(autoNpcs)autoNpcs.onclick=()=>{const name=sceneForm.elements.name.value.trim();if(!name){toast('请先填写场景名称');return}npcList.innerHTML=npcBlueprintsForScene(name,sceneForm.elements.accessType.value).map(npcEditorRow).join('');wireNpcRows();toast('已生成场景相关 NPC')};
 document.querySelectorAll('[data-enter-cafe]').forEach(x=>x.onclick=()=>enterCafeV4(x.dataset.enterCafe));
 document.querySelectorAll('[data-enter-scene]').forEach(x=>x.onclick=()=>enterSuggestedScene(x.dataset.travelCharacter,x.dataset.enterScene,x.dataset.travelSource));
 const composer=document.querySelector('#composer'),composerAction=document.querySelector('#send');
 const syncComposerAction=()=>{if(!composerAction||!composer)return;const hasText=!!composer.value.trim();composerAction.innerHTML=hasText?I.send:I.plus;composerAction.setAttribute('aria-label',hasText?'发送':'更多功能');composerAction.classList.toggle('has-text',hasText)};
 const fitComposer=()=>{if(!composer)return;composer.style.height='auto';composer.style.height=Math.min(composer.scrollHeight,84)+'px'};
 if(composer&&composerAction){syncComposerAction();fitComposer();composer.oninput=()=>{if(composer.value&&state.chatToolsOpen){state.chatToolsOpen=false;document.querySelector('.chat-tools-panel')?.remove()}fitComposer();syncComposerAction()};composer.onkeydown=ev=>{if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();if(composer.value.trim())sendMessage(composer.value)}};composerAction.onclick=()=>{if(composer.value.trim())sendMessage(composer.value);else{state.chatToolsOpen=!state.chatToolsOpen;render()}}}
 document.querySelectorAll('[data-chat-tool]').forEach(x=>x.onclick=()=>{const tool=x.dataset.chatTool;if(tool==='event'){if(!isScene(chat())){toast('进入故事场景后才能触发事件');return}state.modal='eventPicker';state.eventSeed=(state.eventSeed||0)+1;state.generatedEvents=null;state.eventLoading=true;render();generateSceneEvents(chat())}else if(tool==='image')document.querySelector('#chat-image-input')?.click();else document.querySelector('#chat-file-input')?.click()});
 const imageInput=document.querySelector('#chat-image-input');if(imageInput)imageInput.onchange=()=>toast(imageInput.files?.[0]?`已选择图片：${imageInput.files[0].name}`:'未选择图片');
 const fileInput=document.querySelector('#chat-file-input');if(fileInput)fileInput.onchange=()=>toast(fileInput.files?.[0]?`已选择文件：${fileInput.files[0].name}`:'未选择文件');
 document.querySelectorAll('[data-choose-event]').forEach(x=>x.onclick=()=>{const options=recommendedSceneEvents(chat()),item=options[Number(x.dataset.chooseEvent)];if(item)addStoryEvent(chat(),item)});
 const randomEvent=document.querySelector('[data-random-event]');if(randomEvent)randomEvent.onclick=()=>{const pool=recommendedSceneEvents(chat()),item=pool[Math.floor(Math.random()*pool.length)];addStoryEvent(chat(),item)};
 const refreshEvents=document.querySelector('[data-refresh-events]');if(refreshEvents)refreshEvents.onclick=()=>{state.eventSeed=(state.eventSeed||0)+3;state.generatedEvents=null;state.eventLoading=true;render();generateSceneEvents(chat())};
};

function createSuggestedScene(name,sid){
 const cafe=/咖啡/.test(name),c={id:uid('scene'),storyId:sid,type:'scene',name,memberIds:[],updatedAt:now(),scene:{description:cafe?'一间向故事人物开放的咖啡厅，空气里飘着饮品与烘焙的香气。':`${story().name}中由对话开启的新地点。`,status:'刚刚有人来到这里',accessType:'public',allowedCharacterIds:[],presentCharacterIds:[],npcIds:[],autoMemory:true}};db.chats.push(c);return c;
}
function addTravelMemory(person,target,sourceId){
 const source=db.messages.find(m=>m.id===sourceId),sourceChat=source&&chat(source.chatId),text=`用户与${person.name}在${sourceChat?.type==='private'?'私聊中约定':'对话中约定'}前往${target.name}，随后一同进入了${target.name}。`;
 const duplicate=db.memories.some(m=>m.storyId===person.storyId&&m.travelSourceId===sourceId&&m.knownBy?.includes(person.id));
 if(!duplicate)db.memories.push({id:uid('mem'),storyId:person.storyId,text,when:`今天 ${timeNow()}`,knownBy:[person.id],sourceChatId:target.id,sceneId:target.id,travelSourceId:sourceId,createdAt:now(),auto:true});
}
function enterSuggestedScene(characterId,destination,sourceId=''){
 const person=char(characterId);if(!person)return;
 let target=findMatchingScene(destination,person.storyId)||createSuggestedScene(destination,person.storyId);
 if(!canEnterScene(target,person.id)){toast(`${person.name}没有进入${target.name}的权限`);return}
 autoCreateSceneNpcs(target);
 const origin=sceneOfCharacter(person.id,person.storyId);if(origin?.id!==target.id)transitionCharacter(person.id,target);
 const source=db.messages.find(m=>m.id===sourceId);if(source)source.travelHandled=true;
 addTravelMemory(person,target,sourceId);
 story().lastChatId=target.id;save();state.chatId=target.id;go('chat');toast(`${person.name}和你进入了${target.name}`);
}
function enterCafeV4(characterId){enterSuggestedScene(characterId,'咖啡厅')}
window.enterCafe=enterCafeV4;

window.systemPrompt=function(person,target){const s=db.stories.find(x=>x.id===person.storyId)||story(),known=characterKnownMemories(person);return window.StoryVersePromptBuilder.buildCharacterPrompt({person,story:s,player:s.player||{},knownMemories:known.map(m=>({...m,sourceName:chat(m.sourceChatId)?.name||'故事'})),allScenes:sceneChats(person.storyId).map(c=>({name:c.name,accessType:c.scene.accessType,description:c.scene.description||''})),currentChat:{name:target.name,type:isScene(target)?'scene':'private',description:target.scene?.description||'',status:target.scene?.status||''},presentNames:isScene(target)?presentActors(target).map(x=>x.name):[]})};

async function summarizeForAudience(c,turn,audience){const before=new Set(db.memories.map(x=>x.id)),ok=await V3.summarizeScene(c,turn);if(ok){const added=db.memories.filter(x=>!before.has(x.id)&&x.sourceChatId===c.id);added.forEach(m=>m.knownBy=[...new Set(audience)]);save()}return ok}
window.sendMessage=async function(raw){
 const text=String(raw||'').trim();if(!text||state.sending)return;const c=chat();if(!c)return;
 // 调试模块只观察本轮前后的业务状态；关闭采集时 beginTurn 直接返回 null。
 const debugTurn=window.StoryVerseDebugData?.beginTurn(c,text)||null;
 const audience=presentActors(c).map(x=>x.id),turn=[],userMessage={id:uid('m'),chatId:c.id,senderId:'user',text,time:timeNow()};db.messages.push(userMessage);turn.push(userMessage);c.updatedAt=now();story().updatedAt=now();story().lastChatId=c.id;save();state.sending=true;render();
 const responders=c.type==='private'?presentActors(c):selectResponders(c,text);
 let hadError=false;
 for(let i=0;i<responders.length;i++){const person=responders[i],useAI=!!agent(person.agentId);state.typingId=person.id;render();await new Promise(r=>setTimeout(r,useAI?350:550+i*180));try{const reply=useAI?await requestAI(person,c):mockReply(person,text,i),answer={id:uid('m'),chatId:c.id,senderId:person.id,text:reply,time:timeNow()};db.messages.push(answer);turn.push(answer);save();semanticTransition(c,reply,person.id)}catch(err){hadError=true;db.messages.push({id:uid('err'),chatId:c.id,senderId:person.id,text:err.message||'这条消息没有成功发送。',time:timeNow(),error:true,original:text});save();break}state.typingId=null;render()}
 semanticTransition(c,text,'user');state.sending=false;state.typingId=null;render();if(turn.length>1)await summarizeForAudience(c,turn,[...new Set([...audience,...turn.filter(x=>x.senderId!=='user').map(x=>x.senderId)])]);
 // 完成后再记录，确保人物移动、记忆更新和错误状态都是最终真实结果。
 window.StoryVerseDebugData?.finishTurn(debugTurn,{user_message_id:userMessage.id,responder_ids:responders.map(x=>x.id),had_error:hadError});
};

state.chatToolsOpen=false;state.eventSeed=0;
if(params.get('section')==='about'||params.get('section')==='ai')state.settingsView=params.get('section');
window.storyVerseHandleBack=function(){
 if(state.modal){state.modal=null;state.editingId=null;render();return true}
 if(state.page==='chat'){go('chats');return true}
 if(state.page==='characterProfile'){go(state.profileBack||'characters');return true}
 if(state.page==='settings'&&state.settingsView){state.settingsView='';render();return true}
 if(['characters','scenes','memory'].includes(state.page)){go('story');return true}
 if(state.page==='story'){go('home');return true}
 if(state.page==='chats'||state.page==='settings'){go('home');return true}
 return false
};
if(params.get('selftest')!=='1')render();
})();
