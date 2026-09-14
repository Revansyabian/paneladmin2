const API_URL = '/api/revanstore';
const API_SECRET = '1417-1426-1527-1517';

let currentSession = sessionStorage.getItem('admin_session') || '';
let currentAdmin = JSON.parse(sessionStorage.getItem('admin_admin') || 'null');
let allUsers = {};
let selectedBanUser = null;
let selectedActionUser = null;
let settingsActionVerified = false;

function enc(data) {
    return CryptoJS.AES.encrypt(JSON.stringify(data), API_SECRET).toString();
}
function dec(data) {
    try {
        const text = CryptoJS.AES.decrypt(data, API_SECRET).toString(CryptoJS.enc.Utf8);
        return text ? JSON.parse(text) : null;
    } catch { return null; }
}
async function apiCall(path, method='GET', data=null, session=currentSession) {
    const payload = {path, method, data, timestamp:Date.now()};
    const headers = {'Content-Type':'application/json'};
    if (session) headers['X-Session'] = session;
    const fp = localStorage.getItem('admin_fingerprint') || getFingerprint();
    localStorage.setItem('admin_fingerprint', fp);
    headers['X-Fingerprint'] = fp;
    const res = await fetch(API_URL, {method:'POST',headers,body:JSON.stringify({data:enc(payload)})});
    const text = await res.text();
    if (!text) return null;
    let result;
    try { result = JSON.parse(text); } catch { throw new Error('Respons server tidak valid'); }
    if (result?.data) {
        const decrypted = dec(result.data);
        if (decrypted) return decrypted;
    }
    return result;
}
function getFingerprint() {
    let s = navigator.userAgent+'|'+screen.width+'x'+screen.height+'|'+screen.colorDepth+'|'+navigator.platform+'|'+navigator.hardwareConcurrency;
    return CryptoJS.SHA256(s).toString();
}
function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function rupiah(v) { return 'Rp ' + Number(v||0).toLocaleString('id-ID'); }
function dateText(v) { return v ? new Date(v).toLocaleString('id-ID') : '-'; }
function toast(title,text,icon='success') {
    if (window.Swal) return Swal.fire({icon,title,text,confirmButtonColor:'#00BFFF'});
    alert(title+(text?'\n'+text:''));
}
function confirmBox(text) {
    return Swal.fire({icon:'warning',title:'Konfirmasi',text,showCancelButton:true,confirmButtonText:'Ya',cancelButtonText:'Batal',confirmButtonColor:'#00BFFF'}).then(r=>r.isConfirmed);
}
function showLogin(show=true) {
    document.getElementById('loginWrapper').style.display = show ? 'flex' : 'none';
    document.getElementById('appContainer').style.display = show ? 'none' : 'block';
}
async function checkBlockedOnLoad() {
    try {
        const r = await apiCall('check_blocked','GET',null,'');
        if (r?.blocked) {
            document.getElementById('blockedScreen').classList.add('show');
            document.getElementById('blockedIPDisplay').textContent = r.ip || '-';
            document.getElementById('blockedFPDisplay').textContent = r.fingerprint || '-';
            return true;
        }
    } catch {}
    return false;
}
async function verifyKey() {
    if (await checkBlockedOnLoad()) return;
    const key = document.getElementById('accessKey').value.trim();
    if (!key) return toast('Key kosong','Masukkan access key.','warning');
    const r = await apiCall('access_key','GET');
    if (r?.key && key === r.key) {
        document.getElementById('keyScreen').style.display='none';
        document.getElementById('loginScreen').style.display='block';
    } else {
        await apiCall('login_failed','POST',{reason:'invalid_access_key'},'');
        toast('Akses ditolak','Access key salah.','error');
    }
}
async function login() {
    if (await checkBlockedOnLoad()) return;
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) return toast('Data belum lengkap','Email dan password wajib diisi.','warning');
    const auth = await apiCall('admin/auth','GET');
    let valid = false;
    if (auth) {
        const storedEmail = auth.email || auth.username || '';
        if (auth.password_hash) valid = storedEmail === email && await verifyBcryptClient(password, auth.password_hash);
        else if (auth.password) valid = storedEmail === email && password === auth.password;
        else valid = storedEmail === email;
    }
    if (!valid) {
        const fail = await apiCall('login_failed','POST',{email},'');
        if (fail?.blocked) {
            document.getElementById('blockedScreen').classList.add('show');
            return;
        }
        return toast('Login gagal','Email atau password salah.','error');
    }
    const r = await apiCall('admin/login_success','POST',{email},'');
    if (!r?.success || !r.sessionId) return toast('Gagal','Session admin tidak berhasil dibuat.','error');
    currentSession = r.sessionId;
    currentAdmin = {email};
    sessionStorage.setItem('admin_session',currentSession);
    sessionStorage.setItem('admin_admin',JSON.stringify(currentAdmin));
    showLogin(false);
    document.getElementById('loggedUser').textContent=email;
    document.getElementById('navbarUserName').textContent=email;
    await loadDashboard();
}
async function verifyBcryptClient(password, hash) {
    /* bcrypt hash verification remains server-side for user passwords.
       Admin auth is accepted from the existing admin/auth record only. */
    return false;
}
async function logout() {
    try { await apiCall('logout','POST',null,currentSession); } catch {}
    currentSession=''; currentAdmin=null;
    sessionStorage.removeItem('admin_session');
    sessionStorage.removeItem('admin_admin');
    location.reload();
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }
function switchPage(page) {
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav a').forEach(a=>a.classList.remove('active'));
    document.getElementById('page-'+page)?.classList.add('active');
    document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
    document.getElementById('sidebar').classList.remove('open');
    const loaders = {
        dashboard:loadDashboard, 'all-users':loadUsers, 'aktivasi-user':loadActivations,
        'ban-user':()=>{}, 'unbanned-users':loadBannedUsers, 'banakses-users':loadBanAksesUsers,
        'unbanakses-users':loadUnbanAksesUsers, 'force-users':loadForceUsers, 'unforce-users':loadUnforceUsers,
        'problem-users':loadProblemUsers, 'activity-log':loadLogs, 'suspicious-log':loadSuspicious,
        'web-stats':loadStats, maintenance:loadMaintenance, 'path-manager':loadPaths,
        'migrate-password':()=>{}, settings:loadSettings
    };
    loaders[page]?.();
}
async function loadUsers() {
    const r = await apiCall('users','GET');
    allUsers = r || {};
    const arr = Object.values(allUsers);
    document.getElementById('allUsersCount').textContent=arr.length;
    document.getElementById('allUsersList').innerHTML=arr.length ? arr.map(u=>userCard(u)).join('') : '<div class="empty-state">Tidak ada user.</div>';
    updateStats(arr);
}
function userCard(u) {
    const status = u.banned ? '<span class="status-badge banned">BANNED</span>' : u.banAkses ? '<span class="status-badge banakses">BAN AKSES</span>' : u.forceLogout ? '<span class="status-badge force">TANGGUH</span>' : '';
    return `<div class="user-info-card"><div class="user-info-avatar">${esc((u.username||'?')[0].toUpperCase())}</div><div class="user-info-details"><div class="user-info-name">${esc(u.username)} ${status}</div><div class="user-info-meta"><span><i class="fas fa-user"></i>${esc(u.role||'User')}</span><span><i class="fas fa-envelope"></i>${esc(u.email||'-')}</span><span><i class="fas fa-clock"></i>${esc(u.expiry_date||'-')}</span></div></div><div class="user-info-actions"><button class="btn btn-outline btn-sm" onclick="openEditUserModal('${esc(u.id)}')"><i class="fas fa-edit"></i></button><button class="btn btn-danger btn-sm" onclick="deleteUser('${esc(u.id)}')"><i class="fas fa-trash"></i></button></div></div>`;
}
function updateStats(arr) {
    const total=arr.length, active=arr.filter(u=>u.isActive===true || u.status==='active').length, banned=arr.filter(u=>u.banned===true).length, pending=arr.filter(u=>u.needsActivation===true || u.status==='pending').length, banAkses=arr.filter(u=>u.banAkses===true).length;
    ['statTotal','webStatTotalUsers'].forEach(id=>document.getElementById(id)&&(document.getElementById(id).textContent=total));
    ['statActive','webStatActiveUsers','ringkasanAktif','distAktif'].forEach(id=>document.getElementById(id)&&(document.getElementById(id).textContent=active));
    ['statBanned','webStatBannedUsers','ringkasanBanned','distBanned'].forEach(id=>document.getElementById(id)&&(document.getElementById(id).textContent=banned));
    ['statPending','webStatPending','ringkasanPending','distPending'].forEach(id=>document.getElementById(id)&&(document.getElementById(id).textContent=pending));
    ['ringkasanBanAkses','webStatBanAkses','distBanAkses'].forEach(id=>document.getElementById(id)&&(document.getElementById(id).textContent=banAkses));
}
async function addUserNow() {
    const data={username:document.getElementById('newUsername').value.trim(),password:document.getElementById('newPassword').value,email:document.getElementById('newEmail').value.trim(),phone:document.getElementById('newPhone').value.trim(),role:document.getElementById('newRole').value,expiry_date:document.getElementById('newExpiryDate').value,status:'active',isActive:true,banned:false,banAkses:false,forceLogout:false};
    if(data.username.length<3||data.password.length<6) return toast('Data tidak valid','Username minimal 3 dan password minimal 6.','warning');
    const r=await apiCall('users','POST',data); if(!r?.success) return toast('Gagal','User gagal dibuat.','error');
    closeModal('addUserModal'); toast('Berhasil','User dibuat.'); await loadUsers();
}
async function saveUserEdit() {
    const id=document.getElementById('editUserId').value;
    const data={username:document.getElementById('editUsername').value.trim(),email:document.getElementById('editEmail').value.trim(),phone:document.getElementById('editPhone').value.trim(),role:document.getElementById('editRole').value,expiry_date:document.getElementById('editExpiryDate').value};
    const p=document.getElementById('editPassword').value; if(p) data.password=p;
    const r=await apiCall('users/'+id,'PATCH',data); if(!r?.success) return toast('Gagal','Perubahan tidak tersimpan.','error');
    closeModal('editUserModal'); toast('Berhasil','User diperbarui.'); await loadUsers();
}
async function updateUserFormat() {
    const id=document.getElementById('editUserId').value;
    const u=allUsers[id]; if(!u) return;
    if(u.password_hash && !u.password) return toast('Sudah format baru','User sudah menggunakan password_hash.','info');
    toast('Info','Untuk migrasi massal gunakan menu Migrasi Password.','info');
}
async function deleteUser(id) {
    if(!await confirmBox('Hapus user ini?')) return;
    const r=await apiCall('users/'+id,'DELETE',null); if(r?.success){toast('Berhasil','User dihapus.');loadUsers();} else toast('Gagal','User gagal dihapus.','error');
}
function openAddUserModal(){document.getElementById('addUserModal').classList.add('show');}
function openEditUserModal(id){const u=allUsers[id];if(!u)return;document.getElementById('editUserId').value=id;document.getElementById('editUsername').value=u.username||'';document.getElementById('editPassword').value='';document.getElementById('editEmail').value=u.email||'';document.getElementById('editPhone').value=u.phone||'';document.getElementById('editRole').value=u.role||'Operator';document.getElementById('editExpiryDate').value=u.expiry_date||'';document.getElementById('editIP').value=u.ip||'';document.getElementById('editFP').value=u.fingerprint||'';document.getElementById('editUserModal').classList.add('show');}
function closeModal(id){document.getElementById(id)?.classList.remove('show');}
function searchBanUser(){const q=document.getElementById('banUserSearch').value.toLowerCase();document.getElementById('banUserList').innerHTML=Object.values(allUsers).filter(u=>(u.username||'').toLowerCase().includes(q)&&!u.banned).map(u=>`<div class="user-check" onclick="selectBanUser('${esc(u.id)}')">${esc(u.username)} — ${esc(u.role||'User')}</div>`).join('');}
function selectBanUser(id){selectedBanUser=allUsers[id];document.getElementById('banSelectedUser').textContent=selectedBanUser?'Terpilih: '+selectedBanUser.username:'';}
async function executeBanUser(){if(!selectedBanUser)return toast('Pilih user','Pilih user dulu.','warning');const d=Number(document.getElementById('banDuration').value), until=d?Date.now()+d:0;await apiCall('users/'+selectedBanUser.id,'PATCH',{banned:true,bannedUntil:until});toast('Berhasil','User dibanned.');selectedBanUser=null;loadUsers();}
async function actionUser(id,patch,msg){const r=await apiCall('users/'+id,'PATCH',patch);if(r?.success){toast('Berhasil',msg);await loadUsers();}else toast('Gagal','Aksi gagal.','error');}
async function loadBannedUsers(){await loadUsers();const arr=Object.values(allUsers).filter(u=>u.banned);document.getElementById('unbannedUsersTable').innerHTML=arr.map(u=>`<tr><td>${esc(u.username)}</td><td>${esc(u.role||'')}</td><td>${u.bannedUntil?dateText(u.bannedUntil):'Permanen'}</td><td><button class="btn btn-success btn-xs" onclick="actionUser('${esc(u.id)}',{banned:false,bannedUntil:0},'User di-unban.')">Unban</button></td></tr>`).join('');document.getElementById('unbannedUsersEmpty').style.display=arr.length?'none':'block';}
async function loadBanAksesUsers(){await loadUsers();const arr=Object.values(allUsers).filter(u=>!u.banAkses);document.getElementById('banaksesUsersTable').innerHTML=arr.map(u=>`<tr><td>${esc(u.username)}</td><td>${esc(u.role||'')}</td><td>${esc(u.ip||'-')}</td><td>${esc(u.fingerprint||'-')}</td><td>Aktif</td><td><button class="btn btn-warning btn-xs" onclick="actionUser('${esc(u.id)}',{banAkses:true,banAksesUntil:0},'Ban akses diterapkan.')">Ban</button></td></tr>`).join('');document.getElementById('banaksesUsersEmpty').style.display=arr.length?'none':'block';}
async function loadUnbanAksesUsers(){await loadUsers();const arr=Object.values(allUsers).filter(u=>u.banAkses);document.getElementById('unbanaksesUsersTable').innerHTML=arr.map(u=>`<tr><td>${esc(u.username)}</td><td>${esc(u.role||'')}</td><td>${esc(u.ip||'-')}</td><td>${esc(u.fingerprint||'-')}</td><td><button class="btn btn-success btn-xs" onclick="actionUser('${esc(u.id)}',{banAkses:false,banAksesUntil:0},'Ban akses dilepas.')">Unban</button></td></tr>`).join('');document.getElementById('unbanaksesUsersEmpty').style.display=arr.length?'none':'block';}
async function loadForceUsers(){await loadUsers();const arr=Object.values(allUsers).filter(u=>!u.forceLogout);document.getElementById('forceUsersTable').innerHTML=arr.map(u=>`<tr><td>${esc(u.username)}</td><td>${esc(u.role||'')}</td><td>Aktif</td><td><button class="btn btn-warning btn-xs" onclick="actionUser('${esc(u.id)}',{forceLogout:true},'User ditangguhkan.')">Tangguhkan</button></td></tr>`).join('');document.getElementById('forceUsersEmpty').style.display=arr.length?'none':'block';}
async function loadUnforceUsers(){await loadUsers();const arr=Object.values(allUsers).filter(u=>u.forceLogout);document.getElementById('unforceUsersTable').innerHTML=arr.map(u=>`<tr><td>${esc(u.username)}</td><td>${esc(u.role||'')}</td><td><button class="btn btn-success btn-xs" onclick="actionUser('${esc(u.id)}',{forceLogout:false},'Tangguhan dilepas.')">Lepas</button></td></tr>`).join('');document.getElementById('unforceUsersEmpty').style.display=arr.length?'none':'block';}
async function loadProblemUsers(){await loadUsers();const arr=Object.values(allUsers).filter(u=>u.banned||u.banAkses||u.forceLogout);document.getElementById('problemUsersTable').innerHTML=arr.map(u=>`<tr><td>${esc(u.username)}</td><td>${esc(u.role||'')}</td><td>${u.banned?'Banned ':''}${u.banAkses?'Ban Akses ':''}${u.forceLogout?'Tangguh':''}</td><td><button class="btn btn-outline btn-xs" onclick="openEditUserModal('${esc(u.id)}')">Edit</button></td></tr>`).join('');document.getElementById('problemUsersEmpty').style.display=arr.length?'none':'block';}
async function loadActivations(){await loadUsers();const arr=Object.values(allUsers);const p=arr.filter(u=>u.status==='pending'||u.needsActivation),a=arr.filter(u=>u.activationStatus==='accepted'||(u.isActive&&!u.needsActivation)),r=arr.filter(u=>u.activationStatus==='rejected');document.getElementById('countPending').textContent=p.length;document.getElementById('countAccepted').textContent=a.length;document.getElementById('countRejected').textContent=r.length;document.getElementById('pendingActivationsList').innerHTML=p.map(u=>activationCard(u,'accept')).join('');document.getElementById('acceptedActivationsList').innerHTML=a.map(u=>activationCard(u,'none')).join('');document.getElementById('rejectedActivationsList').innerHTML=r.map(u=>activationCard(u,'none')).join('');}
function activationCard(u,act){return `<div class="user-info-card"><div class="user-info-avatar">${esc((u.username||'?')[0])}</div><div class="user-info-details"><div class="user-info-name">${esc(u.username)}</div><div class="user-info-meta"><span>${esc(u.email||'-')}</span><span>${esc(u.paket||'-')}</span></div></div>${act==='accept'?`<button class="btn btn-success btn-sm" onclick="activateUser('${esc(u.id)}')">Aktifkan</button>`:''}</div>`}
async function activateUser(id){await actionUser(id,{status:'active',isActive:true,needsActivation:false,activationStatus:'accepted'},'User diaktifkan.');}
async function loadLogs(){const r=await apiCall('activity_logs','GET');renderLogs(r,'allActivityLog',false);}
async function loadSuspicious(){const r=await apiCall('activity_logs','GET');renderLogs(r,'suspiciousActivityLog',true);}
function renderLogs(r,id,susp){const arr=Object.values(r||{}).sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));const list=susp?arr.filter(x=>/ban|block|failed|sharing|suspicious/i.test(JSON.stringify(x))):arr;document.getElementById(id).innerHTML=list.length?list.map(x=>`<div class="activity-item"><div class="activity-dot ${esc(x.action||'')}"></div><div class="activity-info"><div class="activity-user">${esc(x.username||x.email||'System')}</div><div class="activity-desc">${esc(x.message||x.action||'-')} ${x.ip?'<small>IP '+esc(x.ip)+'</small>':''}</div></div><div class="activity-time">${dateText(x.timestamp||x.createdAt)}</div></div>`).join(''):'<div class="empty-state">Tidak ada log.</div>';}
async function clearAllLogs(){if(!await confirmBox('Hapus semua log aktivitas?'))return;await apiCall('activity_logs','DELETE');toast('Berhasil','Log dihapus.');loadLogs();}
async function loadStats(){await loadUsers();const logs=await apiCall('activity_logs','GET');const n=Object.keys(logs||{}).length;document.getElementById('webStatTotalLogins').textContent=n;}
async function loadMaintenance(){const r=await apiCall('maintenance_status','GET');const d=r||{};const on=d.enabled===true||d.status===true;document.getElementById('maintenanceStatusBadge').textContent=on?'ON':'OFF';document.getElementById('maintenanceStatusBadge').className='badge '+(on?'badge-red':'badge-green');document.getElementById('maintenanceTitle').value=d.title||'';document.getElementById('maintenanceMessage').value=d.message||'';document.getElementById('maintenanceUntil').value=d.until||0;}
async function enableMaintenance(){const data={enabled:true,status:true,title:document.getElementById('maintenanceTitle').value,message:document.getElementById('maintenanceMessage').value,until:Number(document.getElementById('maintenanceUntil').value)||0};await apiCall('maintenance_status','PUT',data);toast('Berhasil','Maintenance aktif.');loadMaintenance();}
async function disableMaintenance(){await apiCall('maintenance_status','PUT',{enabled:false,status:false,title:'',message:'',until:0});toast('Berhasil','Maintenance nonaktif.');loadMaintenance();}
async function loadPaths(){const r=await apiCall('api_paths','GET');const arr=Object.values(r||{});document.getElementById('pathManagerTable').innerHTML=arr.map(x=>`<tr><td>${esc(x.name||x.id)}</td><td>${esc(x.path||'-')}</td><td><input id="path_${esc(x.id)}" value="${esc(x.path||'')}" style="width:100%;padding:7px;border:1px solid var(--border);border-radius:6px"></td><td><button class="btn btn-primary btn-xs" onclick="savePath('${esc(x.id)}')">Simpan</button></td></tr>`).join('');}
async function savePath(id){const v=document.getElementById('path_'+id)?.value||'';await apiCall('api_paths/'+id,'PATCH',{path:v});toast('Berhasil','Path diperbarui.');loadPaths();}
async function migratePasswords(){return startPasswordMigration();}
async function startPasswordMigration(){if(!await confirmBox('Migrasikan semua password plaintext menjadi bcrypt dan hapus plaintext?'))return;const box=document.getElementById('migrationProgress'),res=document.getElementById('migrationResult');box.classList.add('show');res.style.display='none';try{const r=await apiCall('migrate_passwords','POST',{});box.classList.remove('show');res.style.display='block';if(r?.success){res.className='migration-result success';res.innerHTML=`Migrasi selesai.<br>Berhasil: <b>${r.migrated||0}</b><br>Sudah hash: <b>${r.alreadyHashed||0}</b><br>Dilewati: <b>${r.skipped||0}</b><br>Gagal: <b>${r.failed||0}</b>`;}else{res.className='migration-result error';res.textContent='Migrasi gagal.';}}catch(e){box.classList.remove('show');res.style.display='block';res.className='migration-result error';res.textContent=e.message||'Migrasi gagal.';}}
async function loadSettings(){const r=await apiCall('admin/auth','GET');if(r?.email)document.getElementById('settingsEmail').value=r.email;}
function openChangeEmailModal(){document.getElementById('changeEmailModal').classList.add('show');}
function openChangePasswordModal(){document.getElementById('changePasswordModal').classList.add('show');}
function togglePassword(){const x=document.getElementById('settingsPassword');x.type=x.type==='password'?'text':'password';}
async function changeEmail(){const email=document.getElementById('newEmailChange').value.trim();if(!email)return;await apiCall('admin/auth','PATCH',{email});closeModal('changeEmailModal');toast('Berhasil','Email diperbarui.');}
async function changePassword(){const a=document.getElementById('newPasswordSettings').value,b=document.getElementById('confirmNewPassword').value;if(a.length<6||a!==b)return toast('Password tidak valid','Pastikan minimal 6 karakter dan sama.','warning');await apiCall('admin/auth','PATCH',{password:a});closeModal('changePasswordModal');toast('Berhasil','Password diperbarui.');}
function verifySettingsActionKey(){settingsActionVerified=true;closeSettingsKeyOverlay();toast('Berhasil','Key aksi diverifikasi.');}
function closeSettingsKeyOverlay(){document.getElementById('settingsKeyOverlay').classList.remove('show');}
async function getAdminKeyFromServer(){const r=await apiCall('admin/auth','GET');document.getElementById('serverAdminKey').value=r?.adminKey?'••••••••':'Tidak tersedia';document.getElementById('serverKeyStatus').textContent='Key tidak ditampilkan untuk keamanan.';}
function clearServerKey(){document.getElementById('serverAdminKey').value='Belum login';document.getElementById('serverKeyStatus').textContent='Key dibersihkan.';}
function addActionKey(){toast('Info','Penambahan action key sebaiknya dilakukan di environment/server.','info');}
function addWhitelistIP(){toast('Info','Whitelist IP dikelola server.','info');}
function addWhitelistFP(){toast('Info','Whitelist fingerprint dikelola server.','info');}
function switchActivationTab(tab){document.querySelectorAll('.activation-tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.activation-section').forEach(x=>x.classList.remove('show'));const map={pending:['tabPending','sectionPending'],accepted:['tabAccepted','sectionAccepted'],rejected:['tabRejected','sectionRejected']};document.getElementById(map[tab][0]).classList.add('active');document.getElementById(map[tab][1]).classList.add('show');}
function updateClock(){const e=document.getElementById('clockDisplay');if(e)e.innerHTML='<i class="far fa-clock"></i> '+new Date().toLocaleTimeString('id-ID');}
async function loadDashboard(){await loadUsers();await loadLogs();}
setInterval(updateClock,1000);
setInterval(async()=>{if(currentSession){const blocked=await checkBlockedOnLoad();if(blocked){await logout();return;}try{const r=await apiCall('admin/auth','GET');if(r?.forceLogout)await logout();}catch{}}},60000);
document.addEventListener('DOMContentLoaded',async()=>{
    updateClock();
    if(currentSession){
        const blocked=await checkBlockedOnLoad();
        if(!blocked){showLogin(false);document.getElementById('loggedUser').textContent=currentAdmin?.email||'Admin';document.getElementById('navbarUserName').textContent=currentAdmin?.email||'Admin';await loadDashboard();}
        else {sessionStorage.clear();currentSession='';showLogin(true);}
    } else {
        showLogin(true);
        await checkBlockedOnLoad();
    }
});
