/* ============================================================
   CWIE PSU Surat Thani — Dashboard logic (dashboard.js)
   ต้องโหลดหลัง shared-utils.js เสมอ (ใช้ escapeHtml, isJobClosed,
   statusPillHtml, getCompanyAvatar, loadingRowHtml, emptyRowHtml
   ที่มาจากไฟล์นั้น)
   ============================================================ */

let allJobs = [];
let filteredJobs = [];
let currentPage = 1;
const itemsPerPage = 10;
let locationChartInstance = null;
let statusChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof supabaseClient !== 'undefined' && supabaseClient.auth) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session) {
                const btnAdmin = document.getElementById('btn-admin-link');
                if (btnAdmin) btnAdmin.style.display = 'inline-flex';
            }
        } catch (err) { console.warn(err); }
    }

    const secretTrigger = document.getElementById('secret-admin-trigger');
    if (secretTrigger) {
        secretTrigger.addEventListener('dblclick', () => { window.location.href = 'admin.html'; });
    }

    // ปิดป๊อปอัพรายละเอียดงานด้วยปุ่ม Esc เพื่อการเข้าถึงที่ดีขึ้น
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeJobDetailModal();
    });

    fetchDashboardJobs();
    setupRealtimeSubscription();
});

function setupRealtimeSubscription() {
    if (typeof supabaseClient === 'undefined') return;
    supabaseClient.channel('public:cwie_jobs')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cwie_jobs' }, () => {
            fetchDashboardJobs();
        })
        .subscribe();
}

async function fetchDashboardJobs() {
    const tbody = document.getElementById('job-list-body');
    try {
        const { data, error } = await supabaseClient.from('cwie_jobs').select('*').order('id', { ascending: true });
        if (error) throw error;
        allJobs = data || [];
        filteredJobs = [...allJobs];
        updateDashboardStats(allJobs);
        populateLocationFilter(allJobs);
        renderCharts(allJobs);
        currentPage = 1;
        renderPaginatedTable();
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center p-8 text-rose-500 font-semibold">เกิดข้อผิดพลาด: ${escapeHtml(err.message)}</td></tr>`;
    }
}

function updateDashboardStats(jobs) {
    const total = jobs.length;
    let openCount = 0, closedCount = 0;
    jobs.forEach(job => {
        if (isJobClosed(job.status)) closedCount++; else openCount++;
    });
    document.getElementById('dash-stat-total').innerText = total.toLocaleString();
    document.getElementById('dash-stat-open').innerText = openCount.toLocaleString();
    document.getElementById('dash-stat-closed').innerText = closedCount.toLocaleString();
}

