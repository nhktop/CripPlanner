import './style.css';

const $ = (s, root=document) => root.querySelector(s);
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem('nhk-'+key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { localStorage.setItem('nhk-'+key, JSON.stringify(value)); }
};
let tasks = store.get('tasks', []);
let points = Number(store.get('points', 0)) || 0;
let completedDays = store.get('completedDays', []);
let notifiedTasks = store.get('notifiedTasks', []);
let selectedTaskId = null;
let notes = store.get('notes', '');
let events = store.get('events', []);
let projects = store.get('projects', []);
let activeDay = localDate();
let currentPage = 'dashboard';
let calendarMode = 'week';
let plannerPrefs = store.get('plannerPrefs', {start:'15:00',end:'21:00'});
let planDay = localDate();
const icons = { dashboard:'⌂', tasks:'✓', calendar:'▦', notes:'▤', projects:'◇' };

$('#root').innerHTML = `
<div class="app-shell">
  <aside class="sidebar">
    <a class="brand" href="#"><span class="brand-mark">N</span><span>NHK<span class="brand-muted"> / COMMAND</span></span></a>
    <div class="side-label">WORKSPACE</div>
    <nav class="nav">
      <button class="nav-item active" data-page="dashboard"><span>⌂</span> Overview</button>
      <button class="nav-item" data-page="tasks"><span>✓</span> Tasks <b id="task-count">0</b></button>
      <button class="nav-item" data-page="calendar"><span>▦</span> Calendar</button>
      <button class="nav-item" data-page="smart-plan"><span>◷</span> Smart plan</button>
      <button class="nav-item" data-page="integrations"><span>↗</span> Integrations</button>
      <button class="nav-item" data-page="notes"><span>▤</span> Quick notes</button>
      <button class="nav-item" data-page="projects"><span>◇</span> Projects</button>
    </nav>
    <div class="sidebar-bottom"><div class="profile-dot">N</div><div><strong>Personal space</strong><small>All systems ready</small></div><span class="online-dot"></span></div>
  </aside>
  <main class="main">
    <header class="topbar"><div class="breadcrumb">WORKSPACE <span>/</span> <b id="crumb">OVERVIEW</b></div><div class="top-actions"><span class="today-label" id="today-label"></span><span class="points-pill" id="points-pill">✦ 0 XP</span><span class="avatar">N</span></div></header>
    <section class="page" id="page"></section>
    <footer>NHK COMMAND CENTER <span>YOUR SPACE. YOUR FLOW.</span></footer>
  </main>
</div>`;

function localDate(d=new Date()) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function dateLong(d=new Date()) { return d.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}); }
function timeNow() { const d=new Date(); if($('#clock'))$('#clock').textContent=d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}); if($('#clock-date'))$('#clock-date').textContent=dateLong(d); }
setInterval(timeNow,1000);
$('#today-label').textContent = new Date().toLocaleDateString([], {month:'short',day:'numeric',year:'numeric'});

