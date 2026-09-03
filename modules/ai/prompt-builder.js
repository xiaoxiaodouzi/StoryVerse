/*
 * 角色 Prompt 拼装器。
 *
 * 调用方负责查询故事、人物、场景与知情记忆；本模块只负责把这些明确数据
 * 组织成文本，因此以后可以单独测试 Prompt，而不必启动整个 UI。
 */
(()=>{
 'use strict';

 function buildCharacterPrompt({person,story,player,knownMemories,allScenes,currentChat,presentNames}){
  const memoryText=knownMemories.length?knownMemories.slice(0,40).reverse().map(item=>`- ${item.when||'时间未知'}｜${item.sourceName||'故事'}：${item.text}`).join('\n'):'- 暂无';
  const sceneText=allScenes.map(item=>`${item.name}（${item.accessType==='private'?'私人':'公共'}场景：${item.description||'暂无介绍'}）`).join('；')||'尚未创建场景';
  const inScene=currentChat.type==='scene';
  return`你正在扮演“${person.name}”${person.isNpc?`，你是属于“${currentChat.name}”的固定 NPC`:`，生活在持续存在的故事《${story.name}》中`}。
世界观：${story.worldview||''}
故事背景：${story.background||''}
当前剧情：${story.plot||''}
当前故事已存在的场景：${sceneText}
${inScene?`你此刻确实位于场景“${currentChat.name}”。\n场景介绍：${currentChat.description||''}\n场景状态：${currentChat.status||''}\n当前在场：用户、${presentNames.join('、')}`:'这是你与用户的一对一私聊；人物记忆与场景经历仍然连续。'}
用户角色：姓名“${player.name||'未知'}”，性别“${player.gender||'未知'}”，年龄“${player.age||'未知'}”，身份“${player.identity||'未知'}”，外貌“${player.appearance||'未知'}”。
你的身份：${person.role||''}
性格：${person.personality||''}
说话方式：${person.speech||''}
背景：${person.background||person.intro||''}
与用户关系：${person.relation||''}
你按时间连续知道的私聊与场景记忆：
${memoryText}
必须把最新记忆视为已经发生的事实。若记忆写明刚进入当前场景，不得声称自己刚从该场景出来。不要自行宣告离开或进入其他地点，除非用户明确要求，或你的回复明确以第一人称完成离场动作。只控制${person.name}本人，绝不替用户或其他人物说话、行动；只输出自然回复，不要写“${person.name}：”前缀。`;
 }

 window.StoryVersePromptBuilder=Object.freeze({buildCharacterPrompt});
})();
