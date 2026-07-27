let globalJobsList = [];

document.addEventListener('DOMContentLoaded', () => {
    checkAuthSession();
});

// 🔒 helper: กัน XSS — แปลงข้อความให้ปลอดภัยก่อนแทรกลงใน innerHTML
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function checkAuthSession() {
    const loginModal = document.getElementById('login-modal');
    const panel = document.getElementById('admin-panel-container');
    const btnLogout = document.getElementById('btn-logout');

    if (typeof supabaseClient === 'undefined') {
        // ไม่มีการเชื่อมต่อ Supabase เลย — ปลอดภัยไว้ก่อน ไม่แสดงพาเนล
        if (loginModal) loginModal.style.display = 'flex';
        if (panel) panel.style.display = 'none';
        return;
    }

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (session) {
            // ✅ ล็อกอินแล้ว: ซ่อน modal, แสดงพาเนล, โหลดข้อมูล
            if (loginModal) loginModal.style.display = 'none';
            if (panel) panel.style.display = 'block';
            if (btnLogout) btnLogout.style.display = 'inline-flex';

            fetchCurrentJobs();
            loadUploadHistory();
        } else {
            // 🔐 ยังไม่ล็อกอิน: บังคับแสดง modal และซ่อนพาเนลทั้งหมด
            if (loginModal) loginModal.style.display = 'flex';
            if (panel) panel.style.display = 'none';
            if (btnLogout) btnLogout.style.display = 'none';
        }
    } catch (err) {
        console.warn("Auth Check Warning:", err);
        // เกิดข้อผิดพลาดในการตรวจสอบ session — ปลอดภัยไว้ก่อน บังคับให้ล็อกอินใหม่
        if (loginModal) loginModal.style.display = 'flex';
        if (panel) panel.style.display = 'none';
    }
}

async function loginAdmin() {
    if (typeof supabaseClient === 'undefined') return;
    const email = document.getElementById('admin-email')?.value.trim();
    const password = document.getElementById('admin-password')?.value.trim();
    const errorEl = document.getElementById('login-error');

    if (!email || !password) {
        if (errorEl) {
            errorEl.innerText = '❌ กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน';
            errorEl.style.display = 'block';
        }
        return;
    }

    try {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;

        Swal.fire({
            icon: 'success',
            title: 'เข้าสู่ระบบสำเร็จ!',
            timer: 1200,
            showConfirmButton: false
        });
        setTimeout(() => { location.reload(); }, 1200);
    } catch (err) {
        if (errorEl) {
            errorEl.innerText = `❌ ${err.message}`;
            errorEl.style.display = 'block';
        }
    }
}

async function logoutAdmin() {
    if (typeof supabaseClient !== 'undefined') {
        await supabaseClient.auth.signOut();
    }
    location.reload();
}

