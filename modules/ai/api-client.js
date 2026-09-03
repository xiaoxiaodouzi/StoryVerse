/* OpenAI-Compatible 聊天请求。模块不保存密钥，也不会把密钥写入日志。 */
(()=>{
 'use strict';

 async function chat({source,model,messages,temperature=.86,maxTokens=700}){
  const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseUrl:source.baseUrl,apiKey:source.apiKey,model,messages,temperature,maxTokens})});
  let body={};try{body=await response.json()}catch{}
  if(!response.ok)throw new Error(body.error||'连接 AI 失败，请检查智能体和接口设置。');
  return String(body.content||'');
 }

 window.StoryVerseApiClient=Object.freeze({chat});
})();
