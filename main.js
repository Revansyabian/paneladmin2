var API_REVANSTORE = '/api/revanstore';

var currentAdmin = null;
var allUsers = [];

function parseDate(d) {
    if(!d) return null;
    var p = d.split('/');
    if(p.length !== 3) return null;
    var m = parseInt(p[0])-1, day = parseInt(p[1]), y = parseInt(p[2]);
    if(isNaN(day)||isNaN(m)||isNaN(y)) return null;
    if(m<0||m>11||day<1||day>31||y<1000||y>9999) return null;
    var dt = new Date(y,m,day);
    if(y===9999) return dt;
    if(dt.getMonth()!==m||dt.getDate()!==day||dt.getFullYear()!==y) return null;
    return dt;
}

function formatDate(d) {
    return String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getDate()).padStart(2,'0')+'/'+d.getFullYear();
}

function calculateDaysLeft(e) {
    var ex = parseDate(e);
    if(!ex) return -9999;
    if(ex.getFullYear()===9999) return 999999;
    var n = new Date(); n.setHours(0,0,0,0);
    return Math.floor((ex-n)/(1000*60*60*24));
}

function getStatus(d) {
    if(d===999999) return { text:'PERMANENT', class:'status-permanent', icon:'♾️' };
    if(d<=0) return { text:'EXPIRED', class:'status-expired', icon:'⏰' };
    if(d<=3) return { text:'SEGERA HABIS', class:'status-warning', icon:'⚠️' };
    return { text:'AKTIF', class:'status-aktif', icon:'✅' };
}

