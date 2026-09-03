/* 手机优先的调试数据设置、人工标注与导出界面。 */
(()=>{
 'use strict';

 const debug=window.StoryVerseDebugData;
 const baseSettingsPage=window.settingsPage;
 const baseModal=window.modal;
 const baseBind=window.bind;
 const openDebugInitially=new URLSearchParams(location.search).get('section')==='debug';
 if(openDebugInitially)state.settingsView='debug';

 function debugPage(){
  const s=debug.stats(),labels=Object.entries(s.labels).sort((a,b)=>b[1]-a[1]);
  const rows=[...debug.records()].reverse().slice(0,100);
  return shell(`<main class="screen compact-screen debug-page">
   <section class="debug-collection ${debug.isEnabled()?'is-on':'is-off'}">
    <div><span class="debug-status-dot"></span><div><strong>${debug.isEnabled()?'正在采集':'已停止采集'}</strong><p>开启后，仅在本地记录用于开发和模型评测的数据；关闭后不会新增训练数据。</p></div></div>
    <button type="button" class="switch ${debug.isEnabled()?'on':''}" data-debug-toggle aria-label="切换数据采集"></button>
   </section>
   <section class="debug-stats" aria-label="调试数据统计">
    <div><strong>${s.total}</strong><span>总记录</span></div><div><strong>${s.reviewed}</strong><span>已标注</span></div><div><strong>${s.unreviewed}</strong><span>未标注</span></div><div><strong>${s.correct}</strong><span>判断正确</span></div><div><strong>${s.incorrect}</strong><span>判断错误</span></div>
   </section>
   <section class="debug-section"><div class="section-head compact"><h2>意图标签分布</h2></div><div class="debug-labels">${labels.map(([name,count])=>`<span>${e(name)} <b>${count}</b></span>`).join('')||'<p>还没有可统计的记录。</p>'}</div></section>
   <section class="debug-section"><div class="section-head compact"><h2>数据导出</h2></div><p class="inline-note">导出内容不包含 API Key、Token 或模型鉴权信息。CSV 使用 UTF-8 BOM，可直接用 Excel 或 Pandas 打开。</p><div class="debug-export-grid"><button data-debug-export="csv">保存 CSV</button><button data-debug-export="json">保存 JSON</button><button data-debug-share="csv">分享 CSV</button><button data-debug-share="json">分享 JSON</button></div></section>
   <section class="debug-section"><div class="section-head compact"><h2>最近记录</h2><small>最多显示 100 条</small></div><div class="debug-record-list">${rows.map(recordRow).join('')||'<div class="quiet-empty">开启采集并发送消息后，记录会显示在这里。</div>'}</div></section>
   <button class="debug-clear" data-debug-clear ${s.total?'':'disabled'}>清空全部调试数据</button>
  </main>`,appbar('调试数据','高级设置 · 仅保存在当前设备','settings'),'settings');
 }

 function recordRow(item){
  const feedback={correct:'正确',incorrect:'错误',unreviewed:'未标注'}[item.feedback_status]||'未标注';
  return`<button class="debug-record-row" data-debug-record="${e(item.record_id)}"><span class="debug-feedback ${e(item.feedback_status)}">${feedback}</span><div><strong>${e(item.detected_intent)}</strong><p>${e(item.user_input||'（未保存原始文本）')}</p><small>${e(item.context_name)} · ${e(new Date(item.timestamp).toLocaleString('zh-CN',{hour12:false}))}</small></div><i>›</i></button>`;
 }

 function feedbackModal(){
  const item=debug.find(state.debugRecordId);if(!item)return'';
  const incorrect=item.feedback_status==='incorrect';
  return`<div class="modal-layer"><section class="modal debug-feedback-modal"><div class="modal-handle"></div><div class="modal-head"><h2>判断结果反馈</h2><button class="icon-btn" data-close>×</button></div><div class="debug-record-summary"><span>${e(item.record_id)}</span><p>${e(item.user_input||'（未保存原始文本）')}</p><small>系统判断：${e(item.detected_intent)} · ${e(item.executed_action)}</small></div><form id="debug-feedback-form"><div class="field"><label>反馈状态</label><div class="debug-feedback-options"><label><input type="radio" name="feedback" value="correct" ${item.feedback_status==='correct'?'checked':''}><span>判断正确</span></label><label><input type="radio" name="feedback" value="incorrect" ${incorrect?'checked':''}><span>判断错误</span></label><label><input type="radio" name="feedback" value="unreviewed" ${item.feedback_status==='unreviewed'?'checked':''}><span>暂不判断</span></label></div></div><div class="field debug-error-category ${incorrect?'':'is-hidden'}" data-error-category><label>错误类型</label><div class="debug-category-options"><label><input type="radio" name="errorCategory" value="wrong_responder" ${item.error_category==='wrong_responder'?'checked':''}><span>回复人错误</span></label><label><input type="radio" name="errorCategory" value="wrong_leave_scene" ${item.error_category==='wrong_leave_scene'?'checked':''}><span>错误离开场景</span></label><label><input type="radio" name="errorCategory" value="wrong_enter_scene" ${item.error_category==='wrong_enter_scene'?'checked':''}><span>错误进入场景</span></label><label><input type="radio" name="errorCategory" value="other" ${item.error_category==='other'?'checked':''}><span>其他</span></label></div><small>选择固定分类即可，不需要手动填写标签。</small></div><div class="modal-actions"><button type="button" class="btn" data-close>取消</button><button class="btn primary">保存标注</button></div></form></section></div>`;
 }

 window.settingsPage=function(){if(state.settingsView==='debug')return debugPage();return baseSettingsPage()};
 window.modal=function(){
  if(state.modal==='debugFeedback')return feedbackModal();
  let html=baseModal();
  if(state.modal==='bubbleActions'){
   const record=debug.findByMessage(state.actionMessageId);
   if(record&&!state.confirmDelete){
    const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h16v13H8l-4 3z"/><path d="m8 10 2.2 2.2L16 7"/></svg>';
    html=html.replace('</div></section>',`<button class="debug-menu-action" data-debug-feedback="${e(record.record_id)}" role="menuitem"><b>${icon}</b><span>判断反馈</span></button></div></section>`);
   }
  }
  return html;
 };

 function utf8Base64(text){
  const bytes=new TextEncoder().encode(text);let binary='';
  for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(binary);
 }
 function exportName(type){const stamp=new Date().toISOString().slice(0,19).replaceAll(':','-');return`StoryVerse-debug-${stamp}.${type}`}
 function browserDownload(name,mime,content){const url=URL.createObjectURL(new Blob([content],{type:mime})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 function exportData(type,share=false){
  if(!debug.records().length){toast('当前没有可导出的调试数据');return}
  const isCSV=type==='csv',content=isCSV?debug.toCSV():debug.toJSON(),mime=isCSV?'text/csv':'application/json',name=exportName(type),native=window.StoryVerseAndroid;
  try{
   if(native?.saveExport){const payload=utf8Base64(content);if(share&&native.shareExport)native.shareExport(name,mime,payload);else native.saveExport(name,mime,payload);return}
   browserDownload(name,`${mime};charset=utf-8`,content);toast(`${type.toUpperCase()} 已导出`);
  }catch(error){console.error(error);toast('导出失败，请稍后重试')}
 }

 window.bind=function(){
  baseBind();
  document.querySelectorAll('[data-setting-section]').forEach(row=>{if(row.textContent.includes('高级设置'))row.onclick=()=>{state.settingsView='debug';render()}});
  document.querySelector('[data-debug-toggle]')?.addEventListener('click',()=>{const enabled=debug.setEnabled(!debug.isEnabled());render();toast(enabled?'数据采集已开启':'数据采集已停止')});
  document.querySelectorAll('[data-debug-record]').forEach(row=>row.onclick=()=>{state.debugRecordId=row.dataset.debugRecord;state.modal='debugFeedback';render()});
  document.querySelectorAll('[data-debug-feedback]').forEach(button=>button.onclick=()=>{state.debugRecordId=button.dataset.debugFeedback;state.modal='debugFeedback';state.confirmDelete=false;render()});
  const form=document.querySelector('#debug-feedback-form');if(form){const category=document.querySelector('[data-error-category]'),categoryInputs=[...form.querySelectorAll('[name=errorCategory]')],syncCategory=()=>{const incorrect=form.querySelector('[name=feedback]:checked')?.value==='incorrect';category?.classList.toggle('is-hidden',!incorrect);categoryInputs.forEach((input,index)=>input.required=incorrect&&index===0)};form.querySelectorAll('[name=feedback]').forEach(input=>input.onchange=syncCategory);syncCategory();form.onsubmit=event=>{event.preventDefault();const values=new FormData(form);debug.updateFeedback(state.debugRecordId,values.get('feedback'),{category:values.get('errorCategory')});state.modal=null;render();toast('标注已保存')}};
  document.querySelectorAll('[data-debug-export]').forEach(button=>button.onclick=()=>exportData(button.dataset.debugExport,false));
  document.querySelectorAll('[data-debug-share]').forEach(button=>button.onclick=()=>exportData(button.dataset.debugShare,true));
  document.querySelector('[data-debug-clear]')?.addEventListener('click',()=>{if(!confirm('确定清空全部调试数据吗？故事和聊天不会被删除。'))return;if(!confirm('调试数据清空后无法恢复，仍然继续吗？'))return;debug.clearRecords();render();toast('调试数据已清空')});
 };

 if(new URLSearchParams(location.search).get('debugselftest')==='1')setTimeout(()=>{
  try{const checks=debug.runSelfTest();document.querySelector('#app').innerHTML=`<pre id="debug-selftest" style="color:#8fffcf;padding:28px;white-space:pre-wrap">${checks.join('\n')}\nALL DEBUG TESTS PASSED</pre>`}
  catch(error){document.querySelector('#app').innerHTML=`<pre id="debug-selftest" style="color:#ff9cab;padding:28px;white-space:pre-wrap">DEBUG TEST FAILED\n${e(error.message)}</pre>`}
 },0);
 else if(openDebugInitially)render();
})();
