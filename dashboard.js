let allJobs = [];
let filteredJobs = [];
let currentPage = 1;
const itemsPerPage = 10;
let locationChartInstance = null;
let statusChartInstance = null;

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
        const isClosed = job.status === 'ปิดรับสมัครแล้ว' || job.status === 'ปิดรับสมัคร' || job.status === 'ปิด';
        if (isClosed) closedCount++; else openCount++;
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
        const isClosed = job.status === 'ปิดรับสมัครแล้ว' || job.status === 'ปิดรับสมัคร' || job.status === 'ปิด';
        if (isClosed) closedCount++; else openCount++;
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

// 🔧 debounce ป้องกันการ filter ถี่เกินไปขณะพิมพ์
let searchDebounceTimer = null;
function filterJobs() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        const searchVal = document.getElementById('search-input')?.value.toLowerCase().trim() || '';
        const locationVal = document.getElementById('location-filter')?.value || '';
        filteredJobs = allJobs.filter(job => {
            const matchSearch = (job.company_name || '').toLowerCase().includes(searchVal) || (job.position_title || '').toLowerCase().includes(searchVal);
            const matchLocation = locationVal === '' || (job.location && job.location.trim() === locationVal);
            return matchSearch && matchLocation;
        });
        currentPage = 1;
        renderPaginatedTable();
    }, 200);
}

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

    if (infoEl) infoEl.innerText = `แสดง ${startIndex + 1} - ${endIndex} จากทั้งหมด ${totalItems.toLocaleString()} รายการ`;

    if (paginatedData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center p-8 text-slate-400">📭 ไม่พบรายการประกาศงาน</td></tr>`;
    } else {
        tbody.innerHTML = '';
        paginatedData.forEach(job => {
            const isClosed = job.status === 'ปิดรับสมัครแล้ว' || job.status === 'ปิดรับสมัคร' || job.status === 'ปิด';
            const statusBadge = isClosed
                ? `<span class="bg-rose-50 text-rose-600 border border-rose-100 px-2.5 py-0.5 rounded-full text-[11px] font-semibold font-heading whitespace-nowrap">🔴 ปิดรับสมัคร</span>`
                : `<span class="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-0.5 rounded-full text-[11px] font-semibold font-heading whitespace-nowrap">🟢 เปิดรับสมัคร</span>`;

            const jobTypeBadge = `<span class="bg-sky-50 text-psublue border border-sky-100 px-2.5 py-0.5 rounded-full text-[11px] font-semibold font-heading whitespace-nowrap">${escapeHtml(job.job_type) || 'สหกิจศึกษา'}</span>`;

            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50/80 transition-colors cursor-pointer";
            tr.onclick = () => openJobDetailModal(job);
            // 🔒 escape ข้อมูลทุกช่องที่มาจากฐานข้อมูล (อาจมาจากไฟล์ Excel ที่อัปโหลด)
            tr.innerHTML = `
                <td class="p-4 font-semibold text-slate-800">${escapeHtml(job.company_name) || '-'}</td>
                <td class="p-4 font-medium text-psublue">${escapeHtml(job.position_title) || '-'}</td>
                <td class="p-4">${jobTypeBadge}</td>
                <td class="p-4 text-slate-600">${escapeHtml(job.location) || '-'}</td>
                <td class="p-4 font-semibold text-emerald-600">${escapeHtml(job.salary) || 'ไม่ระบุ'}</td>
                <td class="p-4">${statusBadge}</td>
                <td class="p-4 text-center"><button class="px-3 py-1 bg-slate-100 text-psublue rounded-lg text-xs font-medium hover:bg-psublue hover:text-white transition-all font-heading">🔍 ดูข้อมูล</button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    if (btnContainer) {
        btnContainer.innerHTML = '';
        const prevBtn = document.createElement('button');
        prevBtn.innerText = '‹ ก่อนหน้า';
        prevBtn.className = `px-3 py-1.5 rounded-xl text-xs font-semibold ${currentPage === 1 ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-slate-100 text-slate-600 hover:bg-psublue hover:text-white'}`;
        prevBtn.disabled = currentPage === 1;
        prevBtn.onclick = () => { currentPage--; renderPaginatedTable(); };
        btnContainer.appendChild(prevBtn);

        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                const pageBtn = document.createElement('button');
                pageBtn.innerText = i;
                pageBtn.className = `px-3 py-1.5 rounded-xl text-xs font-semibold ${i === currentPage ? 'bg-psublue text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`;
                pageBtn.onclick = () => { currentPage = i; renderPaginatedTable(); };
                btnContainer.appendChild(pageBtn);
            }
        }

        const nextBtn = document.createElement('button');
        nextBtn.innerText = 'ถัดไป ›';
        nextBtn.className = `px-3 py-1.5 rounded-xl text-xs font-semibold ${currentPage === totalPages ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-slate-100 text-slate-600 hover:bg-psublue hover:text-white'}`;
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.onclick = () => { currentPage++; renderPaginatedTable(); };
        btnContainer.appendChild(nextBtn);
    }
}

function openJobDetailModal(job) {
    const modal = document.getElementById('job-detail-modal');
    if (!modal) return;
    const isClosed = job.status === 'ปิดรับสมัครแล้ว' || job.status === 'ปิดรับสมัคร' || job.status === 'ปิด';

    // 🔧 ตั้งค่าแบบปลอดภัย — ถ้า element ไม่มีอยู่ในหน้า HTML จะข้ามไปเฉยๆ แทนที่จะ error
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };

    // ใช้ innerText อยู่แล้ว (ปลอดภัยจาก XSS โดยธรรมชาติ) — คงไว้ตามเดิม
    setText('modal-company-name', job.company_name || '-');
    setText('modal-position-title', job.position_title || '-');
    setText('modal-location', job.location || '-');
    // 🔧 modal-work-format มี element ในหน้าเว็บแต่เดิมไม่เคยถูกตั้งค่าเลย เพิ่มให้แสดงข้อมูลจริง
    setText('modal-work-format', job.work_format || 'ไม่ระบุ');
    setText('modal-salary', job.salary || 'ไม่ระบุ');
    setText('modal-quota', job.quota || 'ไม่ระบุ');
    setText('modal-deadline', job.deadline || 'ไม่ระบุ');
    setText('modal-contact', job.contact_info || job.application_channel || '-');

    const statusBadge = document.getElementById('modal-badge-status');
    if (statusBadge) {
        statusBadge.innerText = isClosed ? '🔴 ปิดรับสมัครแล้ว' : '🟢 เปิดรับสมัครอยู่';
        statusBadge.className = `inline-block px-3 py-0.5 rounded-full text-[11px] font-semibold mb-2 ${isClosed ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`;
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
    document.getElementById('job-detail-modal').classList.add('hidden');
}
