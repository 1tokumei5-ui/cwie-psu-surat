// ==========================================
// 💡 SweetAlert2 Helper Functions
// ==========================================

function showSuccessAlert(title, text) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'success',
            title: title,
            text: text,
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#10b981',
            timer: 2200,
            timerProgressBar: true
        });
    } else {
        alert(`${title}\n${text}`);
    }
}

function showErrorAlert(title, text) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'error',
            title: title,
            text: text,
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#ef4444'
        });
    } else {
        alert(`${title}\n${text}`);
    }
}


// ==========================================
// 1. ระบบยืนยันตัวตน (Authentication)
// ==========================================

async function loginAdmin() {
    const emailInput = document.getElementById('admin-email');
    const passwordInput = document.getElementById('admin-password');
    const errorText = document.getElementById('login-error');
    const btnLogin = document.getElementById('btn-login');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value.trim() : '';

    if (!email || !password) {
        if (errorText) {
            errorText.innerText = "❌ กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน";
            errorText.style.display = 'block';
        }
        return;
    }

    if (btnLogin) btnLogin.innerText = "กำลังตรวจสอบ...";

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            console.error("Login Error:", error.message);
            if (errorText) {
                errorText.innerText = "❌ อีเมลหรือรหัสผ่านไม่ถูกต้อง";
                errorText.style.display = 'block';
            }
            if (btnLogin) btnLogin.innerText = "เข้าสู่ระบบ";
        } else {
            const modal = document.getElementById('login-modal');
            const btnLogout = document.getElementById('btn-logout');
            if (modal) modal.style.display = 'none';
            if (btnLogout) btnLogout.style.display = 'inline-block';
            
            loadSystemStats();
            fetchCurrentJobs();
            loadUploadHistory();
        }
    } catch (err) {
        console.error("System Error:", err);
        if (errorText) {
            errorText.innerText = "❌ เกิดข้อผิดพลาดในการเชื่อมต่อ";
            errorText.style.display = 'block';
        }
        if (btnLogin) btnLogin.innerText = "เข้าสู่ระบบ";
    }
}

async function logoutAdmin() {
    if (typeof supabaseClient !== 'undefined' && supabaseClient.auth) {
        await supabaseClient.auth.signOut();
        location.reload();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const passwordInput = document.getElementById('admin-password');
    if (passwordInput) {
        passwordInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') loginAdmin();
        });
    }

    const modal = document.getElementById('login-modal');
    const btnLogout = document.getElementById('btn-logout');

    if (typeof supabaseClient !== 'undefined' && supabaseClient.auth) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (!session) {
            if (modal) modal.style.display = 'flex';
            if (btnLogout) btnLogout.style.display = 'none';
        } else {
            if (modal) modal.style.display = 'none';
            if (btnLogout) btnLogout.style.display = 'inline-block';
            
            loadSystemStats();
            fetchCurrentJobs();
            loadUploadHistory();
        }
    } else {
        if (modal) modal.style.display = 'flex';
    }
});


// ==========================================
// 2. ระบบจัดการประกาศงาน (cwie_jobs)
// ==========================================

let currentJobsCache = [];

async function loadSystemStats() {
    try {
        const { count, error } = await supabaseClient
            .from('cwie_jobs')
            .select('*', { count: 'exact', head: true });

        const totalElement = document.getElementById('stat-total-jobs');
        if (totalElement) {
            totalElement.innerText = (error || count === null) ? '0 รายการ' : `${count.toLocaleString()} รายการ`;
        }
    } catch (e) {
        console.warn("Stats Load Error:", e);
    }
}