async function fetchCurrentJobs() {
    const tbody = document.getElementById('current-jobs-body');
    const totalCountEl = document.getElementById('stat-total-jobs');
    const lastUpdateEl = document.getElementById('stat-last-update');

    if (!tbody) return;

    try {
        if (typeof supabaseClient === 'undefined') {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center p-6 text-amber-600">⚠️ ยังไม่ได้เชื่อมต่อ Supabase</td></tr>`;
            return;
        }

        const { data, error } = await supabaseClient
            .from('cwie_jobs')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;
        globalJobsList = data || [];

        if (totalCountEl) totalCountEl.innerText = `${globalJobsList.length} รายการ`;
        if (globalJobsList.length > 0 && lastUpdateEl) {
            lastUpdateEl.innerText = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }

        if (globalJobsList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center p-6 text-slate-400">📭 ไม่พบข้อมูลในระบบ</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        globalJobsList.forEach(job => {
            const isClosed = job.status === 'ปิดรับสมัครแล้ว' || job.status === 'ปิดรับสมัคร' || job.status === 'ปิด';
            const statusBadge = isClosed
                ? `<span style="background: #fee2e2; color: #dc2626; padding: 3px 8px; border-radius: 12px; font-weight: 600; white-space: nowrap;">🔴 ปิดรับสมัคร</span>`
                : `<span style="background: #dcfce7; color: #15803d; padding: 3px 8px; border-radius: 12px; font-weight: 600; white-space: nowrap;">🟢 เปิดรับสมัคร</span>`;

            const tr = document.createElement('tr');
            // 🔒 ใช้ escapeHtml กับข้อมูลทุกช่องที่มาจากผู้ใช้/ไฟล์ที่อัปโหลด
            tr.innerHTML = `
                <td style="font-weight: 600;">${escapeHtml(job.id)}</td>
                <td><b>${escapeHtml(job.company_name) || '-'}</b></td>
                <td style="color: #003566; font-weight: 500;">${escapeHtml(job.position_title) || '-'}</td>
                <td>${escapeHtml(job.location) || '-'}</td>
                <td style="color: #059669; font-weight: 600;">${escapeHtml(job.salary) || 'ไม่ระบุ'}</td>
                <td>${statusBadge}</td>
                <td style="text-align: center; white-space: nowrap;">
                    <button onclick="openEditJobModalById('${escapeHtml(job.id)}')" class="px-2 py-1 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 font-medium text-xs">✏️ แก้ไข</button>
                    <button onclick="deleteJob('${escapeHtml(job.id)}')" class="px-2 py-1 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 font-medium text-xs">🗑️ ลบ</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center p-6 text-rose-500">เกิดข้อผิดพลาด: ${escapeHtml(err.message)}</td></tr>`;
    }
}

function openAddJobModal() {
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    
    setVal('form-job-id', '');
    const titleEl = document.getElementById('form-modal-title');
    if (titleEl) titleEl.innerText = '➕ เพิ่มประกาศงานใหม่';
    
    setVal('form-company', '');
    setVal('form-position', '');
    setVal('form-location', '');
    setVal('form-work-format', 'Onsite');
    setVal('form-salary', '');
    setVal('form-quota', '');
    setVal('form-job-type', 'สหกิจศึกษา');
    setVal('form-status', 'เปิดรับสมัครอยู่');
    setVal('form-contact', '');

    const modal = document.getElementById('admin-job-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function openEditJobModalById(id) {
    // เทียบแบบ string เพื่อรองรับทั้ง id ที่เป็นตัวเลข (int/bigint) และ UUID
    const job = globalJobsList.find(j => String(j.id) === String(id));
    if (!job) {
        console.warn('ไม่พบรายการงานที่มี id:', id);
        return;
    }

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

    setVal('form-job-id', job.id);
    const titleEl = document.getElementById('form-modal-title');
    if (titleEl) titleEl.innerText = '✏️ แก้ไขประกาศงาน';

    setVal('form-company', job.company_name || '');
    setVal('form-position', job.position_title || '');
    setVal('form-location', job.location || '');
    setVal('form-work-format', job.work_format || 'Onsite');
    setVal('form-salary', job.salary || '');
    setVal('form-quota', job.quota || '');
    setVal('form-job-type', job.job_type || 'สหกิจศึกษา');
    setVal('form-status', job.status || 'เปิดรับสมัครอยู่');
    setVal('form-contact', job.application_channel || job.contact_info || '');

    const modal = document.getElementById('admin-job-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeAdminJobModal() {
    const modal = document.getElementById('admin-job-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 🔧 ดึงอีเมลของแอดมินที่ล็อกอินอยู่ (ใช้ร่วมกันทั้งตอนอัปโหลด Excel และเพิ่ม/แก้ไขงานด้วยมือ)
async function getCurrentUserEmail() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session && session.user && session.user.email) {
            return session.user.email;
        }
    } catch (e) {
        console.warn("User Session Error:", e);
    }
    return 'Admin';
}

// 🔧 บันทึกรายการลงประวัติ (ใช้ร่วมกันทั้งอัปโหลด Excel และเพิ่ม/แก้ไขงานด้วยมือ)
async function logHistoryEntry(filename, recordCount) {
    try {
        const currentUserEmail = await getCurrentUserEmail();
        const { error } = await supabaseClient.from('cwie_logs').insert([{
            filename,
            record_count: recordCount,
            uploaded_by: currentUserEmail,
            uploaded_at: new Date().toISOString()
        }]);
        if (error) {
            console.warn("Log Record Warning:", error.message);
            return false;
        }
        return true;
    } catch (e) {
        console.warn("Log Record Warning:", e.message);
        return false;
    }
}

async function saveJobManual() {
    const getVal = (id) => document.getElementById(id)?.value?.trim() || '';

    const jobId = getVal('form-job-id');
    const company = getVal('form-company');
    const position = getVal('form-position');

    if (!company || !position) {
        Swal.fire('แจ้งเตือน', 'กรุณากรอกชื่อบริษัทและตำแหน่งงานให้ครบถ้วน', 'warning');
        return;
    }

    const payload = {
        company_name: company,
        position_title: position,
        location: getVal('form-location') || '-',
        work_format: getVal('form-work-format') || 'Onsite',
        salary: getVal('form-salary') || 'ไม่ระบุ',
        quota: getVal('form-quota') || 'ไม่ระบุ',
        job_type: getVal('form-job-type') || 'สหกิจศึกษา',
        status: getVal('form-status') || 'เปิดรับสมัครอยู่',
        application_channel: getVal('form-contact'),
        contact_info: getVal('form-contact')
    };

    try {
        let error;
        const isEdit = !!jobId;
        if (isEdit) {
            const res = await supabaseClient.from('cwie_jobs').update(payload).eq('id', jobId);
            error = res.error;
        } else {
            const res = await supabaseClient.from('cwie_jobs').insert([payload]);
            error = res.error;
        }

        if (error) throw error;

        // 🔧 บันทึกลงประวัติด้วย เพื่อให้เห็นการเพิ่ม/แก้ไขด้วยมือในตารางประวัติเดียวกัน
        const logLabel = isEdit
            ? `✏️ แก้ไขงานด้วยตนเอง: ${company} - ${position}`
            : `➕ เพิ่มงานด้วยตนเอง: ${company} - ${position}`;
        const logOk = await logHistoryEntry(logLabel, 1);

        closeAdminJobModal();
        if (logOk) {
            Swal.fire({
                icon: 'success',
                title: 'บันทึกข้อมูลสำเร็จ!',
                timer: 1500,
                showConfirmButton: false
            });
        } else {
            Swal.fire({
                icon: 'warning',
                title: 'บันทึกข้อมูลงานสำเร็จ แต่บันทึกประวัติล้มเหลว',
                text: 'ข้อมูลงานถูกบันทึกเรียบร้อยแล้ว แต่ไม่สามารถบันทึกลงประวัติได้',
            });
        }
        fetchCurrentJobs();
        loadUploadHistory();
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

async function deleteJob(id) {
    const result = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: 'ต้องการลบประกาศงานนี้ออกจากระบบใช่หรือไม่',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ลบ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#e11d48'
    });

    if (result.isConfirmed) {
        try {
            const { error } = await supabaseClient.from('cwie_jobs').delete().eq('id', id);
            if (error) throw error;
            Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1000, showConfirmButton: false });
            fetchCurrentJobs();
        } catch (err) {
            Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
        }
    }
}