function esc(s) { return s ? s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;') : ''; }

function showAlert(m, t) {
    var b = document.getElementById('alertBox');
    document.getElementById('alertMessage').textContent = m;
    b.style.borderLeftColor = t==='success'?'#00a65a':t==='warning'?'#f39c12':t==='permanent'?'#9b59b6':'#e74c3c';
    b.classList.add('show');
    setTimeout(function(){ b.classList.remove('show'); }, 4000);
}

function hideAlert() { document.getElementById('alertBox').classList.remove('show'); }

function setQuickDate(t, p) {
    var f = t==='new'?'newExpiryDate':'editExpiryDate', d;
    if(p==='permanent') d='12/31/9999';
    else if(p==='week') { d=new Date(); d.setDate(d.getDate()+7); d=formatDate(d); }
    else if(p==='month') { d=new Date(); d.setMonth(d.getMonth()+1); d=formatDate(d); }
    else if(p==='year') { d=new Date(); d.setFullYear(d.getFullYear()+1); d=formatDate(d); }
    document.getElementById(f).value = d;
}

function switchTab(t) {
    document.querySelectorAll('.tab').forEach(function(x){ x.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function(x){ x.classList.remove('active'); });
    if(t==='adduser') {
        document.querySelectorAll('.tab')[0].classList.add('active');
        document.getElementById('adduser').classList.add('active');
    } else {
        document.querySelectorAll('.tab')[1].classList.add('active');
        document.getElementById('users').classList.add('active');
        loadUsers();
    }
}

function openEditModal(id) {
    var u = allUsers.find(function(x){ return x.id===id; });
    if(!u) return;
    document.getElementById('editUserId').value = id;
    document.getElementById('editUsername').value = u.username;
    document.getElementById('editPassword').value = '';
    document.getElementById('editRole').value = u.role;
    document.getElementById('editExpiryDate').value = u.expiry_date;
    document.getElementById('editModal').classList.add('show');
}

function closeEditModal() { document.getElementById('editModal').classList.remove('show'); }

function searchUsers() {
    var t = document.getElementById('searchUser').value.toLowerCase();
    displayUsers(t ? allUsers.filter(function(u){ return u.username.toLowerCase().includes(t)||u.role.toLowerCase().includes(t)||u.expiry_date.includes(t); }) : allUsers);
}

function displayUsers(users) {
    var c = document.getElementById('userListContainer');
    document.getElementById('totalUsers').textContent = users.length;
    document.getElementById('userCount').textContent = users.length;
    if(!users.length) { c.innerHTML = '<div style="text-align:center;padding:50px;">😕<br>Tidak ada user</div>'; return; }
    users.sort(function(a,b){ return a.username.localeCompare(b.username); });
    var h = '';
    users.forEach(function(u){
        var d = calculateDaysLeft(u.expiry_date), s = getStatus(d);
        var cd = u.created ? new Date(u.created).toLocaleDateString('id-ID') : '-';
        var dt = d===999999?'PERMANENT':(d<0?Math.abs(d)+' hari lalu':d+' hari tersisa');
        h += '<div class="user-item">';
        h += '<div class="user-name"><span>'+esc(u.username)+'</span><span class="user-status '+s.class+'">'+s.icon+' '+s.text+'</span></div>';
        h += '<div class="user-details">🔑 '+esc(u.password)+' • 🎭 '+esc(u.role)+'</div>';
        h += '<div class="user-details">📅 '+esc(u.expiry_date)+' • ⏰ '+dt+'</div>';
        h += '<div class="user-details" style="font-size:12px;color:#888;">Dibuat: '+cd+' • Oleh: '+esc(u.created_by)+'</div>';
        h += '<div class="action-buttons">';
        h += '<button class="btn-small btn-orange" onclick="openEditModal(\''+u.id+'\')">✏️ Edit</button>';
        h += '<button class="btn-small btn-permanent" onclick="setSingleUserPermanent(\''+u.id+'\',\''+esc(u.username)+'\')">♾️ Permanent</button>';
        h += '<button class="btn-small btn-red" onclick="deleteUserConfirm(\''+u.id+'\',\''+esc(u.username)+'\')">🗑️ Hapus</button>';
        h += '</div></div>';
    });
    c.innerHTML = h;
}

async function login() {
    var u = document.getElementById('loginUsername').value.trim();
    var p = document.getElementById('loginPassword').value.trim();
    if(!u||!p) return showAlert('Isi username dan password!','error');
    try {
        var r = await API.login(u, p);
        if(r.success) {
            currentAdmin = u;
            document.getElementById('loggedUser').textContent = u;
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('adminPanel').style.display = 'block';
            showAlert('Login berhasil!','success');
            await loadUsers();
        } else { showAlert(r.message,'error'); }
    } catch(e) { showAlert('Error: '+e.message,'error'); }
}

function logout() {
    currentAdmin = null;
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'block';
}

async function loadUsers() {
    try { allUsers = await API.getUsers(); displayUsers(allUsers); } catch(e) {}
}

async function addUserNow() {
    var u = document.getElementById('newUser').value.trim();
    var p = document.getElementById('newPass').value.trim();
    var r = document.getElementById('newRole').value;
    var e = document.getElementById('newExpiryDate').value.trim();
    if(!u||!p||!e) return showAlert('Semua field wajib diisi!','error');
    if(p.length<6) return showAlert('Password min 6 karakter!','error');
    try {
        await API.addUser({ username:u, password:p, role:r, expiry_date:e });
        document.getElementById('newUser').value = '';
        document.getElementById('newPass').value = '';
        showAlert('User berhasil ditambahkan!','success');
        await loadUsers();
        switchTab('users');
    } catch(e) { showAlert(e.message,'error'); }
}

async function saveUserChanges() {
    var id = document.getElementById('editUserId').value;
    var u = document.getElementById('editUsername').value.trim();
    var p = document.getElementById('editPassword').value.trim();
    var r = document.getElementById('editRole').value;
    var e = document.getElementById('editExpiryDate').value.trim();
    try {
        await API.updateUser(id, { username:u, password:p||undefined, role:r, expiry_date:e });
        closeEditModal();
        showAlert('User diperbarui!','success');
        await loadUsers();
    } catch(e) { showAlert(e.message,'error'); }
}

function deleteUserConfirm(id, name) { if(confirm('Yakin hapus "'+name+'"?')) deleteUser(id); }
async function deleteUser(id) { try { await API.deleteUser(id); showAlert('User dihapus','success'); await loadUsers(); } catch(e) {} }

async function setSingleUserPermanent(id, name) {
    if(!confirm('Ubah "'+name+'" jadi PERMANENT?')) return;
    try { await API.updateUser(id, { expiry_date:'12/31/9999' }); showAlert(name+' PERMANENT!','permanent'); await loadUsers(); } catch(e) {}
}

async function setAllUsersPermanent() {
    if(!confirm('Ubah SEMUA user jadi PERMANENT?')) return;
    try { var r = await API.setAllPermanent(); showAlert(r.count+' user diubah!','permanent'); await loadUsers(); } catch(e) {}
}

document.addEventListener('DOMContentLoaded', function() {
    var nm = new Date(); nm.setMonth(nm.getMonth()+1);
    document.getElementById('newExpiryDate').value = formatDate(nm);
    document.getElementById('loginPassword').addEventListener('keypress', function(e){ if(e.key==='Enter') login(); });
});