async function fetchCurrentJobs() {
    const tbody = document.getElementById('current-jobs-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #8a99ad; padding: 20px;">🔄 กำลังโหลดข้อมูลในระบบ...</td></tr>`;

    try {
        const { data, error } = await supabaseClient
            .from('cwie_jobs')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;

        currentJobsCache = data || [];
        tbody.innerHTML = '';
        if (currentJobsCache.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #8a99ad; padding: 20px;">📭 ไม่มีข้อมูลประกาศงานในระบบในขณะนี้</td></tr>`;
            return;
        }

        currentJobsCache.forEach(job => {
            const tr = document.createElement('tr');
            const isClosed = job.status && (job.status.includes('ปิด') || job.status.includes('หมด'));
            const statusBadge = isClosed
                ? `<span style="background: #fee2e2; color: #dc2626; padding: 3px 8px; border-radius: 12px; font-size: 11.5px; font-weight: 600;">🔴 ปิดรับ</span>`
                : `<span style="background: #dcfce7; color: #15803d; padding: 3px 8px; border-radius: 12px; font-size: 11.5px; font-weight: 600;">🟢 เปิดรับ</span>`;

            tr.innerHTML = `
                <td style="color: #8a99ad; font-size: 12px; font-weight: 500;">#${job.id}</td>
                <td style="font-weight: 600; color: #1e293b;">${job.company_name || '-'}</td>
                <td style="color: #0284c7; font-weight: 500;">${job.position_title || '-'}</td>
                <td style="color: #475569;">${job.location || '-'}</td>
                <td style="color: #059669; font-weight: 600;">${job.salary || 'ไม่ระบุ'}</td>
                <td>${statusBadge}</td>
                <td style="text-align: center; display: flex; gap: 4px; justify-content: center;">
                    <button onclick="openEditJobModal(${job.id})" class="btn-delete-sm" style="background: #e0f2fe; color: #0284c7;" title="แก้ไข">
                        ✏️ แก้ไข
                    </button>
                    <button onclick="deleteSingleJob(${job.id}, '${(job.position_title || '').replace(/'/g, "\\'")}')" class="btn-delete-sm" title="ลบงานนี้">
                        🗑️ ลบ
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Fetch Jobs Error:", err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #ef4444; padding: 20px;">เกิดข้อผิดพลาดในการโหลดข้อมูล: ${err.message}</td></tr>`;
    }
}

function openAddJobModal() {
    document.getElementById('form-job-id').value = '';
    document.getElementById('form-modal-title').innerText = '➕ เพิ่มประกาศงานใหม่';
    document.getElementById('form-company').value = '';
    document.getElementById('form-position').value = '';
    document.getElementById('form-location').value = '';
    document.getElementById('form-work-format').value = 'Onsite';
    document.getElementById('form-salary').value = '';
    document.getElementById('form-quota').value = '';
    document.getElementById('form-status').value = 'เปิดรับสมัครอยู่';
    document.getElementById('form-deadline').value = '';
    document.getElementById('form-contact').value = '';

    const modal = document.getElementById('admin-job-modal');
    if (modal) modal.style.display = 'flex';
}

function openEditJobModal(id) {
    const job = currentJobsCache.find(j => j.id === id);
    if (!job) return;

    document.getElementById('form-job-id').value = job.id;
    document.getElementById('form-modal-title').innerText = `✏️ แก้ไขประกาศงาน (#${job.id})`;
    document.getElementById('form-company').value = job.company_name || '';
    document.getElementById('form-position').value = job.position_title || '';
    document.getElementById('form-location').value = job.location || '';
    document.getElementById('form-work-format').value = job.work_format || 'Onsite';
    document.getElementById('form-salary').value = job.salary || '';
    document.getElementById('form-quota').value = job.quota || '';
    document.getElementById('form-status').value = job.status || 'เปิดรับสมัครอยู่';
    document.getElementById('form-deadline').value = job.deadline || '';
    document.getElementById('form-contact').value = job.contact_info || job.application_channel || '';

    const modal = document.getElementById('admin-job-modal');
    if (modal) modal.style.display = 'flex';
}

function closeAdminJobModal() {
    const modal = document.getElementById('admin-job-modal');
    if (modal) modal.style.display = 'none';
}

async function saveJobManual() {
    const id = document.getElementById('form-job-id').value;
    const company_name = document.getElementById('form-company').value.trim();
    const position_title = document.getElementById('form-position').value.trim();
    const location = document.getElementById('form-location').value.trim();
    const work_format = document.getElementById('form-work-format').value;
    const salary = document.getElementById('form-salary').value.trim();
    const quota = document.getElementById('form-quota').value.trim();
    const status = document.getElementById('form-status').value;
    const deadline = document.getElementById('form-deadline').value.trim();
    const contact_info = document.getElementById('form-contact').value.trim();

    if (!company_name || !position_title) {
        showErrorAlert("ข้อมูลไม่ครบถ้วน", "กรุณากรอกชื่อบริษัท และ ตำแหน่งงาน ครับ");
        return;
    }

    const payload = {
        company_name,
        position_title,
        location: location || '-',
        work_format: work_format || 'Onsite',
        salary: salary || 'ไม่ระบุ',
        quota: quota || 'ไม่ระบุ',
        status,
        deadline: deadline || 'ไม่ระบุ',
        contact_info: contact_info || '-',
        application_channel: contact_info || '-'
    };

    try {
        let error;
        if (id) {
            const res = await supabaseClient.from('cwie_jobs').update(payload).eq('id', id);
            error = res.error;
        } else {
            const res = await supabaseClient.from('cwie_jobs').insert([payload]);
            error = res.error;
        }

        if (error) {
            showErrorAlert("เกิดข้อผิดพลาดในการบันทึก", error.message);
        } else {
            showSuccessAlert("บันทึกสำเร็จ! ", "บันทึกข้อมูลประกาศงานเรียบร้อยแล้ว");
            closeAdminJobModal();
            fetchCurrentJobs();
            loadSystemStats();
        }
    } catch (err) {
        showErrorAlert("เกิดข้อผิดพลาด", err.message);
    }
}

async function deleteSingleJob(id, title) {
    const result = await Swal.fire({
        title: 'ยืนยันการลบงาน?',
        text: `คุณต้องการลบงาน "${title}" (ID: #${id}) ออกจากระบบใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: ' ลบข้อมูล',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8'
    });

    if (!result.isConfirmed) return;

    try {
        const { error } = await supabaseClient.from('cwie_jobs').delete().eq('id', id);

        if (error) {
            showErrorAlert("เกิดข้อผิดพลาดในการลบงาน", error.message);
        } else {
            showSuccessAlert("ลบสำเร็จ!", "ลบรายการประกาศงานเรียบร้อยแล้ว");
            fetchCurrentJobs();
            loadSystemStats();
        }
    } catch (err) {
        showErrorAlert("เกิดข้อผิดพลาด", err.message);
    }
}

async function deleteAllJobs() {
    const result = await Swal.fire({
        title: '🚨 ล้างข้อมูลงานทั้งหมด?',
        text: 'รายการประกาศงานทั้งหมดบน Dashboard จะถูกลบทิ้ง (ประวัติการอัปโหลดจะยังคงอยู่)',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ใช่, ล้างทั้งหมด',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8'
    });

    if (!result.isConfirmed) return;

    try {
        const { error } = await supabaseClient.from('cwie_jobs').delete().neq('id', 0);

        if (error) {
            showErrorAlert("เกิดข้อผิดพลาดในการล้างข้อมูล", error.message);
        } else {
            showSuccessAlert("ล้างข้อมูลเรียบร้อย!", "ข้อมูลประกาศงานทั้งหมดถูกลบออกจากระบบแล้ว");
            fetchCurrentJobs();
            loadSystemStats();
        }
    } catch (err) {
        showErrorAlert("เกิดข้อผิดพลาด", err.message);
    }
}


// ==========================================
// 3. ระบบประวัติการอัปโหลด (cwie_logs)
// ==========================================

async function loadUploadHistory() {
    const tbody = document.getElementById('history-body');
    const lastUpdateEl = document.getElementById('stat-last-update');
    if (!tbody) return;

    try {
        const { data, error } = await supabaseClient
            .from('cwie_logs')
            .select('*')
            .order('id', { ascending: false })
            .limit(10);

        if (error) throw error;

        if (data && data.length > 0) {
            const lastTime = new Date(data[0].uploaded_at);
            if (lastUpdateEl) {
                lastUpdateEl.innerText = lastTime.toLocaleDateString('th-TH') + ' ' + lastTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            }
        } else if (lastUpdateEl) {
            lastUpdateEl.innerText = 'ยังไม่มีการอัปโหลด';
        }

        tbody.innerHTML = '';
        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #8a99ad; padding: 16px;">ยังไม่มีประวัติการอัปโหลดในระบบ</td></tr>`;
            return;
        }

        data.forEach(log => {
            const tr = document.createElement('tr');
            const logDate = new Date(log.uploaded_at);
            const timeStr = logDate.toLocaleDateString('th-TH') + ' ' + logDate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

            tr.innerHTML = `
                <td>${timeStr}</td>
                <td style="font-weight: 600; color: #0284c7;">📄 ${log.filename || 'ไฟล์อัปโหลด'}</td>
                <td><span class="badge-count">${log.record_count} รายการ</span></td>
                <td>${log.uploaded_by || 'Admin'}</td>
                <td><span style="color: #10b981; font-weight: 600;">✅ สำเร็จ (Published)</span></td>
                <td style="text-align: center;">
                    <button onclick="deleteSingleLog(${log.id}, '${(log.filename || 'ไฟล์อัปโหลด').replace(/'/g, "\\'")}')" class="btn-delete-sm" title="ลบประวัตินี้">
                        🗑️ ลบ
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.warn("History Load Error:", err.message);
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #8a99ad; padding: 16px;">ยังไม่มีประวัติ หรือ กรุณาสร้างตาราง cwie_logs บน Supabase</td></tr>`;
    }
}

async function saveUploadLog(filename, recordCount) {
    try {
        const userRes = await supabaseClient.auth.getUser();
        const userEmail = userRes?.data?.user?.email || 'Admin';

        await supabaseClient.from('cwie_logs').insert([{
            filename: filename || 'ไฟล์อัปโหลด.xlsx',
            record_count: recordCount,
            uploaded_by: userEmail
        }]);

        loadUploadHistory();
    } catch (err) {
        console.error("Save Log Error:", err);
    }
}

async function deleteSingleLog(id, filename) {
    const result = await Swal.fire({
        title: 'ยืนยันการลบประวัติ?',
        text: `คุณต้องการลบประวัติการอัปโหลด "${filename}" (ID: #${id}) ใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: ' ลบประวัติ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8'
    });

    if (!result.isConfirmed) return;

    try {
        const { error } = await supabaseClient.from('cwie_logs').delete().eq('id', id);

        if (error) {
            showErrorAlert("เกิดข้อผิดพลาดในการลบประวัติ", error.message);
        } else {
            showSuccessAlert("ลบสำเร็จ!", "ลบประวัติการอัปโหลดเรียบร้อยแล้ว");
            loadUploadHistory();
        }
    } catch (err) {
        showErrorAlert("เกิดข้อผิดพลาด", err.message);
    }
}

async function clearUploadHistory() {
    const result = await Swal.fire({
        title: ' ล้างประวัติการอัปโหลดทั้งหมด?',
        text: 'ประวัติการอัปโหลดย้อนหลังจะถูกลบทิ้ง (ประกาศงานบน Dashboard จะยังคงอยู่)',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ใช่, ล้างประวัติทั้งหมด',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#f59e0b',
        cancelButtonColor: '#94a3b8'
    });

    if (!result.isConfirmed) return;

    try {
        const { error } = await supabaseClient.from('cwie_logs').delete().neq('id', 0);

        if (error) {
            showErrorAlert("เกิดข้อผิดพลาดในการล้างประวัติ", error.message);
        } else {
            showSuccessAlert("ล้างประวัติเรียบร้อย!", "ประวัติการอัปโหลดทั้งหมดถูกลบออกจากระบบแล้ว");
            loadUploadHistory();
        }
    } catch (err) {
        showErrorAlert("เกิดข้อผิดพลาด", err.message);
    }
}


// ==========================================
// 4. ระบบอ่านไฟล์ Excel & Status Detect
// ==========================================

let parsedExcelData = [];
let uploadedFileName = '';

function getRowValue(row, keywords, fallback = '-') {
    if (!row) return fallback;
    const keys = Object.keys(row);
    
    for (let keyword of keywords) {
        if (row[keyword] !== undefined && row[keyword] !== null && String(row[keyword]).trim() !== '') {
            return String(row[keyword]).trim();
        }
        
        const matchedKey = keys.find(k => String(k).toLowerCase().includes(keyword.toLowerCase()));
        if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null && String(row[matchedKey]).trim() !== '') {
            return String(row[matchedKey]).trim();
        }
    }
    return fallback;
}

function parseStatus(rawValue) {
    if (!rawValue || rawValue === '-' || rawValue === 'ไม่ระบุ') return 'เปิดรับสมัครอยู่';
    const str = String(rawValue).trim().toLowerCase();
    
    if (str.includes('ปิด') || str.includes('หมด') || str.includes('เต็ม') || str.includes('close') || str.includes('expire')) {
        return 'ปิดรับสมัครแล้ว';
    }
    if (str.includes('เปิด') || str.includes('open') || str.includes('active') || str.includes('รับ')) {
        return 'เปิดรับสมัครอยู่';
    }
    
    return rawValue;
}

function handleFileUpload() {
    const fileInput = document.getElementById('excel-file');
    const file = fileInput ? fileInput.files[0] : null;

    if (!file) {
        showErrorAlert("กรุณาเลือกไฟล์", "กรุณาเลือกไฟล์ Excel (.xlsx, .csv) ");
        return;
    }

    uploadedFileName = file.name;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) {
                showErrorAlert("ไฟล์ว่างเปล่า", "ไม่พบข้อมูลในไฟล์ Excel ");
                return;
            }

           parsedExcelData = jsonData.map(row => {
    const rawStatus = getRowValue(row, ['สถานะ', 'status', 'การรับสมัคร', 'การเปิดรับ', 'รับสมัคร'], 'เปิดรับสมัครอยู่');
    const cleanStatus = parseStatus(rawStatus);

    return {
        company_name: getRowValue(row, ['บริษัท', 'หน่วยงาน', 'สถานประกอบการ', 'company_name', 'company']),
        position_title: getRowValue(row, ['ตำแหน่ง', 'ทุน', 'หัวข้อ', 'โครงการ', 'position_title', 'position']),
        // 💵 เพิ่มคีย์เวิร์ดให้ครอบคลุมทุกรูปแบบชื่อคอลัมน์เงินเดือน/สวัสดิการ
        salary: getRowValue(row, [
            'เงินเดือน', 'ค่าตอบแทน', 'เบี้ยเลี้ยง', 'สวัสดิการ', 'ทุน', 
            'ค่าจ้าง', 'ค่าตอบแทน/วัน', 'ค่าตอบแทน/เดือน', 'รายได้',
            'salary', 'stipend', 'allowance', 'compensation'
        ], 'ไม่ระบุ'),
        quota: getRowValue(row, ['จำนวน', 'อัตรา', 'โควต้า', 'quota'], 'ไม่ระบุ'),
        location: getRowValue(row, ['สถานที่', 'จังหวัด', 'โซน', 'location']),
        work_format: getRowValue(row, ['รูปแบบ', 'work_format'], 'Onsite'),
        deadline: getRowValue(row, ['กำหนดการ', 'วันปิด', 'deadline'], 'ไม่ระบุ'),
        status: cleanStatus,
        application_channel: getRowValue(row, ['ช่องทาง', 'ลิงก์', 'สมัคร', 'application_channel']),
        contact_info: getRowValue(row, ['ติดต่อ', 'เบอร์', 'อีเมล', 'contact_info', 'contact'])
    };
});
            const badge = document.getElementById('preview-count-badge');
            if (badge) badge.innerText = ` พบ ${parsedExcelData.length} รายการ`;

            renderPreviewTable(parsedExcelData);
            
            const previewSection = document.getElementById('preview-section');
            if (previewSection) previewSection.style.display = 'block';

        } catch (err) {
            console.error("Excel Read Error:", err);
            showErrorAlert("อ่านไฟล์ล้มเหลว", "เกิดข้อผิดพลาดในการอ่านไฟล์ Excel: " + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

function renderPreviewTable(data) {
    const tbody = document.getElementById('preview-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    data.forEach(row => {
        const tr = document.createElement('tr');
        const isClosed = row.status && (row.status.includes('ปิด') || row.status.includes('หมด'));
        
        const statusBadge = isClosed
            ? `<span style="background: #fee2e2; color: #dc2626; padding: 4px 10px; border-radius: 20px; font-weight: 600; font-size: 12px; display: inline-block;">🔴 ปิดรับสมัคร</span>`
            : `<span style="background: #dcfce7; color: #15803d; padding: 4px 10px; border-radius: 20px; font-weight: 600; font-size: 12px; display: inline-block;">🟢 เปิดรับสมัคร</span>`;

        tr.innerHTML = `
            <td style="font-weight: 600; color: #1e293b;">${row.company_name}</td>
            <td style="color: #0284c7; font-weight: 500;">${row.position_title}</td>
            <td style="color: #475569;">${row.location}</td>
            <td style="color: #059669; font-weight: 600;">${row.salary}</td>
            <td style="color: #64748b; font-size: 12px;">${row.contact_info}</td>
            <td>${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function syncToDatabase() {
    if (parsedExcelData.length === 0) {
        showErrorAlert("ไม่พบข้อมูล", "ไม่มีข้อมูลที่จะบันทึกครับ");
        return;
    }

    const btn = document.getElementById('btn-sync');
    if (btn) {
        btn.innerText = "กำลังบันทึก...";
        btn.disabled = true;
    }

    try {
        await supabaseClient.from('cwie_jobs').delete().neq('id', 0);

        const { error: insertError } = await supabaseClient.from('cwie_jobs').insert(parsedExcelData);

        if (insertError) {
            showErrorAlert("เกิดข้อผิดพลาดในการบันทึก", insertError.message);
        } else {
            showSuccessAlert(
                "บันทึกข้อมูลสำเร็จ! ", 
                `นำเข้าข้อมูลประกาศงาน CWIE จำนวน ${parsedExcelData.length} รายการ เรียบร้อยแล้ว`
            );
            
            await saveUploadLog(uploadedFileName, parsedExcelData.length);

            const previewSection = document.getElementById('preview-section');
            if (previewSection) previewSection.style.display = 'none';
            
            const fileInput = document.getElementById('excel-file');
            if (fileInput) fileInput.value = "";
            
            parsedExcelData = [];

            fetchCurrentJobs();
            loadSystemStats();
        }
    } catch (err) {
        showErrorAlert("เกิดข้อผิดพลาด", err.message);
    } finally {
        if (btn) {
            btn.innerText = " บันทึกเข้าระบบ (Sync & Publish)";
            btn.disabled = false;
        }
    }
}