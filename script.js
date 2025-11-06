// <<<< GANTI DENGAN URL WEB APP APPS SCRIPT ANDA >>>>
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwROFN6M-hR-aUo9kh5KkTOTpm6KHsX_l55IvxW4Zhi_uDDWw_PLMFKHakSyl6q5_bmeg/exec"; 
// <<<<<<<<<<<<<<<<<<<<<<>>>>>>>>>>>>>>>>>>>>>>>>>>>>

let chatPollingInterval = null;
let currentChatTarget = null;
let globalUserData = null; 

// ----------------------------------------------------
// FUNGSI UTILITY & KOMUNIKASI
// ----------------------------------------------------

async function fetchData(action, method = 'GET', data = {}) {
    const token = localStorage.getItem('userToken');
    const url = new URL(APPS_SCRIPT_URL);
    let requestOptions = { 
        method: method,
        headers: { 'Content-Type': 'application/json' } 
    };

    if (method === 'POST') {
        data.action = action;
        if (action !== 'login') data.token = token;
        requestOptions.body = JSON.stringify(data);
    } else if (method === 'GET') {
        url.searchParams.append('action', action);
        if (token) url.searchParams.append('token', token);
        for (const key in data) {
            url.searchParams.append(key, data[key]);
        }
    }

    try {
        const response = await fetch(url.toString(), requestOptions);
        if (!response.ok && response.status !== 401 && response.status !== 400) {
             const errorText = await response.text();
             console.error(`HTTP error! status: ${response.status}`, errorText);
             return { success: false, message: `Server error (${response.status})` };
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching data:', error);
        return { success: false, message: 'Gagal koneksi ke Backend Apps Script. Cek URL Web App.' };
    }
}

// ----------------------------------------------------
// LOGIKA OTENTIKASI & SESI
// ----------------------------------------------------

document.getElementById('login-form').addEventListener('submit', handleLogin);

async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value; 
    const password = document.getElementById('password').value; 
    const messageEl = document.getElementById('login-message');
    messageEl.textContent = 'Memproses...';

    const result = await fetchData('login', 'POST', { username, password });

    if (result.success) {
        localStorage.setItem('userToken', result.token);
        globalUserData = result.user; // Simpan data user dari response login
        messageEl.textContent = 'Login berhasil. Memuat Dashboard...';
        loadDashboard();
    } else {
        messageEl.textContent = result.message || 'Login gagal. Cek kredensial.';
    }
}

function checkAuth() {
    const token = localStorage.getItem('userToken');
    if (token) {
        loadDashboard();
    } else {
        showPage('login-page');
    }
}

async function loadDashboard() {
    // Verifikasi token dengan mencoba memuat data awal
    const result = await fetchData('readData', 'GET', { sheet: 'FORM-A1' }); 
    
    if (result.success && result.user) {
        globalUserData = result.user;
        document.getElementById('welcome-message').textContent = `Dashboard - ${result.user.TIPE_USER}`;
        document.getElementById('current-user-role').textContent = `${result.user.USERNAME} (${result.user.TIPE_USER})`;
        
        showPage('dashboard-page');
        document.querySelector('nav').style.display = 'flex'; 
        showContent('Berita'); // Default tampilkan Berita setelah login
    } else {
        // Sesi habis, error otentikasi.
        localStorage.removeItem('userToken');
        alert(result.message || 'Sesi habis. Silakan login kembali.');
        showPage('login-page'); 
    }
}

function logout() {
    localStorage.removeItem('userToken');
    globalUserData = null;
    if (chatPollingInterval) clearInterval(chatPollingInterval);
    alert('Anda telah logout.');
    checkAuth(); 
}

function showPage(pageId) {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('dashboard-page').classList.add('hidden');
    document.getElementById(pageId).classList.remove('hidden');
}

// ----------------------------------------------------
// LOGIKA TAMPILAN KONTEN (CRUD & CHATTING)
// ----------------------------------------------------