function weather() {
  const target=$('#weather'); if(!target)return;
  if (!navigator.geolocation) { target.innerHTML='<span class="weather-icon">☁</span><div><strong>Weather unavailable</strong><small>Location access is disabled</small></div>'; return; }
  navigator.geolocation.getCurrentPosition(async p => {
    try {
      const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.coords.latitude}&longitude=${p.coords.longitude}&current=temperature_2m,weather_code&timezone=auto`);
      const j=await r.json(); const t=Math.round(j.current.temperature_2m);
      const labels={0:'Clear sky',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',45:'Foggy',48:'Foggy',51:'Light drizzle',61:'Rain',71:'Snow',80:'Rain showers',95:'Thunderstorm'};
      const el=$('#weather');if(el)el.innerHTML=`<span class="weather-icon">${j.current.weather_code===0?'☀':'☁'}</span><div><strong>${t}°C · ${labels[j.current.weather_code]||'Current conditions'}</strong><small>Local weather · Live</small></div>`;
    } catch { const el=$('#weather');if(el)el.innerHTML='<span class="weather-icon">☁</span><div><strong>Weather unavailable</strong><small>Could not load forecast</small></div>'; }
  }, () => {const el=$('#weather');if(el)el.innerHTML='<span class="weather-icon">☀</span><div><strong>Location not shared</strong><small>Allow location for local weather</small></div>';}, {timeout:8000});
}
function saveAll(){store.set('tasks',tasks);store.set('events',events);store.set('projects',projects);store.set('plannerPrefs',plannerPrefs);$('#task-count').textContent=tasks.filter(t=>!t.done).length;const xp=$('#points-pill');if(xp)xp.textContent='✦ '+points+' XP';}
function go(page){currentPage=page;$('.nav-item.active')?.classList.remove('active');$(`[data-page="${page}"]`)?.classList.add('active');$('#crumb').textContent=page.toUpperCase();render(page);}
document.addEventListener('click',e=>{
 const nav=e.target.closest('[data-page]'); if(nav) go(nav.dataset.page);
 const openTask=e.target.closest('[data-open-task]'); if(openTask){openTaskDetails(openTask.dataset.openTask);return;}
 const cancelTask=e.target.closest('[data-cancel-task]');if(cancelTask){cancelSelectedTask();return;}
 const complete=e.target.closest('[data-complete-task]'); if(complete){completeSelectedTask();return;}
 const closeTask=e.target.closest('[data-close-task]'); if(closeTask){hideTaskDetails();return;}
 const stopRepeat=e.target.closest('[data-stop-repeat]');if(stopRepeat){stopRepeatingSelectedTask();return;}
 const del=e.target.closest('[data-delete]');if(del){tasks=tasks.filter(x=>x.id!==del.dataset.delete);saveAll();render('tasks');}
 const pdel=e.target.closest('[data-project-delete]');if(pdel){projects=projects.filter(x=>x.id!==pdel.dataset.projectDelete);saveAll();render('projects');}
});
function taskMarkup(t){return `<div class="task-row ${t.done?'is-done':''} ${t.cancelled?'is-cancelled':''}" data-open-task="${t.id}" role="button" tabindex="0" aria-label="Open task ${esc(t.title)}"><button class="check ${t.done?'checked':''}" data-open-task="${t.id}" title="Open task">${t.done?'✓':t.cancelled?'–':''}</button><div class="task-info"><strong>${esc(t.title)}${t.cancelled?' · CANCELLED':''}</strong><small>${t.date?new Date(t.date+'T12:00:00').toLocaleDateString([], {month:'short',day:'numeric'}):'No due date'} · ${esc(t.time||'Unscheduled')} · ${Number(t.duration)||30} min${t.source==='email'?' · EMAIL':''}${t.repeatWeekly?' · ↻ WEEKLY':''}</small></div><span class="priority ${t.priority||'normal'}">${t.priority||'normal'}</span><button class="icon-btn" data-delete="${t.id}" title="Delete task">×</button></div>`;}
function streakCount(){const set=new Set(completedDays);let d=new Date();if(!set.has(localDate(d))){d.setDate(d.getDate()-1);if(!set.has(localDate(d)))return 0;}let count=0;while(set.has(localDate(d))){count++;d.setDate(d.getDate()-1);}return count;}
function cancelSelectedTask(){const t=tasks.find(x=>x.id===selectedTaskId);if(!t||t.done||t.cancelled)return;t.cancelled=true;saveAll();hideTaskDetails();render(currentPage);toast('Task cancelled — no points awarded');}
function taskPoints(t){const mins=Number(t.duration)||30;return Math.max(5,Math.round(mins/15)*5)+(t.priority==='high'?5:0);}
function openTaskDetails(id){const t=tasks.find(x=>x.id===id);if(!t)return;selectedTaskId=id;const modal=$('#task-detail-modal');$('#task-detail-title').textContent=t.title;$('#task-detail-meta').textContent=(t.date?new Date(t.date+'T12:00:00').toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'}):'No due date')+' · '+(t.time||'Unscheduled')+' · '+(Number(t.duration)||30)+' min'+(t.repeatWeekly?' · Repeats every week':'');$('#task-detail-priority').textContent=(t.priority||'normal').toUpperCase()+' PRIORITY';$('#task-detail-description').textContent=t.details||'No extra details for this task.';$('#task-detail-reward').textContent=t.done?'Already completed':`+${taskPoints(t)} points`;$('#task-detail-complete').hidden=!!t.done;$('#task-detail-complete').textContent='Complete task · +'+taskPoints(t)+' points';$('#task-detail-stop-repeat').hidden=!t.seriesId;$('#task-detail-cancel').hidden=!!(t.done||t.cancelled);$('#task-detail-complete').hidden=!!(t.done||t.cancelled);modal.hidden=false;document.body.classList.add('modal-open');}
function hideTaskDetails(){const modal=$('#task-detail-modal');if(modal)modal.hidden=true;selectedTaskId=null;if(focusModal.hidden&&commandModal.hidden)document.body.classList.remove('modal-open');}
function completeSelectedTask(){const t=tasks.find(x=>x.id===selectedTaskId);if(!t||t.done||t.cancelled)return;const earned=taskPoints(t);t.done=true;t.pointsAwarded=earned;points+=earned;if(!completedDays.includes(localDate()))completedDays.push(localDate());store.set('completedDays',completedDays);store.set('points',points);if(t.seriesId){const nextDate=addDays(t.date||localDate(),7);if(!tasks.some(x=>x.seriesId===t.seriesId&&x.date>=nextDate)){tasks.push({...t,id:crypto.randomUUID(),date:nextDate,done:false,pointsAwarded:undefined});}}saveAll();hideTaskDetails();render(currentPage);toast(`Task completed! +${earned} points${t.seriesId?' · Next week added':''} · Total: ${points}`);}
function addDays(date,days){const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+days);return localDate(d);}
function syncWeeklyTasks(){const weekStart=new Date();weekStart.setDate(weekStart.getDate()-weekStart.getDay());const cutoff=localDate(weekStart);const series=[...new Set(tasks.filter(t=>t.seriesId).map(t=>t.seriesId))];for(const id of series){let entries=tasks.filter(t=>t.seriesId===id).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));if(!entries.length)continue;let latest=entries[entries.length-1];while(latest.date&&latest.date<cutoff){const date=addDays(latest.date,7);const next={...latest,id:crypto.randomUUID(),date,done:false,pointsAwarded:undefined};tasks.push(next);latest=next;}}}
function stopRepeatingSelectedTask(){const t=tasks.find(x=>x.id===selectedTaskId);if(!t?.seriesId)return;const seriesId=t.seriesId;tasks=tasks.filter(x=>x.seriesId!==seriesId);saveAll();hideTaskDetails();render(currentPage);toast('Weekly repetition stopped and all its tasks removed');}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function taskForm(){return `<form id="task-form" class="add-form task-form"><input name="title" placeholder="What needs to get done?" required maxlength="100"><input name="date" type="date" aria-label="Due date"><input name="time" type="time" aria-label="Preferred start time"><select name="duration" aria-label="Estimated duration"><option value="15">15 min</option><option value="30" selected>30 min</option><option value="45">45 min</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option><option value="180">3 hours</option></select><select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select><label class="repeat-option"><input type="checkbox" name="repeatWeekly"> <span>↻ Repeat every week</span></label><button class="primary-btn">Add task +</button></form>`;}
function addEventFromForm(form){const f=new FormData(form);events.push({id:crypto.randomUUID(),title:f.get('title'),time:f.get('time'),date:activeDay,duration:Number(f.get('duration'))||60});store.set('events',events);render('calendar');}
function minutes(value){const [h,m]=String(value||'00:00').split(':').map(Number);return h*60+(m||0);}
function clock(value){return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');}
function overlaps(a,b,c,d){return a<d&&c<b;}
function buildSmartPlan(day){
 const start=minutes(plannerPrefs.start),end=minutes(plannerPrefs.end);
 if(end<=start){toast('End time must be later than start time');return {placed:0,left:tasks.filter(t=>!t.done&&!t.time).length};}
 const eligible=tasks.filter(t=>!t.done&&(!t.date||t.date<=day));
 const fixed=eligible.filter(t=>t.date===day&&t.time);
 const pending=eligible.filter(t=>!(t.date===day&&t.time));
 const blocks=[...events.filter(e=>e.date===day&&e.time).map(e=>({start:minutes(e.time),end:minutes(e.time)+(Number(e.duration)||60)})),...fixed.map(t=>({start:minutes(t.time),end:minutes(t.time)+(Number(t.duration)||30)}))];
 pending.sort((a,b)=>({high:0,normal:1,low:2}[a.priority||'normal']-({high:0,normal:1,low:2}[b.priority||'normal']) )||String(a.date||'9999-12-31').localeCompare(String(b.date||'9999-12-31')));
 let placed=0,left=0;
 for(const t of pending){const duration=Math.max(15,Number(t.duration)||30);let slot=-1;
  for(let candidate=start;candidate+duration<=end;candidate+=15){if(!blocks.some(x=>overlaps(candidate,candidate+duration,x.start,x.end))){slot=candidate;break;}}
  if(slot<0){left++;continue;}
  t.date=day;t.time=clock(slot);blocks.push({start:slot,end:slot+duration});placed++;
 }
 return {placed,left};
}
function renderWeekBoard(days){
 const hours=Array.from({length:14},(_,i)=>i+8);
 let html='<div class="week-scroll"><div class="week-board"><div class="week-corner">TIME</div>';
 days.forEach(d=>{const date=localDate(d);html+=`<div class="week-day-head ${date===localDate()?'is-today':''}">${d.toLocaleDateString([],{weekday:'short'})}<strong>${d.getDate()}</strong></div>`;});
 hours.forEach((h,index)=>{html+=`<div class="week-hour" style="grid-row:${index+2};grid-column:1">${clock(h*60)}</div>`;days.forEach(d=>{const date=localDate(d);html+=`<div class="week-slot" data-slot-date="${date}" data-slot-time="${clock(h*60)}" style="grid-row:${index+2};grid-column:${days.indexOf(d)+2}"></div>`;});});
 const cards=[...events.filter(e=>e.date&&days.some(d=>localDate(d)===e.date)&&e.time).map(e=>({...e,kind:'event',duration:Number(e.duration)||60})),...tasks.filter(t=>!t.done&&!t.cancelled&&t.date&&days.some(d=>localDate(d)===t.date)&&t.time).map(t=>({...t,kind:'task',duration:Number(t.duration)||30}))];
 cards.forEach(item=>{const dayIndex=days.findIndex(d=>localDate(d)===item.date);const mins=minutes(item.time);const hour=Math.floor(mins/60);if(dayIndex<0||hour<8||hour>=22)return;const row=2+(hour-8);const span=Math.max(1,Math.min(14-(hour-8),Math.ceil(item.duration/60)));html+=`<div class="week-card ${item.kind}" draggable="true" data-drag-${item.kind}="${item.id}" style="grid-row:${row}/span ${span};grid-column:${dayIndex+2};margin-top:${(mins%60)/60*64}px"><strong>${esc(item.title)}</strong><small>${esc(item.time)} · ${item.duration}m</small></div>`;});
 html+='</div></div><div class="panel unscheduled-panel"><div class="panel-head"><div><h2>Unscheduled tasks</h2><p>Drag a task onto the week to give it a time</p></div></div>';
 const unscheduled=tasks.filter(t=>!t.done&&!t.cancelled&&(!t.time||!t.date));
 html+=unscheduled.length?'<div class="unscheduled-list">'+unscheduled.map(t=>`<div class="unscheduled-task" draggable="true" data-drag-task="${t.id}"><strong>${esc(t.title)}</strong><small>${Number(t.duration)||30} min · ${esc(t.priority||'normal')}</small></div>`).join('')+'</div>':'<div class="empty">All tasks have a date and time. Nice!</div>';
 return html+'</div>';
}
document.addEventListener('dragstart',e=>{const task=e.target.closest('[data-drag-task]'),event=e.target.closest('[data-drag-event]');if(task){e.dataTransfer.setData('text/plain','task:'+task.dataset.dragTask);e.dataTransfer.effectAllowed='move';}else if(event){e.dataTransfer.setData('text/plain','event:'+event.dataset.dragEvent);e.dataTransfer.effectAllowed='move';}});
document.addEventListener('dragover',e=>{if(e.target.closest('[data-slot-date]'))e.preventDefault();});
document.addEventListener('drop',e=>{const slot=e.target.closest('[data-slot-date]');if(!slot)return;e.preventDefault();const payload=e.dataTransfer.getData('text/plain').split(':');const [kind,id]=payload;if(kind==='task'){const t=tasks.find(x=>x.id===id);if(t){t.date=slot.dataset.slotDate;t.time=slot.dataset.slotTime;saveAll();render('calendar');toast('Task scheduled on calendar');}}else if(kind==='event'){const item=events.find(x=>x.id===id);if(item){item.date=slot.dataset.slotDate;item.time=slot.dataset.slotTime;store.set('events',events);render('calendar');toast('Event moved');}}});
function importICS(text){
 const unfolded=text.replace(/\r?\n[ \t]/g,'');const chunks=unfolded.split('BEGIN:VEVENT').slice(1);let added=0;
 for(const chunk of chunks){const body=chunk.split('END:VEVENT')[0];const get=name=>{const line=body.split(/\r?\n/).find(x=>x.startsWith(name+':')||x.startsWith(name+';'));return line?line.slice(line.indexOf(':')+1).trim():'';};
  const summary=get('SUMMARY').replace(/\\n/g,' ').replace(/\\,/g,',').replace(/\\;/g,';');const rawStart=get('DTSTART');if(!summary||!rawStart)continue;
  const allDay=/^\d{8}$/.test(rawStart);const date=allDay?rawStart.slice(0,4)+'-'+rawStart.slice(4,6)+'-'+rawStart.slice(6,8):rawStart.slice(0,4)+'-'+rawStart.slice(4,6)+'-'+rawStart.slice(6,8);const time=allDay?'':rawStart.length>=15?rawStart.slice(9,11)+':'+rawStart.slice(11,13):'';
  const rawEnd=get('DTEND');let duration=60;if(rawEnd&&!allDay&&rawEnd.length>=15){const endMin=Number(rawEnd.slice(9,11))*60+Number(rawEnd.slice(11,13));duration=Math.max(15,endMin-minutes(time));}
  if(events.some(e=>e.title===summary&&e.date===date&&e.time===time))continue;
  events.push({id:crypto.randomUUID(),title:summary,date,time,duration,source:'ics'});added++;
 }
 return added;
}
function exportICS(){
 const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//CripPlanner//EN'];
 const entries=[...events.map(e=>({...e,kind:'event'})),...tasks.filter(t=>!t.done&&t.date&&t.time).map(t=>({...t,kind:'task',title:'Task: '+t.title,duration:Number(t.duration)||30}))];
 entries.forEach((e,i)=>{const day=(e.date||'').replace(/-/g,'');if(!/^\d{8}$/.test(day))return;const start=e.time?day+'T'+e.time.replace(':','')+'00':day;lines.push('BEGIN:VEVENT','UID:cripplanner-'+i+'-'+day+'@local','DTSTAMP:'+stamp,e.time?'DTSTART:'+start:'DTSTART;VALUE=DATE:'+day,'SUMMARY:'+String(e.title).replace(/[\\;,]/g,' ').replace(/\n/g,' '));if(e.time){const end=minutes(e.time)+(Number(e.duration)||60);lines.push('DURATION:PT'+Math.floor((Number(e.duration)||60)/60)+'H'+((Number(e.duration)||60)%60)+'M');}lines.push('END:VEVENT');});
 lines.push('END:VCALENDAR');const blob=new Blob([lines.join('\r\n')],{type:'text/calendar;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='cripplanner-calendar.ics';a.click();URL.revokeObjectURL(url);
}

function render(page='dashboard'){
 const open=tasks.filter(t=>!t.done&&!t.cancelled), done=tasks.filter(t=>t.done), cancelled=tasks.filter(t=>t.cancelled);
 const completion=tasks.length?Math.round(done.length/tasks.length*100):0;
 if(page==='dashboard'){
 $('#page').innerHTML=`
 <div class="welcome"><div><div class="eyebrow">YOUR PERSONAL CONTROL PANEL</div><h1>Good ${new Date().getHours()<12?'morning':new Date().getHours()<18?'afternoon':'evening'}.</h1><p>Everything you need, in one place.</p></div><div class="welcome-actions"><button class="primary-btn" data-page="smart-plan">✦ Plan my day</button><div class="date-chip">✦ &nbsp;${dateLong()}</div></div></div>
 <div class="hero-grid"><div class="clock-card"><div class="card-kicker">LOCAL TIME <span class="live-pill">● LIVE</span></div><div class="clock" id="clock">--:--:--</div><div id="clock-date" class="muted"></div></div><div class="weather-card"><div class="card-kicker">WEATHER</div><div id="weather" class="weather-content"><span class="weather-icon">◌</span><div><strong>Checking weather…</strong><small>Using your device location</small></div></div><small class="muted">Powered by Open-Meteo</small></div></div>
 <div class="stats-grid"><div class="stat-card"><span>POINTS EARNED</span><strong>${points}</strong><small>Keep building momentum</small></div><div class="stat-card"><span>OPEN TASKS</span><strong>${open.length}</strong><small>Ready when you are</small></div><div class="stat-card"><span>COMPLETED</span><strong>${done.length}</strong><small>Nice progress</small></div><div class="stat-card"><span>PROJECTS</span><strong>${projects.length}</strong><small>Things in motion</small></div></div>
 <div class="streak-strip"><div><span class="eyebrow">DAILY STREAK</span><strong>🔥 ${streakCount()} day${streakCount()===1?'':'s'}</strong><small>Complete at least one task each day to keep it going.</small></div><div class="streak-calendar">${Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));const key=localDate(d);return `<span class="${completedDays.includes(key)?'hit':''}">${d.toLocaleDateString([],{weekday:'short'})}</span>`;}).join('')}</div></div><div class="notification-panel"><div><strong>Task reminders</strong><small>Get a browser notification on the task's due day, including its scheduled time.</small></div><button class="secondary-btn" id="enable-notifications">${Notification.permission==='granted'?'Notifications enabled':'Enable notifications'}</button></div><div class="progress-panel"><div class="progress-copy"><div class="eyebrow">MISSION PROGRESS</div><h2>Your momentum</h2><p>${done.length} of ${tasks.length} tasks completed. Keep your streak moving.</p><div class="progress-track"><span style="width:${completion}%"></span></div></div><div class="progress-ring" style="--progress:${completion}%"><strong>${completion}%</strong><small>COMPLETE</small></div></div><div class="content-grid"><div class="panel"><div class="panel-head"><div><h2>Today's focus</h2><p>Your next things to do</p></div><button class="text-btn" data-page="tasks">All tasks ↗</button></div>${open.slice(0,4).map(taskMarkup).join('')||'<div class="empty">You are all caught up. Add a task when you need one.</div>'}</div><div class="panel"><div class="panel-head"><div><h2>Quick note</h2><p>Ideas worth keeping</p></div><button class="text-btn" data-page="notes">Open notes ↗</button></div><textarea id="dash-note" class="note-area" placeholder="Write something down…">${esc(notes)}</textarea><div class="save-hint" id="note-status">Saved on this device</div></div></div>`;
 timeNow();weather();$('#dash-note').addEventListener('input',e=>{notes=e.target.value;store.set('notes',notes);$('#note-status').textContent='Saved';});
 } else if(page==='tasks'){
 $('#page').innerHTML=`<div class="page-heading"><div><div class="eyebrow">STAY ON TRACK</div><h1>Tasks</h1><p>Plan it, do it, tick it off.</p></div><div class="count-chip">${open.length} OPEN</div></div><div class="panel"><div class="panel-head"><div><h2>Add a task</h2><p>Set a due date, time and priority</p></div></div>${taskForm()}</div><div class="panel task-panel"><div class="panel-head"><div><h2>To do</h2><p>${open.length} tasks remaining</p></div></div>${open.map(taskMarkup).join('')||'<div class="empty">No open tasks. Enjoy the breathing room.</div>'}</div><div class="panel task-panel"><div class="panel-head"><div><h2>Completed</h2><p>${done.length} finished</p></div></div>${done.map(taskMarkup).join('')||'<div class="empty">Completed tasks will appear here.</div>'}</div><div class="panel task-panel"><div class="panel-head"><div><h2>Cancelled</h2><p>${cancelled.length} cancelled · no points awarded</p></div></div>${cancelled.map(taskMarkup).join('')||'<div class="empty">Cancelled tasks will appear here.</div>'}</div>`;
 $('#task-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);const repeat=f.get('repeatWeekly')==='on';const id=crypto.randomUUID();tasks.unshift({id,title:f.get('title'),date:f.get('date')||localDate(),time:f.get('time'),duration:Number(f.get('duration'))||30,priority:f.get('priority'),done:false,repeatWeekly:repeat,seriesId:repeat?id:null});saveAll();render('tasks');toast(repeat?'Weekly repeating task added':'Task added');});
 } else if(page==='notes'){
 $('#page').innerHTML=`<div class="page-heading"><div><div class="eyebrow">THINK OUT LOUD</div><h1>Quick notes</h1><p>A quiet place for ideas, reminders and drafts.</p></div></div><div class="panel notes-panel"><div class="panel-head"><div><h2>Your notes</h2><p>Automatically saved in this browser</p></div><span class="saved-tag">● AUTO-SAVE</span></div><textarea id="notes-editor" class="big-notes" placeholder="Start writing…">${esc(notes)}</textarea><div class="save-hint" id="note-status">Saved on this device</div></div>`;
 $('#notes-editor').addEventListener('input',e=>{notes=e.target.value;store.set('notes',notes);$('#note-status').textContent='Saved just now';});
 } else if(page==='calendar'){
 const first=new Date(activeDay+'T12:00:00');const monthStart=new Date(first.getFullYear(),first.getMonth(),1);const start=new Date(monthStart);start.setDate(1-monthStart.getDay());const days=Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d;});
 const weekStart=new Date(activeDay+'T12:00:00');weekStart.setDate(weekStart.getDate()-weekStart.getDay());const weekDays=Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setDate(weekStart.getDate()+i);return d;});
 const weekBoard=calendarMode==='week'?renderWeekBoard(weekDays):'';
 $('#page').innerHTML=`<div class="page-heading"><div><div class="eyebrow">YOUR SCHEDULE · DRAG TO RESCHEDULE</div><h1>Calendar</h1><p>Plan the week in time blocks. Drag tasks onto a slot to schedule them.</p></div><div class="calendar-switch"><button class="${calendarMode==='week'?'selected':''}" id="week-mode">Week</button><button class="${calendarMode==='month'?'selected':''}" id="month-mode">Month</button></div></div>
 <div class="panel calendar-toolbar"><div class="calendar-head"><button class="icon-btn" id="prev-period">‹</button><h2>${calendarMode==='week'?weekDays[0].toLocaleDateString([],{month:'short',day:'numeric'})+' – '+weekDays[6].toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'}):first.toLocaleDateString([],{month:'long',year:'numeric'})}</h2><button class="icon-btn" id="next-period">›</button></div><button class="secondary-btn" id="calendar-today">Today</button></div>
 ${calendarMode==='week'?weekBoard:`<div class="panel"><div class="calendar-grid">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>'<div class="weekday">'+x+'</div>').join('')}${days.map(d=>`<button class="day ${d.getMonth()!==first.getMonth()?'outside':''} ${localDate(d)===activeDay?'selected':''}" data-day="${localDate(d)}">${d.getDate()}${events.some(x=>x.date===localDate(d))||tasks.some(x=>x.date===localDate(d))?'<i></i>':''}</button>`).join('')}</div></div><div class="panel"><div class="panel-head"><div><h2>${new Date(activeDay+'T12:00:00').toLocaleDateString([],{month:'short',day:'numeric'})}</h2><p>Events and tasks for selected day</p></div></div><form id="event-form" class="event-form"><input name="title" placeholder="Add an event…" required><input name="time" type="time" aria-label="Event time"><select name="duration"><option value="30">30 min</option><option value="60" selected>1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select><button class="primary-btn">Add event</button></form><div class="event-list">${events.filter(x=>x.date===activeDay).map(x=>`<div class="event-row"><span class="event-dot"></span><div><strong>${esc(x.title)}</strong><small>${esc(x.time||'All day')} · ${Number(x.duration)||60} min</small></div><button class="icon-btn" data-event-delete="${x.id}">×</button></div>`).join('')||'<div class="empty">Nothing planned for this day.</div>'}</div><h3 class="subhead">Tasks on this day</h3>${tasks.filter(x=>x.date===activeDay).map(taskMarkup).join('')||'<div class="empty">No tasks scheduled on this day.</div>'}</div>`}
 <div class="panel"><div class="panel-head"><div><h2>Add calendar event</h2><p>Events also appear in the weekly time grid</p></div></div><form id="event-form-bottom" class="event-form"><input name="title" placeholder="Event title…" required><input name="time" type="time" aria-label="Start time"><select name="duration"><option value="30">30 min</option><option value="60" selected>1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select><button class="primary-btn">Add to ${activeDay}</button></form></div>`;
 $('#week-mode').onclick=()=>{calendarMode='week';render('calendar');};$('#month-mode').onclick=()=>{calendarMode='month';render('calendar');};
 $('#prev-period').onclick=()=>{const d=new Date(activeDay+'T12:00:00');d.setDate(d.getDate()+(calendarMode==='week'?-7:-30));activeDay=localDate(d);render('calendar');};
 $('#next-period').onclick=()=>{const d=new Date(activeDay+'T12:00:00');d.setDate(d.getDate()+(calendarMode==='week'?7:30));activeDay=localDate(d);render('calendar');};
 $('#calendar-today').onclick=()=>{activeDay=localDate();render('calendar');};
 $('.calendar-grid')?.addEventListener('click',e=>{const b=e.target.closest('[data-day]');if(b){activeDay=b.dataset.day;render('calendar');}});
 $('#event-form-bottom').addEventListener('submit',e=>{e.preventDefault();addEventFromForm(e.target);});
 $('#event-form')?.addEventListener('submit',e=>{e.preventDefault();addEventFromForm(e.target);});
 } else if(page==='smart-plan'){
 const candidates=tasks.filter(t=>!t.done&&!t.cancelled&&(!t.date||t.date<=planDay));
 const planned=candidates.filter(t=>t.date===planDay&&t.time).sort((a,b)=>a.time.localeCompare(b.time));
 const unscheduled=candidates.filter(t=>!t.time||t.date!==planDay);
 $('#page').innerHTML=`<div class="page-heading"><div><div class="eyebrow">AUTOMATIC TIME BLOCKING</div><h1>Smart daily plan</h1><p>Choose your available hours and let CripPlanner fit your tasks around existing events.</p></div><div class="count-chip">${planned.length} BLOCKED</div></div>
 <div class="panel planner-settings"><div class="panel-head"><div><h2>Your availability</h2><p>Set the hours you can work on this day</p></div></div><div class="planner-controls"><label>Plan date<input id="plan-day" type="date" value="${planDay}"></label><label>Available from<input id="available-start" type="time" value="${plannerPrefs.start}"></label><label>Available until<input id="available-end" type="time" value="${plannerPrefs.end}"></label><button class="primary-btn" id="generate-plan">Build my day ✦</button></div><p class="helper-copy">The planner respects existing calendar events and tasks with a chosen start time. It schedules higher-priority and nearer-deadline tasks first.</p></div>
 <div class="planner-columns"><div class="panel"><div class="panel-head"><div><h2>Your suggested day</h2><p>${planned.length} task blocks on ${new Date(planDay+'T12:00:00').toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'})}</p></div></div>${planned.length?planned.map(t=>`<div class="plan-row"><span class="plan-time">${esc(t.time)}</span><div><strong>${esc(t.title)}</strong><small>${Number(t.duration)||30} min · ${esc(t.priority||'normal')} priority</small></div><button class="icon-btn" data-clear-time="${t.id}" title="Remove from schedule">↶</button></div>`).join(''):'<div class="empty">No time blocks yet. Build your day to schedule eligible tasks.</div>'}</div>
 <div class="panel"><div class="panel-head"><div><h2>Needs scheduling</h2><p>${unscheduled.length} tasks without a block for this date</p></div></div>${unscheduled.map(taskMarkup).join('')||'<div class="empty">Everything eligible is scheduled.</div>'}</div></div>`;
 $('#plan-day').onchange=e=>{planDay=e.target.value||localDate();render('smart-plan');};
 $('#available-start').onchange=e=>{plannerPrefs.start=e.target.value;store.set('plannerPrefs',plannerPrefs);};
 $('#available-end').onchange=e=>{plannerPrefs.end=e.target.value;store.set('plannerPrefs',plannerPrefs);};
 $('#generate-plan').onclick=()=>{plannerPrefs.start=$('#available-start').value;plannerPrefs.end=$('#available-end').value;store.set('plannerPrefs',plannerPrefs);const result=buildSmartPlan(planDay);saveAll();render('smart-plan');toast(result.placed+' tasks scheduled · '+result.left+' still need time');};
 } else if(page==='integrations'){
 $('#page').innerHTML=`<div class="page-heading"><div><div class="eyebrow">SCHOOL + CALENDAR CONNECTIONS</div><h1>Integrations</h1><p>Bring your school deadlines and calendar events into one workspace.</p></div></div>
 <div class="integration-grid"><section class="panel integration-card"><div class="integration-icon">✉</div><div class="eyebrow">EMAIL TO TASK</div><h2>Capture homework from email</h2><p>Paste an assignment email and turn it into a task. Add the deadline and estimated work time before saving.</p><form id="email-task-form" class="integration-form"><input name="subject" placeholder="Email subject / assignment title" required maxlength="120"><textarea name="body" placeholder="Paste the email details here…" rows="5"></textarea><div class="form-pair"><label>Due date<input name="date" type="date"></label><label>Preferred time<input name="time" type="time"></label></div><div class="form-pair"><label>Estimated time<select name="duration"><option value="15">15 min</option><option value="30" selected>30 min</option><option value="45">45 min</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option><option value="180">3 hours</option></select></label><label>Priority<select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label></div><button class="primary-btn">Create task from email</button></form></section>
 <section class="panel integration-card"><div class="integration-icon">▦</div><div class="eyebrow">GOOGLE + OUTLOOK CALENDAR</div><h2>Import or export your calendar</h2><p>Use standard .ics calendar files to move events between CripPlanner, Google Calendar and Outlook.</p><label class="file-drop"> <input id="ics-import" type="file" accept=".ics,text/calendar"> <strong>Choose an .ics calendar file</strong><small>Import events into CripPlanner · existing events are kept</small></label><button class="primary-btn" id="ics-export">Export CripPlanner calendar (.ics)</button><div class="provider-links"><a href="https://calendar.google.com/" target="_blank" rel="noreferrer">Open Google Calendar ↗</a><a href="https://outlook.live.com/calendar/" target="_blank" rel="noreferrer">Open Outlook Calendar ↗</a></div><div class="integration-note"><strong>About automatic sync</strong><p>Two-way live sync and automatic inbox reading need secure Google/Microsoft sign-in and an app connection. This version supports calendar-file import/export and email-to-task capture without asking for your account password.</p></div></section></div>`;
 $('#email-task-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);tasks.unshift({id:crypto.randomUUID(),title:f.get('subject'),details:f.get('body'),date:f.get('date'),time:f.get('time'),duration:Number(f.get('duration'))||30,priority:f.get('priority'),source:'email',done:false});saveAll();e.target.reset();toast('Email converted into a task');go('tasks');});
 $('#ics-import').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{const count=importICS(await file.text());store.set('events',events);toast(count+' calendar events imported');render('integrations');}catch(err){toast('Could not read this .ics file');}});
 $('#ics-export').onclick=exportICS;
 } else if(page==='projects'){
 $('#page').innerHTML=`<div class="page-heading"><div><div class="eyebrow">BIG PICTURE</div><h1>Projects</h1><p>Group your work into meaningful goals.</p></div></div><div class="panel"><div class="panel-head"><div><h2>New project</h2><p>Give your next idea a home</p></div></div><form id="project-form" class="add-form"><input name="title" placeholder="Project name…" required maxlength="80"><input name="description" placeholder="Short description (optional)" maxlength="120"><button class="primary-btn">Create project +</button></form></div><div class="project-grid">${projects.map(p=>`<article class="project-card"><div class="project-icon">◇</div><button class="icon-btn project-delete" data-project-delete="${p.id}">×</button><h3>${esc(p.title)}</h3><p>${esc(p.description||'No description yet')}</p><small>CREATED ${new Date(p.created).toLocaleDateString()}</small></article>`).join('')||'<div class="empty">Your projects will show up here.</div>'}</div>`;
 $('#project-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);projects.unshift({id:crypto.randomUUID(),title:f.get('title'),description:f.get('description'),created:Date.now()});saveAll();render('projects');});
 }
}
document.addEventListener('click',e=>{const del=e.target.closest('[data-event-delete]');if(del){events=events.filter(x=>x.id!==del.dataset.eventDelete);store.set('events',events);render('calendar');}});

function checkTaskNotifications(){
 if(!('Notification' in window)||Notification.permission!=='granted')return;
 const now=new Date();if(now.getHours()<8)return;const today=localDate();
 tasks.filter(t=>!t.done&&!t.cancelled&&t.date===today).forEach(t=>{
  const key=t.id+'@'+today;if(notifiedTasks.includes(key))return;
  new Notification('CripPlanner · Task due today',{body:t.title+' · '+(t.time||'Time not set')+' · '+(Number(t.duration)||30)+' min'});
  notifiedTasks.push(key);
 });store.set('notifiedTasks',notifiedTasks);
}
syncWeeklyTasks();saveAll();go('dashboard');
setInterval(checkTaskNotifications,60000);
checkTaskNotifications();
document.addEventListener('click',e=>{if(e.target.closest('#enable-notifications')){if(!('Notification' in window)){toast('This browser does not support notifications');return;}Notification.requestPermission().then(p=>{toast(p==='granted'?'Task reminders enabled':'Notification permission was not granted');if(currentPage==='dashboard')render('dashboard');});}});

// Interactive command center: focus timer, command palette and visual mode.
const extras = document.createElement('div');
extras.innerHTML = `
  <div class="quick-dock">
    <button class="dock-btn" id="focus-open" title="Start a focus session (F)">◷ <span>Focus</span></button>
    <button class="dock-btn" id="command-open" title="Open command palette (Ctrl/⌘ K)">⌘ <span>Quick actions</span></button>
    <button class="dock-btn dock-theme" id="theme-toggle" title="Toggle glow mode">✧</button>
  </div>
  <div class="modal-backdrop" id="focus-modal" hidden>
    <section class="utility-modal focus-modal">
      <button class="modal-close" data-close="focus-modal" aria-label="Close">×</button>
      <div class="eyebrow">DEEP WORK SESSION</div><h2>Focus mode</h2>
      <p class="modal-sub">One thing at a time. Make it count.</p>
      <div class="timer-ring"><div><strong id="focus-clock">25:00</strong><small id="focus-state">READY WHEN YOU ARE</small></div></div>
      <div class="timer-presets">
        <button data-minutes="15">15 min</button><button class="selected" data-minutes="25">25 min</button><button data-minutes="50">50 min</button>
      </div>
      <div class="timer-actions"><button class="primary-btn" id="focus-start">Start focus</button><button class="secondary-btn" id="focus-reset">Reset</button></div>
      <p class="focus-tip">Tip: silence notifications and choose one small goal.</p>
    </section>
  </div>
  <div class="modal-backdrop" id="command-modal" hidden>
    <section class="utility-modal command-modal">
      <button class="modal-close" data-close="command-modal" aria-label="Close">×</button>
      <div class="eyebrow">COMMAND PALETTE · CTRL K</div><h2>What do you want to do?</h2>
      <input id="command-search" class="command-search" placeholder="Search pages and actions…" autocomplete="off">
      <div class="command-list" id="command-list">
        <button data-go="dashboard"><span>⌂</span> Open overview <kbd>G</kbd></button>
        <button data-go="tasks"><span>✓</span> Open tasks <kbd>T</kbd></button>
        <button data-go="calendar"><span>▦</span> Open calendar <kbd>C</kbd></button>
        <button data-go="notes"><span>▤</span> Open notes <kbd>N</kbd></button>
        <button data-go="projects"><span>◇</span> Open projects <kbd>P</kbd></button>
        <button data-action="focus"><span>◷</span> Start a focus session <kbd>F</kbd></button>
      </div>
      <small class="command-hint">↑ ↓ to browse · Enter to select · Esc to close</small>
    </section>
  </div>
  <div class="modal-backdrop task-detail-backdrop" id="task-detail-modal" hidden><section class="utility-modal task-detail-modal"><button class="modal-close" data-close-task aria-label="Close">×</button><div class="eyebrow">TASK DETAILS</div><h2 id="task-detail-title"></h2><p id="task-detail-meta" class="muted"></p><span class="task-detail-priority" id="task-detail-priority"></span><p id="task-detail-description" class="task-detail-description"></p><div class="task-reward">✦ <span id="task-detail-reward"></span></div><button class="primary-btn" id="task-detail-complete" data-complete-task>Complete task</button><button class="secondary-btn cancel-task-btn" id="task-detail-cancel" data-cancel-task>Cancel task</button><button class="secondary-btn stop-repeat-btn" id="task-detail-stop-repeat" data-stop-repeat hidden>Stop repeating &amp; remove all</button></section></div><div class="toast" id="app-toast" role="status"></div>`;
document.body.append(extras);
document.body.insertAdjacentHTML('afterbegin', '<div class="ambient-fx" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>');

let focusMinutes = 25, focusRemaining = 1500, focusInterval = null, focusRunning = false;
const focusModal = $('#focus-modal'), commandModal = $('#command-modal');
const toast = (message) => { const el=$('#app-toast'); el.textContent=message; el.classList.add('show'); clearTimeout(el._hide); el._hide=setTimeout(()=>el.classList.remove('show'),2200); };
const showModal = (el) => { el.hidden=false; document.body.classList.add('modal-open'); };
const hideModal = (el) => { el.hidden=true; if(focusModal.hidden && commandModal.hidden) document.body.classList.remove('modal-open'); };
function paintTimer(){ $('#focus-clock').textContent=String(Math.floor(focusRemaining/60)).padStart(2,'0')+':'+String(focusRemaining%60).padStart(2,'0'); $('#focus-state').textContent=focusRunning?'SESSION IN PROGRESS':'READY WHEN YOU ARE'; }
function resetTimer(){clearInterval(focusInterval);focusInterval=null;focusRunning=false;focusRemaining=focusMinutes*60;$('#focus-start').textContent='Start focus';paintTimer();}
function startFocus(){if(focusRunning){clearInterval(focusInterval);focusRunning=false;$('#focus-start').textContent='Resume focus';paintTimer();return;}focusRunning=true;$('#focus-start').textContent='Pause';paintTimer();focusInterval=setInterval(()=>{focusRemaining--;paintTimer();if(focusRemaining<=0){clearInterval(focusInterval);focusRunning=false;$('#focus-start').textContent='Start again';$('#focus-state').textContent='SESSION COMPLETE · NICE WORK';toast('Focus session complete. Great work!');}},1000);}
$('#focus-open').addEventListener('click',()=>showModal(focusModal));
$('#focus-start').addEventListener('click',startFocus);
$('#focus-reset').addEventListener('click',resetTimer);
document.querySelectorAll('[data-minutes]').forEach(b=>b.addEventListener('click',()=>{focusMinutes=Number(b.dataset.minutes);document.querySelectorAll('[data-minutes]').forEach(x=>x.classList.toggle('selected',x===b));resetTimer();}));
$('#command-open').addEventListener('click',()=>{showModal(commandModal);$('#command-search').value='';filterCommands('');$('#command-search').focus();});
$('#theme-toggle').addEventListener('click',()=>{document.body.classList.toggle('aurora-mode');toast(document.body.classList.contains('aurora-mode')?'Aurora glow enabled':'Classic mode enabled');});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>hideModal($('#'+b.dataset.close))));
[focusModal,commandModal].forEach(m=>m.addEventListener('click',e=>{if(e.target===m)hideModal(m);}));$('#task-detail-modal').addEventListener('click',e=>{if(e.target.id==='task-detail-modal')hideTaskDetails();});
function filterCommands(q){const term=q.toLowerCase();document.querySelectorAll('#command-list button').forEach(b=>b.hidden=!b.textContent.toLowerCase().includes(term));}
$('#command-search').addEventListener('input',e=>filterCommands(e.target.value));
$('#command-list').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;hideModal(commandModal);if(b.dataset.go)go(b.dataset.go);if(b.dataset.action==='focus')showModal(focusModal);});
document.addEventListener('keydown',e=>{
 const tag=document.activeElement?.tagName;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();showModal(commandModal);$('#command-search').value='';filterCommands('');$('#command-search').focus();return;}
 if(e.key==='Escape'){hideModal(focusModal);hideModal(commandModal);hideTaskDetails();return;}
 if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||e.ctrlKey||e.metaKey||e.altKey)return;
 const key=e.key.toLowerCase();
 if(key==='f'){showModal(focusModal);}
 if(key==='g')go('dashboard'); if(key==='t')go('tasks'); if(key==='c')go('calendar'); if(key==='n')go('notes'); if(key==='p')go('projects');
});
