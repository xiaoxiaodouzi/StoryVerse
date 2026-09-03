/* 为调试记录创建全局唯一 ID，不依赖容易冲突的自增序号。 */
(()=>{
 'use strict';

 function randomPart(){
  if(globalThis.crypto?.randomUUID)return crypto.randomUUID().replaceAll('-','');
  const bytes=new Uint8Array(12);
  if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(bytes);
  else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
  return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
 }

 function create(existingIds=[]){
  const known=existingIds instanceof Set?existingIds:new Set(existingIds);
  let id;
  do{
   const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
   id=`SV_${stamp}_${randomPart().slice(0,12)}`;
  }while(known.has(id));
  return id;
 }

 window.StoryVerseRecordId=Object.freeze({create});
})();
