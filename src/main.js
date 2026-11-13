import './style.css';

const $ = (s, root=document) => root.querySelector(s);
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem('nhk-'+key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { localStorage.setItem('nhk-'+key, JSON.stringify(value)); }
};
let tasks = store.get('tasks', []);
let notes = store.get('notes', '');
let events = store.get('events', []);
let projects = store.get('projects', []);
let activeDay = new Date().toISOString().slice(0,10);
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
      <button class="nav-item" data-page="notes"><span>▤</span> Quick notes</button>
      <button class="nav-item" data-page="projects"><span>◇</span> Projects</button>
    </nav>
    <div class="sidebar-bottom"><div class="profile-dot">N</div><div><strong>Personal space</strong><small>All systems ready</small></div><span class="online-dot"></span></div>
  </aside>
  <main class="main">
    <header class="topbar"><div class="breadcrumb">WORKSPACE <span>/</span> <b id="crumb">OVERVIEW</b></div><div class="top-actions"><span class="today-label" id="today-label"></span><span class="avatar">N</span></div></header>
    <section class="page" id="page"></section>
    <footer>NHK COMMAND CENTER <span>YOUR SPACE. YOUR FLOW.</span></footer>
  </main>
</div>`;

function dateLong(d=new Date()) { return d.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}); }
function timeNow() { const d=new Date(); $('#clock').textContent=d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}); $('#clock-date').textContent=dateLong(d); }
setInterval(timeNow,1000);
$('#today-label').textContent = new Date().toLocaleDateString([], {month:'short',day:'numeric',year:'numeric'});

function weather() {
  if (!navigator.geolocation) return $('#weather').innerHTML='<span class="weather-icon">☁</span><div><strong>Weather unavailable</strong><small>Location access is disabled</small></div>';
  navigator.geolocation.getCurrentPosition(async p => {
    try {
      const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.coords.latitude}&longitude=${p.coords.longitude}&current=temperature_2m,weather_code&timezone=auto`);
      const j=await r.json(); const t=Math.round(j.current.temperature_2m);
      const labels={0:'Clear sky',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',45:'Foggy',48:'Foggy',51:'Light drizzle',61:'Rain',71:'Snow',80:'Rain showers',95:'Thunderstorm'};
      $('#weather').innerHTML=`<span class="weather-icon">${j.current.weather_code===0?'☀':'☁'}</span><div><strong>${t}°C · ${labels[j.current.weather_code]||'Current conditions'}</strong><small>Local weather · Live</small></div>`;
    } catch { $('#weather').innerHTML='<span class="weather-icon">☁</span><div><strong>Weather unavailable</strong><small>Could not load forecast</small></div>'; }
  }, () => $('#weather').innerHTML='<span class="weather-icon">☀</span><div><strong>Location not shared</strong><small>Allow location for local weather</small></div>', {timeout:8000});
}
function saveAll(){store.set('tasks',tasks);store.set('events',events);store.set('projects',projects);$('#task-count').textContent=tasks.filter(t=>!t.done).length;}
function go(page){$('.nav-item.active')?.classList.remove('active');$(`[data-page="${page}"]`)?.classList.add('active');$('#crumb').textContent=page.toUpperCase();render(page);}
document.addEventListener('click',e=>{
 const nav=e.target.closest('[data-page]'); if(nav) go(nav.dataset.page);
 const done=e.target.closest('[data-done]'); if(done){const t=tasks.find(x=>x.id===done.dataset.done);if(t)t.done=!t.done;saveAll();render('tasks');}
 const del=e.target.closest('[data-delete]');if(del){tasks=tasks.filter(x=>x.id!==del.dataset.delete);saveAll();render('tasks');}
 const pdel=e.target.closest('[data-project-delete]');if(pdel){projects=projects.filter(x=>x.id!==pdel.dataset.projectDelete);saveAll();render('projects');}
});
function taskMarkup(t){return `<div class="task-row ${t.done?'is-done':''}"><button class="check ${t.done?'checked':''}" data-done="${t.id}">${t.done?'✓':''}</button><div class="task-info"><strong>${esc(t.title)}</strong><small>${t.date?new Date(t.date+'T12:00:00').toLocaleDateString([], {month:'short',day:'numeric'}):'No due date'} · ${esc(t.time||'Any time')}</small></div><span class="priority ${t.priority}">${t.priority}</span><button class="icon-btn" data-delete="${t.id}" title="Delete task">×</button></div>`;}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function taskForm(){return `<form id="task-form" class="add-form"><input name="title" placeholder="What needs to get done?" required maxlength="100"><input name="date" type="date" aria-label="Due date"><input name="time" type="time" aria-label="Time"><select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select><button class="primary-btn">Add task +</button></form>`;}
function render(page='dashboard'){
 const open=tasks.filter(t=>!t.done), done=tasks.filter(t=>t.done);
 if(page==='dashboard'){
 $('#page').innerHTML=`
 <div class="welcome"><div><div class="eyebrow">YOUR PERSONAL CONTROL PANEL</div><h1>Good ${new Date().getHours()<12?'morning':new Date().getHours()<18?'afternoon':'evening'}.</h1><p>Everything you need, in one place.</p></div><div class="date-chip">✦ &nbsp;${dateLong()}</div></div>
 <div class="hero-grid"><div class="clock-card"><div class="card-kicker">LOCAL TIME <span class="live-pill">● LIVE</span></div><div class="clock" id="clock">--:--:--</div><div id="clock-date" class="muted"></div></div><div class="weather-card"><div class="card-kicker">WEATHER</div><div id="weather" class="weather-content"><span class="weather-icon">◌</span><div><strong>Checking weather…</strong><small>Using your device location</small></div></div><small class="muted">Powered by Open-Meteo</small></div></div>
 <div class="stats-grid"><div class="stat-card"><span>OPEN TASKS</span><strong>${open.length}</strong><small>Ready when you are</small></div><div class="stat-card"><span>COMPLETED</span><strong>${done.length}</strong><small>Nice progress</small></div><div class="stat-card"><span>PROJECTS</span><strong>${projects.length}</strong><small>Things in motion</small></div></div>
 <div class="content-grid"><div class="panel"><div class="panel-head"><div><h2>Today's focus</h2><p>Your next things to do</p></div><button class="text-btn" data-page="tasks">All tasks ↗</button></div>${open.slice(0,4).map(taskMarkup).join('')||'<div class="empty">You are all caught up. Add a task when you need one.</div>'}</div><div class="panel"><div class="panel-head"><div><h2>Quick note</h2><p>Ideas worth keeping</p></div><button class="text-btn" data-page="notes">Open notes ↗</button></div><textarea id="dash-note" class="note-area" placeholder="Write something down…">${esc(notes)}</textarea><div class="save-hint" id="note-status">Saved on this device</div></div></div>`;
 timeNow();weather();$('#dash-note').addEventListener('input',e=>{notes=e.target.value;store.set('notes',notes);$('#note-status').textContent='Saved';});
 } else if(page==='tasks'){
 $('#page').innerHTML=`<div class="page-heading"><div><div class="eyebrow">STAY ON TRACK</div><h1>Tasks</h1><p>Plan it, do it, tick it off.</p></div><div class="count-chip">${open.length} OPEN</div></div><div class="panel"><div class="panel-head"><div><h2>Add a task</h2><p>Set a due date, time and priority</p></div></div>${taskForm()}</div><div class="panel task-panel"><div class="panel-head"><div><h2>To do</h2><p>${open.length} tasks remaining</p></div></div>${open.map(taskMarkup).join('')||'<div class="empty">No open tasks. Enjoy the breathing room.</div>'}</div><div class="panel task-panel"><div class="panel-head"><div><h2>Completed</h2><p>${done.length} finished</p></div></div>${done.map(taskMarkup).join('')||'<div class="empty">Completed tasks will appear here.</div>'}</div>`;
 $('#task-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);tasks.unshift({id:crypto.randomUUID(),title:f.get('title'),date:f.get('date'),time:f.get('time'),priority:f.get('priority'),done:false});saveAll();render('tasks');});
 } else if(page==='notes'){
 $('#page').innerHTML=`<div class="page-heading"><div><div class="eyebrow">THINK OUT LOUD</div><h1>Quick notes</h1><p>A quiet place for ideas, reminders and drafts.</p></div></div><div class="panel notes-panel"><div class="panel-head"><div><h2>Your notes</h2><p>Automatically saved in this browser</p></div><span class="saved-tag">● AUTO-SAVE</span></div><textarea id="notes-editor" class="big-notes" placeholder="Start writing…">${esc(notes)}</textarea><div class="save-hint" id="note-status">Saved on this device</div></div>`;
 $('#notes-editor').addEventListener('input',e=>{notes=e.target.value;store.set('notes',notes);$('#note-status').textContent='Saved just now';});
 } else if(page==='calendar'){
 const first=new Date(activeDay+'T12:00:00');const monthStart=new Date(first.getFullYear(),first.getMonth(),1);const start=new Date(monthStart);start.setDate(1-monthStart.getDay());const days=Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d;});
 $('#page').innerHTML=`<div class="page-heading"><div><div class="eyebrow">YOUR SCHEDULE</div><h1>Calendar</h1><p>Keep important dates in view.</p></div></div><div class="calendar-layout"><div class="panel"><div class="calendar-head"><button class="icon-btn" id="prev-month">‹</button><h2>${first.toLocaleDateString([], {month:'long',year:'numeric'})}</h2><button class="icon-btn" id="next-month">›</button></div><div class="calendar-grid">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>'<div class="weekday">'+x+'</div>').join('')}${days.map(d=>`<button class="day ${d.getMonth()!==first.getMonth()?'outside':''} ${d.toISOString().slice(0,10)===activeDay?'selected':''}" data-day="${d.toISOString().slice(0,10)}">${d.getDate()}${events.some(x=>x.date===d.toISOString().slice(0,10))?'<i></i>':''}</button>`).join('')}</div></div><div class="panel"><div class="panel-head"><div><h2>${new Date(activeDay+'T12:00:00').toLocaleDateString([], {month:'short',day:'numeric'})}</h2><p>Schedule for selected day</p></div></div><form id="event-form" class="event-form"><input name="title" placeholder="Add an event…" required><input name="time" type="time" aria-label="Event time"><button class="primary-btn">Add</button></form><div class="event-list">${events.filter(x=>x.date===activeDay).map(x=>`<div class="event-row"><span class="event-dot"></span><div><strong>${esc(x.title)}</strong><small>${esc(x.time||'All day')}</small></div><button class="icon-btn" data-event-delete="${x.id}">×</button></div>`).join('')||'<div class="empty">Nothing planned for this day.</div>'}</div></div></div>`;
 $('#prev-month').onclick=()=>{first.setMonth(first.getMonth()-1);activeDay=first.toISOString().slice(0,10);render('calendar');};
 $('#next-month').onclick=()=>{first.setMonth(first.getMonth()+1);activeDay=first.toISOString().slice(0,10);render('calendar');};
 $('.calendar-grid').addEventListener('click',e=>{const b=e.target.closest('[data-day]');if(b){activeDay=b.dataset.day;render('calendar');}});
 $('#event-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);events.push({id:crypto.randomUUID(),title:f.get('title'),time:f.get('time'),date:activeDay});store.set('events',events);render('calendar');});
 } else if(page==='projects'){
 $('#page').innerHTML=`<div class="page-heading"><div><div class="eyebrow">BIG PICTURE</div><h1>Projects</h1><p>Group your work into meaningful goals.</p></div></div><div class="panel"><div class="panel-head"><div><h2>New project</h2><p>Give your next idea a home</p></div></div><form id="project-form" class="add-form"><input name="title" placeholder="Project name…" required maxlength="80"><input name="description" placeholder="Short description (optional)" maxlength="120"><button class="primary-btn">Create project +</button></form></div><div class="project-grid">${projects.map(p=>`<article class="project-card"><div class="project-icon">◇</div><button class="icon-btn project-delete" data-project-delete="${p.id}">×</button><h3>${esc(p.title)}</h3><p>${esc(p.description||'No description yet')}</p><small>CREATED ${new Date(p.created).toLocaleDateString()}</small></article>`).join('')||'<div class="empty">Your projects will show up here.</div>'}</div>`;
 $('#project-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);projects.unshift({id:crypto.randomUUID(),title:f.get('title'),description:f.get('description'),created:Date.now()});saveAll();render('projects');});
 }
}
document.addEventListener('click',e=>{const del=e.target.closest('[data-event-delete]');if(del){events=events.filter(x=>x.id!==del.dataset.eventDelete);store.set('events',events);render('calendar');}});
saveAll();go('dashboard');