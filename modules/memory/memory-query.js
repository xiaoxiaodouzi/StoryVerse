/* 记忆只读查询。写入与总结流程仍由原逻辑负责，以降低本次重构风险。 */
(()=>{
 'use strict';

 function knownByCharacter(database,person){
  return database.memories.filter(item=>item.storyId===person.storyId&&Array.isArray(item.knownBy)&&item.knownBy.includes(person.id)).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 }

 window.StoryVerseMemoryQuery=Object.freeze({knownByCharacter});
})();
