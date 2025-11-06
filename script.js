// <<<< GANTI DENGAN URL WEB APP APPS SCRIPT ANDA >>>>
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby7QfrwLeRS162b89DpDIuA6bYaV4MsVRuKh1szFmfNEnX_2qvGV7O9fCHaLBsH0kPXcg/exec"; 
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
        headers: {
            'Content-Type': 'application/json'
        } 
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
        if (!response.ok && response.status !== 401) {
             const errorText = await response.text();
             console.error(`HTTP error! status: ${response.status}`, errorText);
             return { success: false, message: `Server error (${response.status})` };
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching data:', error);
        return { success: false, message: 'Gagal koneksi ke Backend Apps Script.' };
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
        // Mode GUEST hanya bisa lihat Berita
        showPage('dashboard-page'); 
        showContent('Berita');
        // Sembunyikan navigasi untuk Guest
        document.querySelector('nav').style.display = 'none'; 
        document.getElementById('welcome-message').textContent = 'ASKAB PSSI KEPULAUAN MENTAWAI';
        document.getElementById('current-user-role').textContent = 'Anda belum login (Guest)';
    }
}

async function loadDashboard() {
    // Coba baca data awal untuk validasi sesi dan mendapatkan detail user
    const result = await fetchData('readData', 'GET', { sheet: 'FORM-A1' }); 
    
    if (result.success) {
        globalUserData = result.user;
        document.getElementById('welcome-message').textContent = `Dashboard - ${result.user.TIPE_USER}`;
        document.getElementById('current-user-role').textContent = `${result.user.USERNAME} (${result.user.TIPE_USER})`;
        showPage('dashboard-page');
        document.querySelector('nav').style.display = 'flex'; 
        showContent('A1'); // Default tampilkan A1
    } else {
        localStorage.removeItem('userToken');
        alert(result.message || 'Sesi habis atau terjadi kesalahan otentikasi. Silakan login kembali.');
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
    
    // Hentikan Polling Chat jika pindah dari halaman Chat
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
            if (user.TIPE_USER === 'GUEST') {
                contentArea.innerHTML = `<p style="color: red;">Anda harus login untuk mengakses Chatting.</p>`;
                return;
            }
            renderChatInterface(user);
        } else if (formName === 'Berita') {
            renderBeritaInterface(result.data, user);
        } else {
            if (user.TIPE_USER === 'GUEST') {
                contentArea.innerHTML = `<p style="color: red;">Anda harus login untuk mengakses data ini.</p>`;
                return;
            }
            renderCrudInterface(formName, sheetName, result.data, user);
        }
    } else {
        contentArea.innerHTML = `<p style="color: red;">Gagal memuat data: ${result.message}.</p>`;
    }
}