async function deleteAllJobs() {
    // 🔒 action ทำลายล้าง — ต้องพิมพ์ยืนยันคำว่า "ลบทั้งหมด" ก่อน ป้องกันกดพลาด
    const result = await Swal.fire({
        title: '⚠️ ล้างข้อมูลทั้งหมด?',
        html: 'ข้อมูลประกาศงานทั้งหมดจะถูกลบออกจากระบบอย่างถาวร!<br>พิมพ์ <b>ลบทั้งหมด</b> เพื่อยืนยัน',
        icon: 'warning',
        input: 'text',
        inputPlaceholder: 'พิมพ์ "ลบทั้งหมด" ที่นี่',
        showCancelButton: true,
        confirmButtonText: 'ล้างทั้งหมด',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#dc2626',
        preConfirm: (value) => {
            if (value !== 'ลบทั้งหมด') {
                Swal.showValidationMessage('กรุณาพิมพ์ข้อความให้ตรงกับที่กำหนดเพื่อยืนยัน');
                return false;
            }
            return true;
        }
    });

    if (result.isConfirmed) {
        try {
            const { error } = await supabaseClient.from('cwie_jobs').delete().neq('id', 0);
            if (error) throw error;
            Swal.fire({ icon: 'success', title: 'ล้างข้อมูลสำเร็จ', timer: 1200, showConfirmButton: false });
            fetchCurrentJobs();
        } catch (err) {
            Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
        }
    }
}