async function showContent(formName) {
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = `<h3>Memuat Data ${formName}...</h3>`;
    
    if (formName !== 'Chatting' && chatPollingInterval) {
        clearInterval(chatPollingInterval);
        chatPollingInterval = null;
    }

    let sheetName;
    if (formName === 'A1') sheetName = 'FORM-A1';
    else if (formName === 'A2') sheetName = 'FORM-A2';
    else if (formName === 'A3') sheetName = 'FORM-A3';
    else if (formName === 'Berita') sheetName = 'Berita';
    else if (formName === 'Chatting') sheetName = 'Chathistory';
    else return;

    const result = await fetchData('readData', 'GET', { sheet: sheetName });

    if (result.success) {
        const user = result.user;
        if (formName === 'Chatting') {
            renderChatInterface(user);
        } else if (formName === 'Berita') {
            renderBeritaInterface(result.data, user);
        } else {
            renderCrudInterface(formName, sheetName, result.data, user);
        }
    } else {
        contentArea.innerHTML = `<p style="color: red;">Gagal memuat data. ${result.message}. Silakan coba logout dan login kembali.</p>`;
        if (result.message && result.message.includes('login')) {
             localStorage.removeItem('userToken');
             showPage('login-page');
        }
    }
}

function renderCrudInterface(formName, sheetName, data, user) {
    const contentArea = document.getElementById('content-area');
    
    const primaryKey = sheetName === 'FORM-A1' ? 'ID_KLUB' : sheetName === 'FORM-A2' ? 'ID_PEMAIN' : 'ID_LINE_UP';
    
    const canCreate = user.TIPE_USER === 'ADMINPUSAT' || user.TIPE_USER === 'ADMIN MEDIA' || (user.TIPE_USER === 'ADMIN KLUB' && sheetName === 'FORM-A1' && data.length === 0) || (user.TIPE_USER === 'ADMIN KLUB' && sheetName !== 'FORM-A1');
    const headers = data.length > 0 ? Object.keys(data[0]) : [];

    let html = `
        <h3>Data ${formName} (${sheetName})</h3>
        ${canCreate ? `<button class="action-btn" onclick="openModal('${sheetName}', null)">Tambah Data Baru</button>` : ''}
        
        <div style="overflow-x: auto;">
        <table>
            <thead>
                <tr>
                    <th>No</th>
                    ${headers.map(h => `<th>${h.replace(/_/g, ' ')}</th>`).join('')}
                    <th>Aksi</th>
                </tr>
            </thead>
            <tbody>
                ${data.map((item, index) => {
                    const idValue = item[primaryKey] || 'N/A';
                    const itemJson = JSON.stringify(item).replace(/"/g, '&quot;');
                    return `
                    <tr>
                        <td>${index + 1}</td>
                        ${headers.map(h => `<td>${item[h]}</td>`).join('')}
                        <td>
                            <button class="action-btn" onclick="openModal('${sheetName}', ${itemJson})">Edit</button>
                            <button class="delete-btn" onclick="deleteDataFromSheet('${sheetName}', '${primaryKey}', '${idValue}')">Hapus</button>
                        </td>
                    </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
        </div>
    `;
    contentArea.innerHTML = html;
}

function renderBeritaInterface(data, user) {
    const contentArea = document.getElementById('content-area'); 
    const canManage = user.TIPE_USER && (user.TIPE_USER === 'ADMINPUSAT' || user.TIPE_USER === 'ADMIN_MEDIA');
    const primaryKey = 'ID_BERITA';

    let html = `
        <h3>Berita ASKAB PSSI MENTAWAI</h3>
        ${canManage ? `<button class="action-btn" onclick="openModal('Berita', null)">Tulis Berita Baru</button>` : ''}
        <div id="berita-list" style="margin-top: 20px;">
        ${data.reverse().map(item => `
            <div style="border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 5px;">
                <h4 style="color: #004d99;">${item.JUDUL_BERITA}</h4>
                <p style="font-size: 0.8em; color: #666;">Oleh: ${item.PENULIS || 'Admin'} - ${item.TANGGAL}</p>
                ${item.POTO_URL ? `<img src="${item.POTO_URL}" style="max-width: 100%; height: auto; margin: 10px 0;">` : ''}
                <p>${item.ISI_BERITA ? (item.ISI_BERITA.substring(0, 300) + '...') : ''} <a href="#" onclick="alert('${(item.ISI_BERITA || '').replace(/'/g, '\\\'').replace(/\n/g, '\\n')}')">Baca Selengkapnya</a></p>
                
                ${canManage ? `
                    <button class="action-btn" onclick="openModal('Berita', ${JSON.stringify(item).replace(/"/g, '&quot;')})">Edit</button>
                    <button class="delete-btn" onclick="deleteDataFromSheet('Berita', '${primaryKey}', '${item[primaryKey]}')">Hapus</button>
                ` : ''}
            </div>
        `).join('')}
        </div>
    `;
    contentArea.innerHTML = html;
}

function renderChatInterface(user) {
    const contentArea = document.getElementById('content-area');
    const availableTargets = [
        { name: 'ASKAB PUSAT', username: 'ASKAB' },
        { name: 'ADMIN MEDIA', username: 'ADMIN_MEDIA' },
    ];
    
    contentArea.innerHTML = `
        <h3>Chatting</h3>
        <p>Anda: <strong>${user.USERNAME}</strong></p>
        <div class="form-group">
            <label for="target-user">Chat dengan:</label>
            <select id="target-user" onchange="startChatSession(this.value, '${user.USERNAME}')">
                <option value="">-- Pilih Lawan Bicara --</option>
                ${availableTargets.filter(t => t.username !== user.USERNAME).map(t => `<option value="${t.username}">${t.name} (${t.username})</option>`).join('')}
            </select>
        </div>
        
        <div id="chat-box">
            <p style="text-align: center;">Pilih lawan bicara untuk memulai chat.</p>
        </div>
        
        <form id="chat-form" class="hidden" onsubmit="handleSendChat(event, '${user.USERNAME}')">
            <input type="text" id="chat-input" placeholder="Ketik pesan..." required style="width: 80%;">
            <button type="submit" style="width: 18%;" class="action-btn">Kirim</button>
        </form>
    `;
}

function startChatSession(targetUser, currentUser) {
    if (chatPollingInterval) clearInterval(chatPollingInterval);
    currentChatTarget = targetUser;
    
    if (targetUser) {
        document.getElementById('chat-form').classList.remove('hidden');
        fetchAndDisplayChat(currentUser, targetUser);
        chatPollingInterval = setInterval(() => fetchAndDisplayChat(currentUser, targetUser), 5000); 
    } else {
        document.getElementById('chat-box').innerHTML = '<p style="text-align: center;">Pilih lawan bicara untuk memulai chat.</p>';
        document.getElementById('chat-form').classList.add('hidden');
    }
}

async function fetchAndDisplayChat(currentUser, targetUser) {
    const chatBox = document.getElementById('chat-box');
    const result = await fetchData('getChatHistory', 'GET', { targetUser: targetUser });
    
    if (result.success) {
        renderChatMessages(result.data, currentUser, chatBox);
        await fetchData('markRead', 'POST', { targetUser: targetUser }); // Tandai pesan masuk sebagai dibaca
    } else {
        chatBox.innerHTML = `<p style="color: red; text-align: center;">Gagal memuat chat: ${result.message}</p>`;
    }
}

function renderChatMessages(messages, currentUser, chatBox) {
    const shouldScroll = chatBox.scrollTop + chatBox.clientHeight >= chatBox.scrollHeight - 20;

    let html = messages.map(msg => {
        const isSelf = msg.PENGIRIM === currentUser;
        const className = isSelf ? 'chat-self' : 'chat-other';
        return `
            <div class="chat-message ${className}">
                <div class="chat-bubble">
                    ${msg.ISI_CHAT}
                    <span class="chat-meta">${msg.TANGGAL_CHAT}</span>
                </div>
            </div>
        `;
    }).join('');

    chatBox.innerHTML = html;

    // Scroll ke bawah jika sebelumnya sudah di bawah
    if (shouldScroll) {
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

async function handleSendChat(event, currentUser) {
    event.preventDefault();
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message || !currentChatTarget) return;

    const data = {
        PENERIMA: currentChatTarget,
        ISI_CHAT: message
    };

    const result = await fetchData('postChat', 'POST', { data: data });

    if (result.success) {
        input.value = '';
        // Muat ulang chat untuk menampilkan pesan yang baru dikirim
        fetchAndDisplayChat(currentUser, currentChatTarget); 
    } else {
        alert("Gagal mengirim pesan: " + result.message);
    }
}


function getFormFields(sheetName, userData) {
    const user = userData || globalUserData; // Menggunakan globalUserData
    const baseFields = {
        'ID_KLUB': { type: 'text', readOnly: true, value: user.ID_KLUB || '' },
    };
    
    if (user.TIPE_USER !== 'ADMIN KLUB') baseFields.ID_KLUB.readOnly = false;

    if (sheetName === 'FORM-A1') {
        return {
            ...baseFields,
            'NAMA_RESMI_KLUB': { type: 'text', value: '', header: 'DATA KLUB', required: true },
            'JULUKAN_KLUB': { type: 'text', value: '' },
            'TANGGAL_BERDIRI': { type: 'date' }, 
            'ALAMAT': { type: 'textarea' },
            'DESA': { type: 'text' }, 
            'KECAMATAN': { type: 'text' },
            'PROVINSI': { type: 'text' },
            'NO_HANDPHONE': { type: 'tel' }, 
            'EMAIL': { type: 'email' },     
            'MANAJER': { type: 'text', header: 'DATA PENGURUS KLUB' }, 
            'HP_MANAJER': { type: 'tel' },
            'ASISTEN_MANAJER': { type: 'text' },
            'HP_ASISTEN_MANAJER': { type: 'tel' },
            'SEKRETARIS': { type: 'text' },
            'HP_SEKRETARIS': { type: 'tel' },
            'BENDAHARA': { type: 'text' },
            'HP_BENDAHARA': { type: 'tel' },
            'MEDIA': { type: 'text' },
            'HP_MEDIA': { type: 'tel' },
            'PELATIH': { type: 'text', header: 'DATA PELATIH' },
            'HP_PELATIH': { type: 'tel' },
            'ASISTEN_PELATIH': { type: 'text' },
            'HP_ASISTEN_PELATIH': { type: 'tel' },
            'STAFF_LAINNYA': { type: 'text', header: 'STAFF LAINNYA' },
            'HP_STAFF_LAINNYA': { type: 'tel' },
        };
    } else if (sheetName === 'FORM-A2') {
        return {
            ...baseFields,
            'NAMA_KLUB': { type: 'text', readOnly: true, value: user.NAMA_KLUB || 'Otomatis' },
            'ID_PEMAIN': { type: 'text', helper: '16 Angka Unik (NIK/No. Identitas Lain)', required: true },
            'NAMA_LENGKAP': { type: 'text', required: true },
            'NAMA_PUNGGUNG': { type: 'text' },
            'NPG': { type: 'number', helper: 'Nomor Punggung' },
            'TANGGAL_LAHIR': { type: 'date', required: true },
            'USIA': { type: 'number', readOnly: true, helper: 'Diisi otomatis' },
            'KETERANGAN': { type: 'text' },
        };
    } else if (sheetName === 'FORM-A3') {
        return {
            'ID_LINE_UP': { type: 'text', readOnly: true, value: 'Otomatis dibuat' }, 
            'TANGGAL_PERTANDINGAN': { type: 'date', value: new Date().toISOString().substring(0, 10), required: true },
            'LOKASI_PERTANDINGAN': { type: 'text', value: 'LAPANGAN GOISO OINAN' },
            'ID_KLUB': { type: 'text', readOnly: true, value: user.ID_KLUB || '' },
            'TIPE_PEMAIN': { type: 'select', options: ['UTAMA', 'CADANGAN'], required: true, helper: 'Status Pemain di Pertandingan' },
            'ID_PEMAIN': { type: 'select', helper: 'Pilih Pemain (Data dari A2)', required: true },
            'NAMA_PUNGGUNG': { type: 'text', helper: 'Nama Pendek Pemain (Diisi Otomatis)' , readOnly: true},
            'NO_PUNGGUNG': { type: 'number', helper: 'Diisi Otomatis' , readOnly: true},
            'POSISI': { type: 'select', options: ['KIPER', 'BEK', 'GELANDANG', 'PENYERANG', 'SAYAP'], required: true },
        };
    } else if (sheetName === 'Berita') {
        return {
            'JUDUL_BERITA': { type: 'text', required: true }, 
            'POTO_URL': { type: 'text', helper: 'URL Gambar Thumbnail' },
            'ISI_BERITA': { type: 'textarea', required: true }, 
            'PENULIS': { type: 'text', readOnly: true, value: user.USERNAME },
        };
    }
    return {};
}

async function openModal(sheetName, itemData) {
    const modal = document.getElementById('modal');
    const form = document.getElementById('dynamic-form');
    const isEdit = !!itemData;
    const fields = getFormFields(sheetName, globalUserData);
    let html = '';
    
    // Set title
    document.getElementById('modal-title').textContent = isEdit ? `Edit Data ${sheetName}` : `Tambah Data ${sheetName}`;
    
    // Build form HTML
    for (const key in fields) {
        const field = fields[key];
        const currentValue = isEdit ? (itemData[key] || field.value || '') : (field.value || '');
        const readOnly = (field.readOnly || isEdit && key === 'ID_KLUB' && globalUserData.TIPE_USER === 'ADMIN KLUB') ? 'readonly' : '';
        const required = field.required ? 'required' : '';
        const helper = field.helper ? `<small style="color:#666; display:block;">(${field.helper})</small>` : '';

        if (field.header) {
             html += `<h4 style="border-top: 1px solid #ccc; padding-top: 15px; margin-top: 20px;">${field.header}</h4>`;
        }

        if (field.type === 'select' && key === 'ID_PEMAIN') {
            html += `
                <div class="form-group">
                    <label for="${key}">${key.replace(/_/g, ' ')} ${required ? '*' : ''}:</label>
                    <select id="${key}" ${required} ${readOnly} onchange="fillPlayerDetails(this.value)">
                        <option value="">Memuat pemain...</option>
                    </select>
                    ${helper}
                </div>
            `;
        } else if (field.type === 'select') {
            html += `
                <div class="form-group">
                    <label for="${key}">${key.replace(/_/g, ' ')} ${required ? '*' : ''}:</label>
                    <select id="${key}" ${required} ${readOnly}>
                        ${field.options.map(opt => `<option value="${opt}" ${opt == currentValue ? 'selected' : ''}>${opt}</option>`).join('')}
                    </select>
                    ${helper}
                </div>
            `;
        } else if (field.type === 'textarea') {
            html += `
                <div class="form-group">
                    <label for="${key}">${key.replace(/_/g, ' ')} ${required ? '*' : ''}:</label>
                    <textarea id="${key}" ${required} ${readOnly}>${currentValue}</textarea>
                    ${helper}
                </div>
            `;
        } else {
            let inputType = field.type;
            let formattedValue = currentValue;
            
            // Format tanggal untuk input type="date"
            if (inputType === 'date' && currentValue) {
                try {
                     const dateObj = new Date(currentValue);
                     formattedValue = dateObj.toISOString().substring(0, 10);
                } catch(e) { /* ignore */ }
            }

            html += `
                <div class="form-group">
                    <label for="${key}">${key.replace(/_/g, ' ')} ${required ? '*' : ''}:</label>
                    <input type="${inputType}" id="${key}" value="${formattedValue}" ${required} ${readOnly}>
                    ${helper}
                </div>
            `;
        }
    }

    html += `<button type="submit" class="action-btn" style="width:100%;">Simpan Data</button>`;
    form.innerHTML = html;
    
    form.onsubmit = (e) => handleDynamicFormSubmit(e, sheetName, isEdit, itemData);
    
    if (sheetName === 'FORM-A3') {
        fillPlayerDropdownInModal(itemData);
    }
    
    modal.classList.remove('hidden');
}

async function fillPlayerDropdownInModal(itemData) {
    const dropdown = document.getElementById('ID_PEMAIN');
    if (!dropdown) return;
    
    const result = await fetchData('readData', 'GET', { sheet: 'FORM-A2' });
    
    if (result.success) {
        let players = result.data;
        
        // Filter pemain hanya dari klub user yang sedang login
        if (globalUserData.TIPE_USER === 'ADMIN KLUB' && globalUserData.ID_KLUB) {
             players = players.filter(p => p.ID_KLUB === globalUserData.ID_KLUB);
        }

        dropdown.innerHTML = '<option value="">-- Pilih Pemain --</option>';
        players.forEach(player => {
            const selected = itemData && itemData.ID_PEMAIN === player.ID_PEMAIN ? 'selected' : '';
            dropdown.innerHTML += `<option value="${player.ID_PEMAIN}" data-npg="${player.NPG}" data-nama="${player.NAMA_PUNGGUNG}" ${selected}>${player.NAMA_LENGKAP} (${player.NPG})</option>`;
        });
        
        // Atur event onchange
        dropdown.onchange = (e) => fillPlayerDetails(e.target.value);
        
        // Panggil sekali untuk mengisi detail jika dalam mode edit
        if(itemData && itemData.ID_PEMAIN) {
             fillPlayerDetails(itemData.ID_PEMAIN);
        }
    } else {
        dropdown.innerHTML = `<option value="">Gagal memuat data pemain: ${result.message}</option>`;
    }
}

function fillPlayerDetails(playerId) {
    const dropdown = document.getElementById('ID_PEMAIN');
    const selectedOption = dropdown.querySelector(`option[value="${playerId}"]`);
    
    const namaPunggungInput = document.getElementById('NAMA_PUNGGUNG');
    const noPunggungInput = document.getElementById('NO_PUNGGUNG');
    
    if (selectedOption) {
        namaPunggungInput.value = selectedOption.getAttribute('data-nama') || '';
        noPunggungInput.value = selectedOption.getAttribute('data-npg') || '';
    } else {
        namaPunggungInput.value = '';
        noPunggungInput.value = '';
    }
}

function closeModal() {
    document.getElementById('modal').classList.add('hidden');
    document.getElementById('dynamic-form').innerHTML = '';
}

async function handleDynamicFormSubmit(event, sheetName, isEdit, itemData) {
    event.preventDefault();
    const form = event.target;
    const fields = getFormFields(sheetName);
    const dataToSend = {};
    
    // Kumpulkan data dari form
    for (const key in fields) {
        const element = form.elements[key];
        if (element) {
             dataToSend[key] = element.value;
             if (element.type === 'number') {
                 dataToSend[key] = parseInt(element.value) || 0;
             }
        }
    }
    
    let result;
    const primaryKey = sheetName === 'FORM-A1' ? 'ID_KLUB' : sheetName === 'FORM-A2' ? 'ID_PEMAIN' : sheetName === 'FORM-A3' ? 'ID_LINE_UP' : 'ID_BERITA';
    
    if (isEdit) {
        // Logika Update
        const dataToUpdate = {};
        for (const key in dataToSend) {
            // Hanya kirim data yang berubah (simplifikasi, kirim semua kecuali PK)
            if (key !== primaryKey) {
                 dataToUpdate[key] = dataToSend[key];
            }
        }
        
        result = await fetchData('updateData', 'POST', {
            sheet: sheetName,
            keyName: primaryKey,
            keyValue: itemData[primaryKey],
            dataToUpdate: dataToUpdate
        });
    } else {
        // Logika Create
        const action = (sheetName === 'FORM-A2') ? 'createPemainA2' : 'createData';
        result = await fetchData(action, 'POST', {
            sheet: sheetName,
            data: dataToSend
        });
    }

    if (result.success) {
        alert(result.message);
        closeModal();
        showContent(sheetName.replace('FORM-', '')); // Muat ulang konten
    } else {
        alert("Aksi gagal: " + result.message);
    }
}

async function deleteDataFromSheet(sheetName, keyName, keyValue) {
    if (!confirm(`Apakah Anda yakin ingin menghapus data ${keyName}: ${keyValue} dari ${sheetName}?`)) return;

    const result = await fetchData('deleteData', 'POST', {
        sheet: sheetName,
        keyName: keyName,
        keyValue: keyValue
    });

    if (result.success) {
        alert(result.message);
        showContent(sheetName.replace('FORM-', '')); // Muat ulang konten
    } else {
        alert("Penghapusan gagal: " + result.message);
    }
}

// Inisialisasi
document.addEventListener('DOMContentLoaded', checkAuth);
