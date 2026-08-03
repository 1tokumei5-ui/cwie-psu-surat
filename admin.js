/* ============================================================
   CWIE PSU Surat Thani — Admin panel logic (admin.js)
   ต้องโหลดหลัง shared-utils.js เสมอ (ใช้ escapeHtml, isJobClosed,
   statusPillHtml, getCompanyAvatar, loadingRowHtml, emptyRowHtml,
   skeletonRowsHtml, debounce, renderPagination จากไฟล์นั้น)
   ============================================================ */

let globalJobsList = [];
let currentJobsFiltered = [];
let currentJobsPage = 1;
const CURRENT_JOBS_PAGE_SIZE = 8;

// ไอคอน SVG เส้นบาง ใช้แทนอิโมจิ ✏️🗑️⬇ ในปุ่มของตาราง
const ROW_ICONS = {
    edit: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    trash: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
    download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
    search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>'
};

document.addEventListener('DOMContentLoaded', () => {
    checkAuthSession();
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAdminJobModal();
    });
});

async function checkAuthSession() {
    const loginModal = document.getElementById('login-modal');
    const panel = document.getElementById('admin-panel-container');
    const btnLogout = document.getElementById('btn-logout');

    if (typeof supabaseClient === 'undefined') {
        if (loginModal) loginModal.style.display = 'flex';
        if (panel) panel.style.display = 'none';
        return;
    }

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (session) {
            if (loginModal) loginModal.style.display = 'none';
            if (panel) panel.style.display = 'block';
            if (btnLogout) btnLogout.style.display = 'inline-flex';

            fetchCurrentJobs();
            loadUploadHistory();
        } else {
            if (loginModal) loginModal.style.display = 'flex';
            if (panel) panel.style.display = 'none';
            if (btnLogout) btnLogout.style.display = 'none';
        }
    } catch (err) {
        console.warn("Auth Check Warning:", err);
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
            errorEl.innerText = 'กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน';
            errorEl.style.display = 'block';
        }
        return;
    }

    try {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;

        Swal.fire({ icon: 'success', title: 'เข้าสู่ระบบสำเร็จ!', timer: 1200, showConfirmButton: false });
        setTimeout(() => { location.reload(); }, 1200);
    } catch (err) {
        if (errorEl) {
            errorEl.innerText = err.message;
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

/* ============================================================
   ตาราง "ข้อมูลประกาศงานในระบบปัจจุบัน" — ดึงข้อมูล + ค้นหา + แบ่งหน้า + ส่งออก
   (เดิมตารางนี้ไม่มีทั้งช่องค้นหาและการแบ่งหน้าเลย โหลดมาแสดงทั้งหมดทีเดียว
   พอข้อมูลเยอะขึ้นจะเลื่อนหาแถวที่ต้องการยากและหน้าเว็บหนักขึ้นเรื่อยๆ)
   ============================================================ */
async function fetchCurrentJobs() {
    const tbody = document.getElementById('current-jobs-body');
    const totalCountEl = document.getElementById('stat-total-jobs');
    const lastUpdateEl = document.getElementById('stat-last-update');
    if (!tbody) return;

    tbody.innerHTML = skeletonRowsHtml(7, 4);

    try {
        if (typeof supabaseClient === 'undefined') {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center p-6 text-amber-600">ยังไม่ได้เชื่อมต่อ Supabase</td></tr>`;
            return;
        }

        const { data, error } = await supabaseClient
            .from('cwie_jobs')
            .select('*')
            .order('id', { ascending: false });

        if (error) throw error;

        globalJobsList = data || [];
        currentJobsFiltered = [...globalJobsList];
        currentJobsPage = 1;

        if (totalCountEl) totalCountEl.innerText = `${globalJobsList.length} รายการ`;
        if (globalJobsList.length > 0 && lastUpdateEl) {
            lastUpdateEl.innerText = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }

        renderCurrentJobsTable();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center p-6 text-rose-500">เกิดข้อผิดพลาด: ${escapeHtml(err.message)}</td></tr>`;
    }
}

// ช่องค้นหาใหม่ในตาราง "ข้อมูลในระบบปัจจุบัน" — ค้นบริษัท/ตำแหน่ง/สถานที่พร้อมกัน
const filterCurrentJobsTable = debounce(() => {
    const q = document.getElementById('current-jobs-search')?.value.toLowerCase().trim() || '';
    currentJobsFiltered = globalJobsList.filter(job =>
        (job.company_name || '').toLowerCase().includes(q) ||
        (job.position_title || '').toLowerCase().includes(q) ||
        (job.location || '').toLowerCase().includes(q)
    );
    currentJobsPage = 1;
    renderCurrentJobsTable();
}, 200);

function renderCurrentJobsTable() {
    const tbody = document.getElementById('current-jobs-body');
    const infoEl = document.getElementById('current-jobs-pagination-info');
    const pagerEl = document.getElementById('current-jobs-pagination');
    if (!tbody) return;

    if (globalJobsList.length === 0) {
        tbody.innerHTML = emptyRowHtml(7, 'ไม่พบข้อมูลในระบบ');
        if (infoEl) infoEl.innerText = '';
        if (pagerEl) pagerEl.innerHTML = '';
        return;
    }
    if (currentJobsFiltered.length === 0) {
        tbody.innerHTML = emptyRowHtml(7, 'ไม่พบรายการที่ตรงกับคำค้นหา');
        if (infoEl) infoEl.innerText = '';
        if (pagerEl) pagerEl.innerHTML = '';
        return;
    }

    const totalItems = currentJobsFiltered.length;
    const totalPages = Math.ceil(totalItems / CURRENT_JOBS_PAGE_SIZE) || 1;
    if (currentJobsPage > totalPages) currentJobsPage = totalPages;
    const start = (currentJobsPage - 1) * CURRENT_JOBS_PAGE_SIZE;
    const end = Math.min(start + CURRENT_JOBS_PAGE_SIZE, totalItems);
    const pageItems = currentJobsFiltered.slice(start, end);

    if (infoEl) infoEl.innerText = `แสดง ${start + 1} - ${end} จากทั้งหมด ${totalItems.toLocaleString()} รายการ`;

    tbody.innerHTML = '';
    pageItems.forEach(job => {
        const avatar = getCompanyAvatar(job.company_name);
        const tr = document.createElement('tr');
        // 🔒 ใช้ escapeHtml กับข้อมูลทุกช่องที่มาจากผู้ใช้/ไฟล์ที่อัปโหลด
        tr.innerHTML = `
            <td style="font-weight: 600;">${escapeHtml(job.id)}</td>
            <td>
                <div class="company-cell">
                    <div class="company-avatar" style="width:28px;height:28px;font-size:11px;background:${avatar.color};">${escapeHtml(avatar.initial)}</div>
                    <b>${escapeHtml(job.company_name) || '-'}</b>
                </div>
            </td>
            <td style="color: var(--psu-deep); font-weight: 500;">${escapeHtml(job.position_title) || '-'}</td>
            <td>${escapeHtml(job.location) || '-'}</td>
            <td style="color: var(--status-open); font-weight: 600;">${escapeHtml(job.salary) || 'ไม่ระบุ'}</td>
            <td>${statusPillHtml(job.status)}</td>
            <td style="text-align: center; white-space: nowrap;">
                <button onclick="openEditJobModalById('${escapeHtml(job.id)}')" class="btn-edit-sm icon-btn">${ROW_ICONS.edit} แก้ไข</button>
                <button onclick="deleteJob('${escapeHtml(job.id)}')" class="btn-delete-sm icon-btn">${ROW_ICONS.trash} ลบ</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    renderPagination(pagerEl, {
        currentPage: currentJobsPage,
        totalPages,
        onChange: (p) => { currentJobsPage = p; renderCurrentJobsTable(); }
    });
}

// 🆕 ส่งออกข้อมูลงานทั้งหมดในระบบเป็นไฟล์ Excel (.xlsx) — ใช้ไลบรารี XLSX ที่โหลดไว้อยู่แล้ว
// ไม่ต้องเพิ่ม dependency ใหม่ เหมาะสำหรับเจ้าหน้าที่ที่ต้องการก็อปข้อมูลไปทำรายงาน/ส่งต่อ
function exportCurrentJobsToExcel() {
    if (!globalJobsList.length) {
        Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลให้ส่งออก', 'warning');
        return;
    }
    try {
        const rows = globalJobsList.map(job => ({
            'ID': job.id,
            'บริษัท/หน่วยงาน': job.company_name || '-',
            'ตำแหน่งงาน/ทุน': job.position_title || '-',
            'ประเภทงาน': job.job_type || '-',
            'สถานที่': job.location || '-',
            'รูปแบบงาน': job.work_format || '-',
            'เงินเดือน/เบี้ยเลี้ยง': job.salary || '-',
            'โควต้า': job.quota || '-',
            'วันปิดรับสมัคร': job.deadline || '-',
            'สถานะ': job.status || '-',
            'ช่องทางสมัคร/ติดต่อ': job.application_channel || job.contact_info || '-'
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'CWIE Jobs');
        const dateTag = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `cwie-jobs-${dateTag}.xlsx`);
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถสร้างไฟล์ส่งออกได้: ' + err.message, 'error');
    }
}

function openAddJobModal() {
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

    setVal('form-job-id', '');
    const titleEl = document.getElementById('form-modal-title');
    if (titleEl) titleEl.innerText = 'เพิ่มประกาศงานใหม่';

    setVal('form-company', '');
    setVal('form-position', '');
    setVal('form-location', '');
    setVal('form-work-format', 'Onsite');
    setVal('form-salary', '');
    setVal('form-quota', '');
    setVal('form-job-type', 'สหกิจศึกษา');
    setVal('form-status', 'เปิดรับสมัครอยู่');
    setVal('form-deadline', '');
    setVal('form-contact', '');

    const modal = document.getElementById('admin-job-modal');
    if (modal) modal.style.display = 'flex';
    document.getElementById('form-company')?.focus();
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
    if (titleEl) titleEl.innerText = 'แก้ไขประกาศงาน';

    setVal('form-company', job.company_name || '');
    setVal('form-position', job.position_title || '');
    setVal('form-location', job.location || '');
    setVal('form-work-format', job.work_format || 'Onsite');
    setVal('form-salary', job.salary || '');
    setVal('form-quota', job.quota || '');
    setVal('form-job-type', job.job_type || 'สหกิจศึกษา');
    setVal('form-status', job.status || 'เปิดรับสมัครอยู่');
    // 🔧 แก้บั๊ก: เดิมฟอร์มนี้ไม่มีช่อง deadline เลย ทำให้เปิดแก้งานที่นำเข้าจาก Excel
    // (ซึ่งมีวันปิดรับสมัครอยู่แล้ว) แล้วกด "บันทึกข้อมูล" จะไม่ส่งค่า deadline ไปด้วยเลย
    setVal('form-deadline', job.deadline && job.deadline !== 'ไม่ระบุ' ? job.deadline : '');
    setVal('form-contact', job.application_channel || job.contact_info || '');

    const modal = document.getElementById('admin-job-modal');
    if (modal) modal.style.display = 'flex';
}

function closeAdminJobModal() {
    const modal = document.getElementById('admin-job-modal');
    if (modal) modal.style.display = 'none';
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

    const contact = getVal('form-contact');
    if (contact && !/^https?:\/\//i.test(contact) && !contact.includes('@') && !/^[0-9+\-() ]{6,}$/.test(contact)) {
        // 🔧 ตรวจแบบผ่อนปรน: เตือนเฉยๆ ไม่บล็อกการบันทึก เผื่อแอดมินตั้งใจใส่ข้อความอธิบายแทนลิงก์/เบอร์/อีเมลจริงๆ
        const confirmResult = await Swal.fire({
            icon: 'question',
            title: 'ช่องติดต่อดูไม่เหมือนลิงก์ เบอร์โทร หรืออีเมล',
            text: 'ต้องการบันทึกข้อมูลนี้ต่อหรือไม่?',
            showCancelButton: true,
            confirmButtonText: 'บันทึกต่อ',
            cancelButtonText: 'กลับไปแก้ไข'
        });
        if (!confirmResult.isConfirmed) return;
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
        deadline: getVal('form-deadline') || 'ไม่ระบุ',
        application_channel: contact,
        contact_info: contact
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

        const logLabel = isEdit
            ? `แก้ไขงานด้วยตนเอง: ${company} - ${position}`
            : `เพิ่มงานด้วยตนเอง: ${company} - ${position}`;
        const logOk = await logHistoryEntry(logLabel, 1);

        closeAdminJobModal();
        if (logOk) {
            Swal.fire({ icon: 'success', title: 'บันทึกข้อมูลสำเร็จ!', timer: 1500, showConfirmButton: false });
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
    const result = await Swal.fire({
        title: 'ล้างข้อมูลทั้งหมด?',
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
            // 🔧 แก้บั๊ก: เดิมใช้ .neq('id', 0) ซึ่งสมมติว่าคอลัมน์ id เป็นตัวเลขเสมอ
            // ถ้าตาราง cwie_jobs ใช้ id เป็น UUID จริง คำสั่งนี้จะพังทันที (เทียบคอลัมน์
            // uuid กับเลข 0 ไม่ได้) — เปลี่ยนเป็นเงื่อนไข "id ไม่เป็นค่าว่าง" ซึ่งใช้ได้
            // ทั้งกับ id แบบตัวเลขและ UUID เหมือนกัน
            const { error } = await supabaseClient.from('cwie_jobs').delete().not('id', 'is', null);
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
//
// ⚠️ ข้อจำกัดที่ทราบอยู่: เทมเพลตนี้ไม่มีคอลัมน์ระบุ "ประเภทงาน" (สหกิจ/ฝึกงาน/รับเข้าทำงาน)
// ทุกแถวที่นำเข้าจาก Excel จึงถูกตั้งเป็น "สหกิจศึกษา" เสมอ (ดูตัวแปร job_type ด้านล่าง)
// ถ้าไฟล์จริงมีคอลัมน์นี้อยู่ ให้เพิ่ม job_type: N ในอ็อบเจ็กต์นี้แล้วอ่านค่าแทนการ hardcode
const EXCEL_COLUMNS = {
    company_name: 1,
    position_title: 2,
    quota: 3,
    location: 6,
    work_format: 7,
    salary: 8,
    deadline: 10,
    status: 11,
    application_channel: 12,
    contact_info: 13
};

// ค่าที่พบได้บ่อยในไฟล์ Excel ที่นำเข้า ซึ่งหมายถึง "ปิดรับสมัครแล้ว" (กว้างกว่า CLOSED_STATUS_SET
// ใน shared-utils.js ซึ่งใช้เทียบแบบตรงเป๊ะสำหรับแสดงผลเท่านั้น — ตรงนี้ต้องทนทานต่อไฟล์ที่พิมพ์มาไม่เป๊ะ)
const IMPORT_CLOSED_KEYWORDS = [...CLOSED_STATUS_SET, 'closed', 'close'];

function normalizeStatusValue(raw) {
    const val = String(raw || '').trim();
    if (!val) return 'เปิดรับสมัครอยู่';
    const normalized = val.toLowerCase();
    // ต้องเช็คคำว่า "เปิด" (คำเต็ม) ก่อนเสมอ เพราะคำว่า "ปิด" เป็นส่วนหนึ่งของคำว่า
    // "เปิด" อยู่แล้ว (เ + ปิด) ถ้าเช็คแค่ "ปิด" อย่างเดียวจะจับ "เปิดรับสมัครอยู่" ผิดว่าปิดไปด้วย
    if (normalized.includes('เปิด') || normalized.includes('open')) {
        return 'เปิดรับสมัครอยู่';
    }
    const isClosed = IMPORT_CLOSED_KEYWORDS.some(c => normalized.includes(c.toLowerCase()));
    return isClosed ? 'ปิดรับสมัครแล้ว' : 'เปิดรับสมัครอยู่';
}

// 🆕 หาแผ่นงาน (sheet) ที่มีจำนวนแถวมากที่สุดในไฟล์ แทนที่จะเชื่อว่าแผ่นแรกคือแผ่นข้อมูลเสมอ
// (กันปัญหาไฟล์ที่มีแผ่นปกหรือคำอธิบายเป็นแผ่นแรก แล้วข้อมูลจริงอยู่แผ่นถัดไป)
function pickBestSheet(workbook) {
    let bestName = workbook.SheetNames[0];
    let bestCount = -1;
    workbook.SheetNames.forEach(name => {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 });
        if (rows.length > bestCount) {
            bestCount = rows.length;
            bestName = name;
        }
    });
    return bestName;
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
            // 🔧 แก้บั๊ก: เพิ่ม cellDates: true — ถ้าไม่ใส่ตรงนี้ เซลล์ที่ผู้ใช้จัดรูปแบบเป็น
            // "วันที่" จริงในโปรแกรม Excel (ไม่ใช่พิมพ์เป็นข้อความ) จะถูกอ่านออกมาเป็นเลขลำดับ
            // วันของ Excel (เช่น 45678) แทนที่จะเป็นวันที่อ่านรู้เรื่อง กระทบคอลัมน์ K (วันปิดรับสมัคร)
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
                Swal.fire('แจ้งเตือน', 'ไฟล์นี้ไม่มีแผ่นงาน (sheet) ที่อ่านได้', 'warning');
                return;
            }

            // 🆕 เลือกแผ่นงานที่มีข้อมูลมากที่สุด กันกรณีแผ่นแรกเป็นหน้าปก/คำอธิบายเปล่าๆ
            const sheetName = pickBestSheet(workbook);
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (json.length < 2) {
                Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลในไฟล์ Excel หรือไฟล์ว่างเปล่า', 'warning');
                return;
            }

            const getCell = (row, idx, fallback) => {
                if (idx === undefined) return fallback;
                const val = row[idx];
                if (val === undefined || val === null || val === '') return fallback;
                // แปลงวันที่ที่ XLSX แปลงเป็น JS Date ให้แล้ว (เพราะ cellDates:true) ให้อ่านง่าย
                if (val instanceof Date && !isNaN(val)) {
                    return val.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
                }
                // 🆕 ถ้าเซลล์เป็นตัวเลขล้วน (เช่น เงินเดือนที่พิมพ์เป็นตัวเลขไม่ใช่ข้อความ) จัดรูปแบบ
                // ใส่จุลภาคคั่นหลักพันให้อ่านง่าย แทนที่จะโชว์ตัวเลขดิบๆ ติดกันยาวๆ
                if (typeof val === 'number') {
                    return val.toLocaleString('en-US', { maximumFractionDigits: 2 });
                }
                // 🆕 ตัดช่องว่างหัว-ท้ายทิ้ง กันปัญหาช่องว่างแฝงที่มองไม่เห็น (เช่นตัวกรองสถานที่บน
                // Dashboard จะเทียบสตริงแบบตรงเป๊ะ ถ้ามีช่องว่างติดมาจะกลายเป็นคนละค่ากับที่ตั้งใจ)
                return String(val).trim();
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

            // 🆕 เช็กแบบคร่าวๆ (ไม่บล็อก แค่เตือน): ถ้านำเข้าได้น้อยกว่าครึ่งของแถวทั้งหมดในไฟล์
            // มักแปลว่าตำแหน่งคอลัมน์ในไฟล์ไม่ตรงกับ EXCEL_COLUMNS ด้านบน ควรแจ้งให้ผู้ใช้ทราบ
            const totalDataRows = json.length - 1;
            if (totalDataRows > 0 && parsedExcelData.length < totalDataRows * 0.5) {
                Swal.fire({
                    icon: 'info',
                    title: 'อ่านข้อมูลได้ไม่ครบตามคาด',
                    text: `ไฟล์นี้มี ${totalDataRows} แถว แต่นำเข้าได้เพียง ${parsedExcelData.length} แถว อาจเป็นเพราะตำแหน่งคอลัมน์ในไฟล์ไม่ตรงกับเทมเพลตที่ระบบรองรับ กรุณาตรวจสอบข้อมูลในตารางพรีวิวด้านล่างก่อนกด "บันทึกเข้าระบบ"`
                });
            }

            renderPreviewTable(parsedExcelData);
        } catch (err) {
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถอ่านไฟล์ Excel ได้: ' + err.message, 'error');
        }
    };
    reader.onerror = function () {
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถเปิดอ่านไฟล์นี้ได้ ไฟล์อาจเสียหายหรือถูกล็อกอยู่', 'error');
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
        const avatar = getCompanyAvatar(item.company_name);
        const tr = document.createElement('tr');
        // 🔒 escape ข้อมูลจากไฟล์ที่อัปโหลดก่อนแสดงในตารางพรีวิว
        tr.innerHTML = `
            <td>
                <div class="company-cell">
                    <div class="company-avatar" style="width:26px;height:26px;font-size:10.5px;background:${avatar.color};">${escapeHtml(avatar.initial)}</div>
                    <b>${escapeHtml(item.company_name)}</b>
                </div>
            </td>
            <td><span style="color: var(--psu-deep); font-weight: 500;">${escapeHtml(item.position_title)}</span></td>
            <td>${escapeHtml(item.location)}</td>
            <td style="color: var(--status-open); font-weight: 600;">${escapeHtml(item.salary)}</td>
            <td style="font-size: 11px; color: #64748b;">${escapeHtml(item.application_channel)}</td>
            <td>${statusPillHtml(item.status)}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function syncToDatabase() {
    if (parsedExcelData.length === 0) {
        Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลสำหรับซิงก์', 'warning');
        return;
    }

    try {
        const { error: jobErr } = await supabaseClient.from('cwie_jobs').insert(parsedExcelData);
        if (jobErr) throw jobErr;

        const logOk = await logHistoryEntry(uploadedFileName || 'Excel_Import.xlsx', parsedExcelData.length);

        if (!logOk) {
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

async function loadUploadHistory() {
    const historyBody = document.getElementById('history-body');
    if (!historyBody) return;
    historyBody.innerHTML = skeletonRowsHtml(6, 3);

    try {
        if (typeof supabaseClient === 'undefined') return;

        const { data, error } = await supabaseClient
            .from('cwie_logs')
            .select('*')
            .order('id', { ascending: false });

        if (error) throw error;
        const logs = data || [];

        if (logs.length === 0) {
            historyBody.innerHTML = emptyRowHtml(6, 'ยังไม่มีประวัติการอัปโหลด');
            return;
        }

        historyBody.innerHTML = '';
        logs.forEach(log => {
            const dateObj = log.uploaded_at ? new Date(log.uploaded_at) : new Date();
            const dateStr = dateObj.toLocaleString('th-TH', {
                year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
            });

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(dateStr)}</td>
                <td><b>${escapeHtml(log.filename) || 'Excel Import'}</b></td>
                <td><span class="badge-count">${escapeHtml(log.record_count) || 0} รายการ</span></td>
                <td>${escapeHtml(log.uploaded_by) || 'Admin'}</td>
                <td><span class="status-pill status-pill--open"><span class="dot"></span>สำเร็จ</span></td>
                <td style="text-align: center;">
                    <button onclick="deleteLog(${Number(log.id)})" class="btn-delete-sm icon-btn" aria-label="ลบประวัตินี้">${ROW_ICONS.trash}</button>
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
            // 🔧 แก้บั๊กเดียวกับ deleteAllJobs(): เปลี่ยนจาก .neq('id', 0) เป็นเงื่อนไข
            // ที่ใช้ได้ทั้งกับ id แบบตัวเลขและ UUID
            await supabaseClient.from('cwie_logs').delete().not('id', 'is', null);
            loadUploadHistory();
            Swal.fire({ icon: 'success', title: 'ล้างประวัติสำเร็จ', timer: 1000, showConfirmButton: false });
        } catch (err) { console.warn(err); }
    }
}
