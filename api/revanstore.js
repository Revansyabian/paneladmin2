
var API = (function() {
    
    var db = null;
    
    // Service Account Key
    var SERVICE_KEY = 'dhagwxwhu:f4afc5aa03e73130f5e055dfe6a708c4dc40759b:RevanStore2024!@#$%';
    
    firebase.initializeApp({
        apiKey: "AIzaSyBq2btJlvAQ1Q9DEXHFgzJ37KF38JjwjoI",
        authDomain: "dhagwxwhu.firebaseapp.com",
        databaseURL: "https://dhagwxwhu-default-rtdb.firebaseio.com",
        projectId: "dhagwxwhu",
        storageBucket: "dhagwxwhu.firebasestorage.app",
        messagingSenderId: "110053074373",
        appId: "1:110053074373:web:1984ce99fd4902354857ac"
    });
    
    db = firebase.database();
    
    function encryptData(data) {
        return CryptoJS.AES.encrypt(JSON.stringify(data), SERVICE_KEY).toString();
    }
    
    function decryptData(encryptedString) {
        try {
            var bytes = CryptoJS.AES.decrypt(encryptedString, SERVICE_KEY);
            var decrypted = bytes.toString(CryptoJS.enc.Utf8);
            return decrypted ? JSON.parse(decrypted) : null;
        } catch(e) {
            return null;
        }
    }
    
    async function setupAdmin() {
        var snap = await db.ref('admin/auth').once('value');
        if(!snap.exists()) {
            await db.ref('admin/auth').set({
                data: encryptData({ username: 'admin', password: 'admin123', role: 'Admin' }),
                created: Date.now()
            });
        }
    }
    
    setupAdmin();
    
    return {
        login: async function(username, password) {
            try {
                var snap = await db.ref('admin/auth').once('value');
                if(!snap.exists()) return { success: false, message: 'Admin tidak ditemukan' };
                
                var dec = decryptData(snap.val().data);
                if(!dec || dec.username !== username || dec.password !== password) {
                    return { success: false, message: 'Username atau password salah' };
                }
                
                return { success: true, message: 'Login berhasil' };
            } catch(e) {
                return { success: false, message: 'Error: ' + e.message };
            }
        },
        
        getUsers: async function() {
            var snap = await db.ref('users').once('value');
            if(!snap.exists()) return [];
            
            var users = [];
            var data = snap.val();
            
            for(var key in data) {
                var dec = decryptData(data[key].data);
                if(dec) {
                    dec.id = key;
                    dec.created = data[key].created;
                    dec.created_by = data[key].created_by || 'admin';
                    users.push(dec);
                }
            }
            
            return users;
        },
        
        addUser: async function(userData) {
            var users = await this.getUsers();
            if(users.some(function(u) { return u.username === userData.username; })) {
                throw new Error('Username sudah digunakan!');
            }
            
            var enc = encryptData(userData);
            var ref = db.ref('users').push();
            await ref.set({
                data: enc,
                created: Date.now(),
                created_by: currentAdmin || 'system'
            });
        },
        
        updateUser: async function(userId, userData) {
            var snap = await db.ref('users/' + userId).once('value');
            if(!snap.exists()) throw new Error('User tidak ditemukan');
            
            var existing = decryptData(snap.val().data);
            if(!existing) throw new Error('Data user rusak');
            
            if(userData.username && userData.username !== existing.username) {
                var users = await this.getUsers();
                if(users.some(function(u) { return u.id !== userId && u.username === userData.username; })) {
                    throw new Error('Username sudah digunakan!');
                }
            }
            
            var merged = {
                username: userData.username || existing.username,
                password: userData.password || existing.password,
                role: userData.role || existing.role,
                expiry_date: userData.expiry_date || existing.expiry_date
            };
            
            var enc = encryptData(merged);
            await db.ref('users/' + userId).update({
                data: enc,
                updated: Date.now(),
                updated_by: currentAdmin || 'system'
            });
        },
        
        deleteUser: async function(userId) {
            await db.ref('users/' + userId).remove();
        },
        
        setAllPermanent: async function() {
            var users = await this.getUsers();
            
            for(var i = 0; i < users.length; i++) {
                var user = users[i];
                var enc = encryptData({
                    username: user.username,
                    password: user.password,
                    role: user.role,
                    expiry_date: '12/31/9999'
                });
                await db.ref('users/' + user.id).update({
                    data: enc,
                    updated: Date.now(),
                    updated_by: currentAdmin || 'system'
                });
            }
            
            return { count: users.length };
        }
    };
    
})();