function renderCharts(jobs) {
    const locationCounts = {};
    let openCount = 0, closedCount = 0;
    jobs.forEach(job => {
        const loc = (job.location && job.location !== '-') ? job.location.trim() : 'ไม่ระบุ';
        locationCounts[loc] = (locationCounts[loc] || 0) + 1;
        if (isJobClosed(job.status)) closedCount++; else openCount++;
    });

    const ctxLoc = document.getElementById('chart-location');
    if (ctxLoc) {
        if (locationChartInstance) locationChartInstance.destroy();
        locationChartInstance = new Chart(ctxLoc, {
            type: 'bar',
            data: {
                labels: Object.keys(locationCounts),
                datasets: [{ data: Object.values(locationCounts), backgroundColor: 'rgba(0, 119, 182, 0.75)', borderColor: '#003566', borderWidth: 1.5, borderRadius: 8 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    const ctxStatus = document.getElementById('chart-status');
    if (ctxStatus) {
        if (statusChartInstance) statusChartInstance.destroy();
        statusChartInstance = new Chart(ctxStatus, {
            type: 'doughnut',
            data: { labels: ['เปิดรับสมัครอยู่', 'ปิดรับสมัครแล้ว'], datasets: [{ data: [openCount, closedCount], backgroundColor: ['#10b981', '#f43f5e'], borderWidth: 2, borderColor: '#fff' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }
}

function populateLocationFilter(jobs) {
    const filterSelect = document.getElementById('location-filter');
    if (!filterSelect) return;
    const locations = new Set();
    jobs.forEach(job => { if (job.location && job.location !== '-') locations.add(job.location.trim()); });
    filterSelect.innerHTML = `<option value="">ทุกสถานที่ปฏิบัติงาน</option>`;
    locations.forEach(loc => {
        // 🔒 escape ค่าที่แทรกลงใน attribute และ innerHTML
        filterSelect.innerHTML += `<option value="${escapeHtml(loc)}">${escapeHtml(loc)}</option>`;
    });
}

// 🔧 debounce ป้องกันการ filter ถี่เกินไปขณะพิมพ์ (ใช้ debounce() กลางจาก shared-utils.js
// แทนการเขียน setTimeout/clearTimeout เองซ้ำกับที่ admin.js ก็ต้องใช้แบบเดียวกัน)
const filterJobs = debounce(() => {
    const searchVal = document.getElementById('search-input')?.value.toLowerCase().trim() || '';
    const locationVal = document.getElementById('location-filter')?.value || '';
    filteredJobs = allJobs.filter(job => {
        // 🔧 แก้บั๊ก: ช่องค้นหาเขียนว่าค้นได้ทั้งบริษัท/ตำแหน่ง/สถานที่ แต่โค้ดเดิมไม่เช็ค location เลย
        const matchSearch = (job.company_name || '').toLowerCase().includes(searchVal)
            || (job.position_title || '').toLowerCase().includes(searchVal)
            || (job.location || '').toLowerCase().includes(searchVal);
        const matchLocation = locationVal === '' || (job.location && job.location.trim() === locationVal);
        return matchSearch && matchLocation;
    });
    currentPage = 1;
    renderPaginatedTable();
}, 200);

function renderPaginatedTable() {
    const tbody = document.getElementById('job-list-body');
    const infoEl = document.getElementById('pagination-info');
    const btnContainer = document.getElementById('pagination-buttons');
    if (!tbody) return;

    const totalItems = filteredJobs.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const paginatedData = filteredJobs.slice(startIndex, endIndex);

    if (infoEl) infoEl.innerText = `แสดง ${totalItems === 0 ? 0 : startIndex + 1} - ${endIndex} จากทั้งหมด ${totalItems.toLocaleString()} รายการ`;

    if (paginatedData.length === 0) {
        tbody.innerHTML = emptyRowHtml(7, 'ไม่พบรายการประกาศงานที่ตรงกับเงื่อนไข');
    } else {
        tbody.innerHTML = '';
        paginatedData.forEach(job => {
            const avatar = getCompanyAvatar(job.company_name);
            const jobTypeBadge = `<span class="badge-count">${escapeHtml(job.job_type) || 'สหกิจศึกษา'}</span>`;

            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50/80 transition-colors cursor-pointer";
            tr.onclick = () => openJobDetailModal(job);
            // 🔒 escape ข้อมูลทุกช่องที่มาจากฐานข้อมูล (อาจมาจากไฟล์ Excel ที่อัปโหลด)
            // 🔧 แก้บั๊ก: เดิมคอลัมน์นี้แสดง "ประเภทงาน" (jobTypeBadge) แต่หัวตารางเขียนว่า "สถานที่ปฏิบัติงาน"
            //    ทำให้ทุกคอลัมน์ตั้งแต่ตัวนี้เป็นต้นไปเลื่อนไม่ตรงกับหัวตาราง — ตอนนี้แก้หัวตารางใน index.html
            //    ให้ตรงกับลำดับข้อมูลจริงนี้แล้ว: บริษัท, ตำแหน่ง, ประเภทงาน, สถานที่, เงินเดือน, สถานะ, รายละเอียด
            tr.innerHTML = `
                <td class="p-4">
                    <div class="flex items-center gap-2.5">
                        <div class="company-avatar" style="background:${avatar.color};">${escapeHtml(avatar.initial)}</div>
                        <span class="font-semibold text-slate-800">${escapeHtml(job.company_name) || '-'}</span>
                    </div>
                </td>
                <td class="p-4 font-medium text-psublue">${escapeHtml(job.position_title) || '-'}</td>
                <td class="p-4">${jobTypeBadge}</td>
                <td class="p-4 text-slate-600">${escapeHtml(job.location) || '-'}</td>
                <td class="p-4 font-semibold text-emerald-600">${escapeHtml(job.salary) || 'ไม่ระบุ'}</td>
                <td class="p-4">${statusPillHtml(job.status)}</td>
                <td class="p-4 text-center"><button class="px-3 py-1 bg-slate-100 text-psublue rounded-lg text-xs font-medium hover:bg-psublue hover:text-white transition-all font-heading">ดูข้อมูล</button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    // 🔧 ใช้ renderPagination() กลางจาก shared-utils.js แทนลูปเดิมที่ข้ามเลขหน้าโดยไม่มี
    // จุดไข่ปลาคั่น (บั๊กเดิม: ดูเหมือนเลขหน้าต่อเนื่องกันทั้งที่จริงข้ามไป) — ฟังก์ชันเดียวกันนี้
    // ตอนนี้ใช้ร่วมกับตาราง "ข้อมูลในระบบปัจจุบัน" ฝั่งแอดมินด้วย
    renderPagination(btnContainer, {
        currentPage, totalPages,
        onChange: (p) => { currentPage = p; renderPaginatedTable(); }
    });
}

function openJobDetailModal(job) {
    const modal = document.getElementById('job-detail-modal');
    if (!modal) return;

    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };

    setText('modal-company-name', job.company_name || '-');
    setText('modal-position-title', job.position_title || '-');
    setText('modal-location', job.location || '-');
    setText('modal-work-format', job.work_format || 'ไม่ระบุ');
    setText('modal-salary', job.salary || 'ไม่ระบุ');
    setText('modal-quota', job.quota || 'ไม่ระบุ');
    setText('modal-deadline', job.deadline || 'ไม่ระบุ');
    setText('modal-contact', job.contact_info || job.application_channel || '-');

    // 🔧 แก้บั๊ก: อวตารบริษัทไม่เคยถูกอัปเดตเลย ค้างเป็น "-" สีฟ้าเดิมทุกครั้งไม่ว่าจะเป็นบริษัทไหน
    const avatarEl = document.getElementById('modal-avatar');
    if (avatarEl) {
        const avatar = getCompanyAvatar(job.company_name);
        avatarEl.innerText = avatar.initial;
        avatarEl.style.background = avatar.color;
    }

    const closed = isJobClosed(job.status);
    const statusBadge = document.getElementById('modal-badge-status');
    if (statusBadge) {
        statusBadge.innerHTML = `<span class="dot" style="background:${closed ? '#fb7185' : '#34d399'};"></span>${closed ? 'ปิดรับสมัครแล้ว' : 'เปิดรับสมัครอยู่'}`;
    }

    const applyBtn = document.getElementById('modal-apply-btn');
    const channel = job.application_channel || job.contact_info || '';
    // 🔒 ตรวจสอบว่าเป็นลิงก์ http/https จริงก่อนตั้งเป็น href ป้องกัน javascript: URI
    if (applyBtn && /^https?:\/\//i.test(channel)) {
        applyBtn.href = channel;
        applyBtn.style.display = 'inline-flex';
    } else if (applyBtn) {
        applyBtn.style.display = 'none';
    }
    modal.classList.remove('hidden');
}

function closeJobDetailModal() {
    document.getElementById('job-detail-modal')?.classList.add('hidden');
}