function renderCrudInterface(formName, sheetName, data, user) {
    const contentArea = document.getElementById('content-area');
    
    const primaryKey = sheetName === 'FORM-A1' ? 'ID_KLUB' : sheetName === 'FORM-A2' ? 'ID_PEMAIN' : 'ID LINE-UP';
    
    // Logika CREATE: Klub hanya bisa buat A1 jika kosong, atau buat A2/A3. Admin bisa semua.
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
    const canManage = user.TIPE_USER && (user.TIPE_USER === 'ADMINPUSAT' || user.TIPE_USER === 'ADMIN MEDIA');
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
                <p>${item.ISI_BERITA ? (item.ISI_BERITA.substring(0, 300) + '...') : ''} <a href="#" onclick="alert('${(item.ISI_BERITA || '').replace(/'/g, '\\\'')}')">Baca Selengkapnya</a></p>
                
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
    
    // Target Chatting: ASKAB dan ADMIN MEDIA
    const availableTargets = [
        { name: 'ASKAB PUSAT', username: 'ASKAB' },
        { name: 'ADMIN MEDIA', username: 'ADMIN MEDIA' },
    ];
    
    contentArea.innerHTML = `
        <h3>Chatting</h3>
        <p>Anda: <strong>${user.USERNAME}</strong></p>
        <div class="form-group">
            <label for="target-user">Chat dengan:</label>
            <select id="target-user" onchange="startChatSession(this.value, '${user.USERNAME}')">
                <option value="">-- Pilih Lawan Bicara --</option>
                ${availableTargets.map(t => `<option value="${t.username}">${t.name} (${t.username})</option>`).join('')}
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
    if (!targetUser) return;
    
    currentChatTarget = targetUser;
    document.getElementById('chat-form').classList.remove('hidden');
    
    if (chatPollingInterval) clearInterval(chatPollingInterval);
    
    fetchAndDisplayChat(currentUser, targetUser);
    chatPollingInterval = setInterval(() => {
        fetchAndDisplayChat(currentUser, targetUser);
    }, 3000); 
}

async function fetchAndDisplayChat(currentUser, targetUser) {
    const chatBox = document.getElementById('chat-box');
    const isScrolledToBottom = chatBox.scrollTop + chatBox.clientHeight >= chatBox.scrollHeight;

    const result = await fetchData('getChatHistory', 'GET', { targetUser: targetUser });

    if (result.success) {
        const messageCountBefore = chatBox.children.length;
        renderChatMessages(result.data, currentUser);
        const messageCountAfter = chatBox.children.length;

        if (result.data.length > 0) {
            await fetchData('markRead', 'POST', { targetUser: targetUser });
        }
        
        if (messageCountAfter > messageCountBefore || isScrolledToBottom) {
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    } else {
        chatBox.innerHTML = `<p style="color: red;">Gagal memuat chat: ${result.message}</p>`;
    }
}

function renderChatMessages(messages, currentUser) {
    const chatBox = document.getElementById('chat-box');
    let html = messages.map(msg => {
        const isSelf = msg.PENGIRIM === currentUser;
        const alignClass = isSelf ? 'chat-self' : 'chat-other';
        const readStatus = isSelf && msg.IS_READ === 'TRUE' ? '✓✓' : '';
        
        return `
            <div class="chat-message ${alignClass}">
                <span class="chat-bubble">
                    ${msg.ISI_CHAT}
                    <span class="chat-meta">
                        ${msg.TANGGAL_CHAT || new Date().toLocaleTimeString()} ${readStatus}
                    </span>
                </span>
            </div>
        `;
    }).join('');

    chatBox.innerHTML = html;
}

async function handleSendChat(event, currentUser) {
    event.preventDefault();
    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();

    if (!message || !currentChatTarget) return;

    const result = await fetchData('postChat', 'POST', {
        data: {
            PENGIRIM: currentUser,
            PENERIMA: currentChatTarget,
            ISI_CHAT: message
        }
    });

    if (result.success) {
        chatInput.value = '';
        fetchAndDisplayChat(currentUser, currentChatTarget); 
    } else {
        alert("Gagal mengirim pesan: " + result.message);
    }
}

// ----------------------------------------------------
// LOGIKA FORM MODAL (CREATE & UPDATE)
// ----------------------------------------------------

function getFormFields(sheetName, userData) {
    const baseFields = {
        'ID_KLUB': { type: 'text', readOnly: true, value: userData.ID_KLUB || '' },
    };
    
    // Admin Pusat/Media dapat mengedit ID_KLUB secara manual
    if (userData.TIPE_USER !== 'ADMIN KLUB') baseFields.ID_KLUB.readOnly = false;

    if (sheetName === 'FORM-A1') {
        return {
            ...baseFields,
            // DATA KLUB
            'NAMA_RESMI_KLUB': { type: 'text', value: '', header: 'DATA KLUB', required: true },
            'JULUKAN_KLUB': { type: 'text', value: '' },
            'TANGGAL_BERDIRI': { type: 'date' }, 
            'ALAMAT': { type: 'textarea' },
            'DESA': { type: 'text' }, 
            'KECAMATAN': { type: 'text' },
            'PROVINSI': { type: 'text' },
            'NO_HANDPHONE': { type: 'tel' }, 
            'EMAIL': { type: 'email' },     
            
            // DATA PENGURUS
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
            
            // DATA PELATIH
            'PELATIH': { type: 'text', header: 'DATA PELATIH' },
            'HP_PELATIH': { type: 'tel' },
            'ASISTEN_PELATIH': { type: 'text' },
            'HP_ASISTEN_PELATIH': { type: 'tel' },
            
            // STAFF LAINNYA
            'STAFF_LAINNYA': { type: 'text', header: 'STAFF LAINNYA' },
            'HP_STAFF_LAINNYA': { type: 'tel' },
        };
    } else if (sheetName === 'FORM-A2') {
        return {
            ...baseFields,
            'NAMA_KLUB': { type: 'text', readOnly: true, value: 'Otomatis' },
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
            'ID LINE-UP': { type: 'text', readOnly: true, value: 'Otomatis dibuat' }, // PK
            'TANGGAL_PERTANDINGAN': { type: 'date', value: new Date().toISOString().substring(0, 10), required: true },
            'LOKASI_PERTANDINGAN': { type: 'text', value: 'LAPANGAN GOISO OINAN' },
            'ID_KLUB': { type: 'text', readOnly: true, value: userData.ID_KLUB || '' },
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
            'PENULIS': { type: 'text', readOnly: true, value: userData.USERNAME },
            'TANGGAL': { type: 'text', readOnly: true, value: new Date().toLocaleDateString("id-ID") },
        };
    }
    return {};
}

function openModal(sheetName, itemToEdit) {
    const modal = document.getElementById('modal');
    const form = document.getElementById('dynamic-form');
    const title = document.getElementById('modal-title');
    const isEdit = !!itemToEdit;
    
    title.textContent = `${isEdit ? 'Edit' : 'Tambah'} Data ${sheetName}`;
    form.innerHTML = '';
    
    const fields = getFormFields(sheetName, globalUserData);
    const primaryKey = sheetName === 'FORM-A1' ? 'ID_KLUB' : sheetName === 'FORM-A2' ? 'ID_PEMAIN' : sheetName === 'Berita' ? 'ID_BERITA' : 'ID LINE-UP';

    form.dataset.sheet = sheetName;
    form.dataset.primaryKey = primaryKey;
    form.dataset.mode = isEdit ? 'edit' : 'create';
    if (isEdit) form.dataset.keyValue = itemToEdit[primaryKey];

    const inputElements = {}; // Untuk menyimpan referensi input element
    
    for (const key in fields) {
        const field = fields[key];
        
        // Header
        if (field.header) {
            const headerEl = document.createElement('h4');
            headerEl.textContent = field.header;
            headerEl.style.marginTop = '20px';
            headerEl.style.borderBottom = '1px solid #ddd';
            form.appendChild(headerEl);
        }

        const divGroup = document.createElement('div');
        divGroup.className = 'form-group';
        
        const label = document.createElement('label');
        label.textContent = key.replace(/_/g, ' ') + ':';
        divGroup.appendChild(label);
        
        let input;
        
        if (field.type === 'textarea') {
            input = document.createElement('textarea');
            input.rows = 3;
        } else if (field.type === 'select') {
            input = document.createElement('select');
            if (key === 'ID_PEMAIN' && sheetName === 'FORM-A3') {
                fillPlayerDropdownInModal(input, itemToEdit ? itemToEdit[key] : null);
            } else if (field.options) {
                field.options.forEach(optionText => {
                    const option = document.createElement('option');
                    option.value = optionText;
                    option.textContent = optionText;
                    if (isEdit && itemToEdit[key] === optionText) option.selected = true;
                    input.appendChild(option);
                });
            }
        } else {
            input = document.createElement('input');
            input.type = field.type;
        }
        
        input.name = key;
        
        let displayValue = isEdit && itemToEdit[key] !== undefined ? itemToEdit[key] : (field.value || '');
        
        if (field.type === 'date') {
            // Menangani konversi format tanggal dari spreadsheet ke input date HTML
            if (displayValue instanceof Date && !isNaN(displayValue)) {
                displayValue = displayValue.toISOString().substring(0, 10);
            } else if (typeof displayValue === 'string' && displayValue.match(/^\d{4}-\d{2}-\d{2}/)) {
                 // Sudah format YYYY-MM-DD
                 displayValue = displayValue.substring(0, 10);
            } else if (typeof displayValue === 'string') {
                 // Coba konversi format D-M-Y atau D/M/Y ke YYYY-MM-DD
                 const parts = displayValue.split(/[-/]/);
                 if (parts.length === 3) {
                     // Asumsi DD-MM-YYYY atau DD-MM-YY (YY diubah menjadi 19YY atau 20YY)
                     let year = parts[2].length === 2 ? (parseInt(parts[2]) > 50 ? '19' : '20') + parts[2] : parts[2];
                     displayValue = `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                 }
            }
        }
        
        input.value = displayValue;
        if (field.readOnly) input.readOnly = true;
        if (field.required) input.required = true;
        
        divGroup.appendChild(input);
        
        if (field.helper) {
            const helper = document.createElement('small');
            helper.textContent = field.helper;
            helper.style.color = '#666';
            divGroup.appendChild(helper);
        }
        
        form.appendChild(divGroup);
        inputElements[key] = input;
    }
    
    // Logika Auto-fill NAMA_PUNGGUNG dan NO_PUNGGUNG di FORM-A3
    if (sheetName === 'FORM-A3') {
        const id_pemain_input = inputElements['ID_PEMAIN'];
        id_pemain_input.addEventListener('change', async (e) => {
            const selectedId = e.target.value;
            if (selectedId) {
                const resultA2 = await fetchData('readData', 'GET', { sheet: 'FORM-A2' });
                if (resultA2.success) {
                    const selectedPlayer = resultA2.data.find(p => p.ID_PEMAIN === selectedId);
                    if (selectedPlayer) {
                        inputElements['NAMA_PUNGGUNG'].value = selectedPlayer.NAMA_PUNGGUNG || selectedPlayer.NAMA_LENGKAP;
                        inputElements['NO_PUNGGUNG'].value = selectedPlayer.NPG || '';
                    }
                }
            } else {
                inputElements['NAMA_PUNGGUNG'].value = '';
                inputElements['NO_PUNGGUNG'].value = '';
            }
        });
        
        // Panggil event change secara manual jika edit mode (untuk auto-fill)
        if (isEdit && itemToEdit['ID_PEMAIN']) {
             id_pemain_input.dispatchEvent(new Event('change'));
        }
    }


    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.textContent = isEdit ? 'Simpan Perubahan' : 'Buat Baru';
    submitBtn.className = 'action-btn';
    form.appendChild(submitBtn);

    modal.classList.remove('hidden');
}