let parsedExcelData = [];
let uploadedFileName = '';

// 🔧 ตำแหน่งคอลัมน์ในไฟล์ Excel (นับจาก 0 = คอลัมน์ A, 1 = คอลัมน์ B, 2 = คอลัมน์ C, ...)
// แถวแรกของไฟล์ต้องเป็นหัวตาราง (header) แล้วข้อมูลเริ่มจากแถวที่ 2 เป็นต้นไป
// โครงสร้างนี้ตรงกับไฟล์เทมเพลต Cwie-2026.xlsx:
// A=ลำดับ(ไม่ใช้), B=บริษัท, C=ตำแหน่ง, D=จำนวนที่รับ, E=คุณสมบัติ(ไม่ใช้), F=ลักษณะงาน(ไม่ใช้),
// G=สถานที่, H=รูปแบบงาน, I=ค่าตอบแทน, J=ระยะเวลา(ไม่ใช้), K=วันปิดรับสมัคร, L=สถานะประกาศ,
// M=ช่องทางสมัคร, N=ผู้ติดต่อ, O=แหล่งที่มา(ไม่ใช้), P=วันที่ดึงข้อมูล(ไม่ใช้), Q=ข้อสังเกต(ไม่ใช้)
// ถ้าเทมเพลตไฟล์เปลี่ยน แก้เลขคอลัมน์ตรงนี้ที่เดียวพอ
const EXCEL_COLUMNS = {
    company_name: 1,          // คอลัมน์ B — ชื่อบริษัท/หน่วยงาน
    position_title: 2,        // คอลัมน์ C — ตำแหน่งงาน/ทุนที่รับสมัคร
    quota: 3,                  // คอลัมน์ D — จำนวนที่รับ (อัตรา)
    location: 6,               // คอลัมน์ G — สถานที่ปฏิบัติงาน
    work_format: 7,            // คอลัมน์ H — รูปแบบงาน
    salary: 8,                 // คอลัมน์ I — ค่าตอบแทน/สวัสดิการ
    deadline: 10,               // คอลัมน์ K — วันปิดรับสมัคร
    status: 11,                 // คอลัมน์ L — สถานะประกาศ
    application_channel: 12,   // คอลัมน์ M — ช่องทางการสมัคร
    contact_info: 13           // คอลัมน์ N — ผู้ติดต่อ/เบอร์โทร/อีเมล
};

// ค่าที่พบได้บ่อยในไฟล์ที่หมายถึง "ปิดรับสมัครแล้ว" — ใช้จับคู่แบบไม่สนตัวพิมพ์เล็ก/ใหญ่
const CLOSED_STATUS_VALUES = ['ปิดรับสมัครแล้ว', 'ปิดรับสมัคร', 'ปิด', 'closed', 'close'];

function normalizeStatusValue(raw) {
    const val = String(raw || '').trim();
    if (!val) return 'เปิดรับสมัครอยู่';
    const normalized = val.toLowerCase();
    // 🔧 ต้องเช็คคำว่า "เปิด" (คำเต็ม) ก่อนเสมอ เพราะคำว่า "ปิด" เป็นส่วนหนึ่งของคำว่า
    // "เปิด" อยู่แล้ว (เ + ปิด) ถ้าเช็คแค่ "ปิด" อย่างเดียวจะจับ "เปิดรับสมัครอยู่" ผิดว่าปิดไปด้วย
    if (normalized.includes('เปิด') || normalized.includes('open')) {
        return 'เปิดรับสมัครอยู่';
    }
    const isClosed = CLOSED_STATUS_VALUES.some(c => normalized.includes(c.toLowerCase()));
    return isClosed ? 'ปิดรับสมัครแล้ว' : 'เปิดรับสมัครอยู่';
}

