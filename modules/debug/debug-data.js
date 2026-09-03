/*
 * StoryVerse 调试 / 训练数据模块
 *
 * 只记录现有系统已经做出的判断和结果，不参与聊天决策。这里的数据使用独立
 * localStorage key；关闭采集后不会新建记录，也不会补录关闭期间的聊天。
 */
(()=>{
 'use strict';

 const STORAGE_KEY='storyverse-debug-data-v1';
 const SCHEMA_VERSION=1;
 const DEFAULT_DATA={schema_version:SCHEMA_VERSION,collection_enabled:false,include_raw_text:true,records:[]};
 const storage=window.StoryVerseStorage;

 function normalize(source){
  const value=source&&typeof source==='object'?source:{};
  return {
   schema_version:SCHEMA_VERSION,
   collection_enabled:value.collection_enabled===true,
   include_raw_text:value.include_raw_text!==false,
   records:Array.isArray(value.records)?[...value.records]:[]
  };
 }

 let data=normalize(storage.readJSON(STORAGE_KEY,DEFAULT_DATA));
 function persist(){storage.writeJSON(STORAGE_KEY,data)}
 function isEnabled(){return data.collection_enabled}
 function setEnabled(enabled){data.collection_enabled=enabled===true;persist();return data.collection_enabled}
 function records(){return data.records}
 function find(recordId){return data.records.find(item=>item.record_id===recordId)}
 function findByMessage(messageId){return data.records.find(item=>item.user_message_id===messageId)}

 function sceneLocations(storyId){
  const result={};
  db.chats.filter(item=>item.storyId===storyId&&item.type==='scene').forEach(item=>{
   (item.scene?.presentCharacterIds||[]).forEach(characterId=>result[characterId]={scene_id:item.id,scene_name:item.name});
  });
  return result;
 }

 function snapshot(context){
  return {
   locations:sceneLocations(context.storyId),
   memory_ids:db.memories.filter(item=>item.storyId===context.storyId).map(item=>item.id),
   message_ids:db.messages.filter(item=>item.chatId===context.id).map(item=>item.id)
  };
 }

 function detectExistingRuleResult(text,context){
  const value=String(text||'').trim();
  const sceneNames=db.chats.filter(item=>item.storyId===context.storyId&&item.type==='scene').map(item=>item.name);
  const namedScene=sceneNames.sort((a,b)=>b.length-a.length).find(name=>value.includes(name))||'';
  const leave=/(离开|走出|退出|先走|告辞|回家|回宿舍)/.test(value);
  const travel=/(一起|我们|带|陪).{0,8}(去|前往|进入|到|回)|^(去|前往|进入|到|回)/.test(value);
  const completed=/(已经|刚刚|终于|现在).{0,8}(进入|来到|抵达|走进)/.test(value);
  if(leave)return{intent:'leave_scene',trigger_type:'scene_departure_rule',target:namedScene};
  if(travel&&completed)return{intent:'enter_scene',trigger_type:'completed_arrival_rule',target:namedScene};
  if(travel)return{intent:'propose_scene_travel',trigger_type:'travel_proposal_rule',target:namedScene};
  if(/[？?]$/.test(value)||/^(为什么|怎么|是否|能不能|可以吗|谁|哪里|什么)/.test(value))return{intent:'question',trigger_type:'question_rule',target:''};
  if(/^[（(].+[）)]/.test(value)||/(拿起|放下|走向|看向|推开|坐下|站起)/.test(value))return{intent:'roleplay_action',trigger_type:'action_rule',target:''};
  return{intent:'normal_dialogue',trigger_type:'default_dialogue_rule',target:''};
 }

 function beginTurn(context,userText){
  if(!isEnabled()||!context)return null;
  return {
   started_at:new Date().toISOString(),
   story_id:context.storyId,
   context_id:context.id,
   context_name:context.name,
   context_type:context.type==='scene'?'scene':'private',
   user_text:String(userText||''),
   before:snapshot(context)
  };
 }

 function movementDiff(before,after){
  const ids=new Set([...Object.keys(before.locations),...Object.keys(after.locations)]),changes=[];
  ids.forEach(id=>{
   const from=before.locations[id]||null,to=after.locations[id]||null;
   if(from?.scene_id===to?.scene_id)return;
   const person=db.characters.find(item=>item.id===id);
   changes.push({character_id:id,character_name:person?.name||id,from_scene_id:from?.scene_id||'',from_scene_name:from?.scene_name||'',to_scene_id:to?.scene_id||'',to_scene_name:to?.scene_name||''});
  });
  return changes;
 }

 function finishTurn(token,details={}){
  if(!token||!isEnabled())return null;
  const context=db.chats.find(item=>item.id===token.context_id);
  if(!context)return null;
  const after=snapshot(context),movements=movementDiff(token.before,after);
  const newMemoryIds=after.memory_ids.filter(id=>!token.before.memory_ids.includes(id));
  const newMessageIds=after.message_ids.filter(id=>!token.before.message_ids.includes(id));
  const judgement=detectExistingRuleResult(token.user_text,context);
  const responderIds=Array.isArray(details.responder_ids)?details.responder_ids:[];
  const primaryIds=context.type==='private'?(context.memberIds||[]):responderIds;
  const primaryNames=primaryIds.map(id=>db.characters.find(item=>item.id===id)||db.npcs?.find(item=>item.id===id)).filter(Boolean).map(item=>item.name);
  let action='ai_reply';
  if(movements.length)action=movements.map(move=>move.to_scene_name?`move_character:${move.character_name}->${move.to_scene_name}`:`leave_scene:${move.character_name}`).join('; ');
  else if(judgement.intent==='propose_scene_travel')action='show_scene_travel_suggestion';
  if(details.had_error)action=action==='ai_reply'?'ai_request_error':`${action}; ai_request_error`;
  if(newMemoryIds.length)action=`${action}; update_memory`;
  const ids=new Set(data.records.map(item=>item.record_id));
  const record={
   record_id:window.StoryVerseRecordId.create(ids),timestamp:new Date().toISOString(),
   story_id:token.story_id,story_name:db.stories.find(item=>item.id===token.story_id)?.name||'',
   context_id:token.context_id,context_name:token.context_name,context_type:token.context_type,
   primary_character_ids:primaryIds,primary_characters:primaryNames,
   user_message_id:details.user_message_id||'',user_input:data.include_raw_text?token.user_text:'',
   detected_intent:judgement.intent,trigger_type:judgement.trigger_type,detected_target:judgement.target,
   executed_action:action,scene_changed:movements.length>0,character_moved:movements.length>0,
   memory_updated:newMemoryIds.length>0,judgement_method:'rule',feedback_status:'unreviewed',
   error_category:'',corrected_intent:'',corrected_action:'',movements,new_memory_ids:newMemoryIds,
   result:{response_message_ids:newMessageIds.filter(id=>id!==details.user_message_id),had_error:details.had_error===true}
  };
  data.records.push(record);persist();return record;
 }

 function updateFeedback(recordId,feedback,corrected={}){
  const item=find(recordId);if(!item)return false;
  item.feedback_status=['correct','incorrect','unreviewed'].includes(feedback)?feedback:'unreviewed';
  const categories={wrong_responder:['wrong_responder','select_correct_responder'],wrong_leave_scene:['should_not_leave_scene','keep_character_in_scene'],wrong_enter_scene:['should_not_enter_scene','keep_character_outside_scene'],other:['other','other']};
  const category=item.feedback_status==='incorrect'&&categories[corrected.category]?corrected.category:'';
  item.error_category=category;
  item.corrected_intent=category?categories[category][0]:'';
  item.corrected_action=category?categories[category][1]:'';
  item.reviewed_at=item.feedback_status==='unreviewed'?'':new Date().toISOString();
  persist();return true;
 }

 function clearRecords(){data.records=[];persist()}
 function stats(){
  const result={total:data.records.length,reviewed:0,unreviewed:0,correct:0,incorrect:0,labels:{}};
  data.records.forEach(item=>{if(item.feedback_status==='correct'){result.correct++;result.reviewed++}else if(item.feedback_status==='incorrect'){result.incorrect++;result.reviewed++}else result.unreviewed++;result.labels[item.detected_intent]=(result.labels[item.detected_intent]||0)+1});
  return result;
 }

 const CSV_FIELDS=['record_id','timestamp','story_id','story_name','context_id','context_name','context_type','primary_characters','user_message_id','user_input','detected_intent','trigger_type','detected_target','executed_action','scene_changed','character_moved','memory_updated','judgement_method','feedback_status','error_category','corrected_intent','corrected_action'];
 function csvCell(value){const text=Array.isArray(value)?value.join('|'):String(value??'');return `"${text.replaceAll('"','""')}"`}
 function toCSV(){return '\uFEFF'+[CSV_FIELDS.join(','),...data.records.map(item=>CSV_FIELDS.map(key=>csvCell(item[key])).join(','))].join('\r\n')}
 function toJSON(){return JSON.stringify({schema_version:SCHEMA_VERSION,exported_at:new Date().toISOString(),record_count:data.records.length,records:data.records},null,2)}

 /** 不调用网络，也不修改业务数据；结束后恢复测试前的调试数据。 */
 function runSelfTest(){
  const original=JSON.parse(JSON.stringify(data)),rawBefore=localStorage.getItem(STORAGE_KEY),checks=[];
  const ok=(name,value)=>{if(!value)throw new Error(name);checks.push(`PASS ${name}`)};
  try{
   data=normalize(DEFAULT_DATA);ok('默认关闭数据采集',!isEnabled());
   const context=db.chats[0];ok('关闭时不创建记录',beginTurn(context,'测试消息')===null&&records().length===0);
   const generated=new Set(Array.from({length:500},()=>window.StoryVerseRecordId.create()));ok('record_id 500 次生成无重复',generated.size===500);
   setEnabled(true);const token=beginTurn(context,'我们一起去测试场景吧');ok('开启后创建轮次快照',!!token);
   const record=finishTurn(token,{user_message_id:'selftest-message',responder_ids:context.memberIds||[]});ok('完成后生成独立调试记录',!!record&&records().length===1&&record.record_id.startsWith('SV_'));
   updateFeedback(record.record_id,'incorrect',{category:'wrong_enter_scene'});ok('固定分类标注可以修改',record.feedback_status==='incorrect'&&record.error_category==='wrong_enter_scene'&&record.corrected_action==='keep_character_outside_scene');
   ok('统计数量正确',stats().total===1&&stats().incorrect===1&&stats().reviewed===1);
   ok('CSV 为 UTF-8 BOM 且字段稳定',toCSV().startsWith('\uFEFFrecord_id,timestamp,story_id')&&toCSV().includes(record.record_id));
   const json=JSON.parse(toJSON());ok('JSON 保留 record_id 和结构',json.records[0].record_id===record.record_id&&Array.isArray(json.records[0].movements));
   ok('导出不包含密钥字段',!toCSV().includes('apiKey')&&!toJSON().includes('api_key'));
   return checks;
  }finally{
   data=original;
   if(rawBefore===null)localStorage.removeItem(STORAGE_KEY);else localStorage.setItem(STORAGE_KEY,rawBefore);
  }
 }

 window.StoryVerseDebugData=Object.freeze({STORAGE_KEY,isEnabled,setEnabled,records,find,findByMessage,beginTurn,finishTurn,updateFeedback,clearRecords,stats,toCSV,toJSON,runSelfTest});
})();