async function fillPlayerDropdownInModal(selectElement, selectedValue) {
    selectElement.innerHTML = '<option value="">-- Memuat Pemain Klub --</option>';
    selectElement.disabled = true;

    try {
        const result = await fetchData('readData', 'GET', { sheet: 'FORM-A2' });
        
        if (result.success) {
            selectElement.innerHTML = '<option value="">-- Pilih Pemain --</option>';
            result.data.forEach(p => {
                const option = document.createElement('option');
                option.value = p.ID_PEMAIN;
                option.textContent = `${p.NAMA_LENGKAP} (${p.NPG || 'No NPG'})`;
                if (p.ID_PEMAIN === selectedValue) {
                    option.selected = true;
                }
                selectElement.appendChild(option);
            });
            selectElement.disabled = false;
        } else {
            selectElement.innerHTML = '<option value="">Gagal memuat pemain</option>';
        }
    } catch (e) {
        selectElement.innerHTML = '<option value="">Error memuat data A2</option>';
    }
}


function closeModal() {
    document.getElementById('modal').classList.add('hidden');
}

document.getElementById('dynamic-form').addEventListener('submit', handleDynamicFormSubmit);

async function handleDynamicFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const sheetName = form.dataset.sheet;
    const mode = form.dataset.mode;
    const primaryKey = form.dataset.primaryKey;
    const keyValue = form.dataset.keyValue;

    const formData = new FormData(form);
    const data = {};
    for (const [key, value] of formData.entries()) {
        data[key] = value;
    }

    let action, postData;
    if (mode === 'create') {
        action = sheetName === 'FORM-A2' ? 'createPemainA2' : 'createData';
        postData = { sheet: sheetName, data: data };
    } else {
        action = 'updateData';
        // Hanya kirim data yang TIDAK ReadOnly untuk menghindari overwrite nilai otomatis
        const fieldsToUpdate = {};
        const fieldDefinitions = getFormFields(sheetName, globalUserData);
        for(const key in data) {
            if (!fieldDefinitions[key] || !fieldDefinitions[key].readOnly) {
                 fieldsToUpdate[key] = data[key];
            }
        }

        postData = { sheet: sheetName, keyName: primaryKey, keyValue: keyValue, dataToUpdate: fieldsToUpdate };
    }

    const result = await fetchData(action, 'POST', postData);

    if (result.success) {
        alert(result.message);
        closeModal();
        showContent(sheetName.split('-').pop()); 
    } else {
        alert("Gagal: " + result.message);
    }
}

async function deleteDataFromSheet(sheetName, keyName, idValue) {
    if (confirm(`Yakin ingin menghapus data dari ${sheetName} dengan ID: ${idValue}? Tindakan ini tidak dapat dibatalkan.`)) {
        const result = await fetchData('deleteData', 'POST', {
            sheet: sheetName,
            keyName: keyName,
            keyValue: idValue
        });

        if (result.success) {
            alert(result.message);
            showContent(sheetName.split('-').pop()); 
        } else {
            alert("Gagal menghapus: " + result.message);
        }
    }
}


// Inisialisasi
document.addEventListener('DOMContentLoaded', checkAuth);
