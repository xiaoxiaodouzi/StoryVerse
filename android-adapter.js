/* Native bridge adapter. It is inert in the Windows browser build. */
(()=>{
 const native=window.StoryVerseAndroid;
 if(!native)return;
 document.documentElement.classList.add('android-app');
 const pending=new Map();let sequence=0;
 window.StoryVerseAndroidResponse=(id,status,payload)=>{
  const task=pending.get(id);if(!task)return;pending.delete(id);
  task.resolve(new Response(payload,{status:Number(status)||500,headers:{'Content-Type':'application/json; charset=utf-8'}}));
 };
 const browserFetch=window.fetch.bind(window);
 window.fetch=(input,init={})=>{
  const url=typeof input==='string'?input:input?.url;
  if(!/^\/api\/(chat|models|test)$/.test(url||''))return browserFetch(input,init);
  return new Promise((resolve,reject)=>{
   const id=`native-${Date.now()}-${++sequence}`;pending.set(id,{resolve,reject});
   try{native.request(id,url,String(init.body||'{}'))}catch(error){pending.delete(id);reject(error)}
  });
 };
 const fitViewport=()=>{
  const viewport=window.visualViewport;
  document.documentElement.style.setProperty('--app-height',`${Math.round(viewport?.height||window.innerHeight)}px`);
  if(document.activeElement?.matches?.('textarea,input,select'))requestAnimationFrame(()=>document.activeElement.scrollIntoView({block:'nearest'}));
 };
 window.visualViewport?.addEventListener('resize',fitViewport);
 window.visualViewport?.addEventListener('scroll',fitViewport);
 window.addEventListener('resize',fitViewport);fitViewport();
})();