async function handleFileUpload() {
    const fileInput = document.getElementById('excel-file');
    if (!fileInput.files || fileInput.files.length === 0) {
        Swal.fire('แจ้งเตือน', 'กรุณาเลือกไฟล์ Excel (.xlsx หรือ .csv) ก่อน', 'warning');
        return;
    }
    const file = fileInput.files[0];
    uploadedFileName = file.name;
    const reader = new FileReader();

    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (json.length < 2) {
                Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลในไฟล์ Excel หรือไฟล์ว่างเปล่า', 'warning');
                return;
            }

            // 🔧 อ่านข้อมูลตามตำแหน่งคอลัมน์ตายตัวที่กำหนดไว้ใน EXCEL_COLUMNS ด้านบน
            const getCell = (row, idx, fallback) => {
                if (idx === undefined) return fallback;
                const val = row[idx];
                return (val === undefined || val === null || val === '') ? fallback : String(val);
            };

            parsedExcelData = [];
            for (let i = 1; i < json.length; i++) {
                const row = json[i];
                if (!row || row.length === 0) continue;

                const company = getCell(row, EXCEL_COLUMNS.company_name, '-');
                const position = getCell(row, EXCEL_COLUMNS.position_title, '-');
                if (company === '-' && position === '-') continue;

                parsedExcelData.push({
                    company_name: company,
                    position_title: position,
                    quota: getCell(row, EXCEL_COLUMNS.quota, 'ไม่ระบุ'),
                    location: getCell(row, EXCEL_COLUMNS.location, 'ไม่ระบุ'),
                    work_format: getCell(row, EXCEL_COLUMNS.work_format, 'Onsite'),
                    salary: getCell(row, EXCEL_COLUMNS.salary, 'ตามตกลง'),
                    deadline: getCell(row, EXCEL_COLUMNS.deadline, 'ไม่ระบุ'),
                    status: normalizeStatusValue(getCell(row, EXCEL_COLUMNS.status, '')),
                    application_channel: getCell(row, EXCEL_COLUMNS.application_channel, '-'),
                    contact_info: getCell(row, EXCEL_COLUMNS.contact_info, '-'),
                    job_type: 'สหกิจศึกษา'
                });
            }

            if (parsedExcelData.length === 0) {
                Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลที่นำเข้าได้ในไฟล์นี้ กรุณาตรวจสอบว่าคอลัมน์บริษัท (B) และตำแหน่ง (C) มีข้อมูลอยู่', 'warning');
                return;
            }

            renderPreviewTable(parsedExcelData);
        } catch (err) {
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถอ่านไฟล์ Excel ได้: ' + err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

function renderPreviewTable(data) {
    const section = document.getElementById('preview-section');
    const tbody = document.getElementById('preview-body');
    const badge = document.getElementById('preview-count-badge');
    if (!section || !tbody) return;

    section.style.display = 'block';
    badge.innerText = `${data.length} รายการ`;
    tbody.innerHTML = '';

    data.forEach(item => {
        const isClosed = item.status === 'ปิดรับสมัครแล้ว';
        const statusBadge = isClosed
            ? `<span style="background: #fee2e2; color: #dc2626; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">🔴 ปิดรับสมัคร</span>`
            : `<span style="background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">🟢 เปิดรับสมัคร</span>`;

        const tr = document.createElement('tr');
        // 🔒 escape ข้อมูลจากไฟล์ที่อัปโหลดก่อนแสดงในตารางพรีวิว
        tr.innerHTML = `
            <td><b>${escapeHtml(item.company_name)}</b></td>
            <td><span style="color: #003566; font-weight: 500;">${escapeHtml(item.position_title)}</span></td>
            <td>${escapeHtml(item.location)}</td>
            <td style="color: #059669; font-weight: 600;">${escapeHtml(item.salary)}</td>
            <td style="font-size: 11px; color: #64748b;">${escapeHtml(item.application_channel)}</td>
            <td>${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });
}

// 🎯 ปรับปรุงการบันทึกประวัติการอัปโหลดให้ซิงก์อีเมลและแสดงผลทันที
async function syncToDatabase() {
    if (parsedExcelData.length === 0) {
        Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลสำหรับซิงก์', 'warning');
        return;
    }

    try {
        // 1. บันทึกข้อมูลประกาศงานลง cwie_jobs
        const { error: jobErr } = await supabaseClient.from('cwie_jobs').insert(parsedExcelData);
        if (jobErr) throw jobErr;

        // 2. บันทึกประวัติลง cwie_logs (ใช้ helper ร่วมกับ manual add/edit)
        const logOk = await logHistoryEntry(uploadedFileName || 'Excel_Import.xlsx', parsedExcelData.length);

        if (!logOk) {
            // 🔧 แจ้งผู้ใช้ตรงๆ แทนการซ่อน error ไว้ใน console — งานถูกบันทึกแล้ว
            // แต่ประวัติการอัปโหลดบันทึกไม่สำเร็จ ผู้ใช้จะได้รู้และไปตรวจสอบ
            // ตาราง cwie_logs / RLS policy ได้ทันที
            Swal.fire({
                icon: 'warning',
                title: 'บันทึกข้อมูลงานสำเร็จ แต่บันทึกประวัติล้มเหลว',
                text: `นำเข้าประกาศงาน ${parsedExcelData.length} รายการสำเร็จ แต่ไม่สามารถบันทึกลงประวัติการอัปโหลดได้`,
            });
        } else {
            Swal.fire({
                icon: 'success',
                title: 'บันทึกข้อมูลเข้าระบบสำเร็จ!',
                text: `นำเข้าประกาศงานจำนวน ${parsedExcelData.length} รายการเรียบร้อยแล้ว`,
                timer: 2000,
                showConfirmButton: false
            });
        }

        // 3. เคลียร์พรีวิวและโหลดตารางใหม่ทันที
        document.getElementById('preview-section').style.display = 'none';
        parsedExcelData = [];
        const fileInput = document.getElementById('excel-file');
        if (fileInput) fileInput.value = '';

        await fetchCurrentJobs();
        await loadUploadHistory();

    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

// 🎯 โหลดตารางประวัติการอัปโหลด
async function loadUploadHistory() {
    const historyBody = document.getElementById('history-body');
    if (!historyBody) return;

    try {
        if (typeof supabaseClient === 'undefined') return;

        const { data, error } = await supabaseClient
            .from('cwie_logs')
            .select('*')
            .order('id', { ascending: false });

        if (error) throw error;
        const logs = data || [];

        if (logs.length === 0) {
            historyBody.innerHTML = `<tr><td colspan="6" class="text-center p-4 text-slate-400">📭 ยังไม่มีประวัติการอัปโหลด</td></tr>`;
            return;
        }

        historyBody.innerHTML = '';
        logs.forEach(log => {
            const dateObj = log.uploaded_at ? new Date(log.uploaded_at) : new Date();
            const dateStr = dateObj.toLocaleString('th-TH', {
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            const tr = document.createElement('tr');
            // 🔒 escape ชื่อไฟล์และผู้ดำเนินการก่อนแสดงผล
            tr.innerHTML = `
                <td>${escapeHtml(dateStr)}</td>
                <td><b>${escapeHtml(log.filename) || 'Excel Import'}</b></td>
                <td><span style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 12px; font-weight: 600;">${escapeHtml(log.record_count) || 0} รายการ</span></td>
                <td>${escapeHtml(log.uploaded_by) || 'Admin'}</td>
                <td><span style="background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 12px; font-weight: 600;">สำเร็จ</span></td>
                <td style="text-align: center;">
                    <button onclick="deleteLog(${Number(log.id)})" class="text-rose-500 hover:text-rose-700 font-bold transition-colors px-2 py-1">🗑️</button>
                </td>
            `;
            historyBody.appendChild(tr);
        });
    } catch (err) {
        console.error("Load History Error:", err);
        historyBody.innerHTML = `<tr><td colspan="6" class="text-center p-4 text-rose-500">ไม่สามารถโหลดประวัติได้: ${escapeHtml(err.message)}</td></tr>`;
    }
}

async function deleteLog(id) {
    try {
        await supabaseClient.from('cwie_logs').delete().eq('id', id);
        loadUploadHistory();
    } catch (err) { console.warn(err); }
}

async function clearUploadHistory() {
    const result = await Swal.fire({
        title: 'ยืนยันการล้างประวัติ?',
        text: 'ประวัติการอัปโหลดทั้งหมดจะถูกลบออก',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ล้างประวัติ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#f59e0b'
    });

    if (result.isConfirmed) {
        try {
            await supabaseClient.from('cwie_logs').delete().neq('id', 0);
            loadUploadHistory();
            Swal.fire({ icon: 'success', title: 'ล้างประวัติสำเร็จ', timer: 1000, showConfirmButton: false });
        } catch (err) { console.warn(err); }
    }
}
