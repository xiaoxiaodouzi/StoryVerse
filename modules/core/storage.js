/*
 * StoryVerse 本地存储模块
 *
 * 这里统一处理 JSON 的读取、写入和删除。业务数据与调试数据使用不同的 key，
 * 因此清理训练记录时不会碰到故事、人物、聊天、记忆或 API 设置。
 */
(()=>{
 'use strict';

 function cloneFallback(value){
  if(value===undefined)return undefined;
  try{return structuredClone(value)}catch{return JSON.parse(JSON.stringify(value))}
 }

 function readJSON(key,fallback){
  try{
   const raw=localStorage.getItem(key);
   return raw===null?cloneFallback(fallback):JSON.parse(raw);
  }catch(error){
   console.warn(`[StoryVerseStorage] 无法读取 ${key}`,error);
   return cloneFallback(fallback);
  }
 }

 function writeJSON(key,value){
  localStorage.setItem(key,JSON.stringify(value));
  return value;
 }

 function remove(key){localStorage.removeItem(key)}

 window.StoryVerseStorage=Object.freeze({readJSON,writeJSON,remove});
})();
