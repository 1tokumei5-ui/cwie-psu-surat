// ==========================================
// สคริปต์ Dashboard ธีม ม.อ. + Realtime Sync
// ==========================================

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
        } catch (err) {
            console.warn("Session check warning:", err);
        }
    }

    const secretTrigger = document.getElementById('secret-admin-trigger');
    if (secretTrigger) {
        secretTrigger.addEventListener('dblclick', () => {
            window.location.href = 'admin.html';
        });
    }

    // 1. โหลดข้อมูลครั้งแรก
    fetchDashboardJobs();

    // 2. เปิดระบบฟังการเปลี่ยนแปลงแบบ Realtime
    setupRealtimeSubscription();
});

// 🔄 ฟังก์ชันเชื่อมต่อ Realtime WebSocket กับ Supabase
function setupRealtimeSubscription() {
    if (typeof supabaseClient === 'undefined') return;

    supabaseClient
        .channel('public:cwie_jobs')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'cwie_jobs' },
            (payload) => {
                console.log('📡 ตรวจพบการเปลี่ยนแปลงข้อมูลจากฐานข้อมูล กำลังรีเฟรช...', payload);
                fetchDashboardJobs(); // ดึงข้อมูลใหม่และอัปเดตกราฟทันที
            }
        )
        .subscribe((status) => {
            console.log('Realtime Status:', status);
        });
}

async function fetchDashboardJobs() {
    const tbody = document.getElementById('job-list-body');
    
    try {
        const { data, error } = await supabaseClient
            .from('cwie_jobs')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;

        allJobs = data || [];
        filteredJobs = [...allJobs];

        updateDashboardStats(allJobs);
        populateLocationFilter(allJobs);
        renderCharts(allJobs);
        
        currentPage = 1;
        renderPaginatedTable();

    } catch (err) {
        console.error("Dashboard Fetch Error:", err);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center p-8 text-rose-500 font-semibold">เกิดข้อผิดพลาดในการโหลดข้อมูล: ${err.message}</td></tr>`;
        }
    }
}

function updateDashboardStats(jobs) {
    const total = jobs.length;
    let openCount = 0;
    let closedCount = 0;

    jobs.forEach(job => {
        const isClosed = job.status && (job.status.includes('ปิด') || job.status.includes('หมด'));
        if (isClosed) closedCount++;
        else openCount++;
    });

    const elTotal = document.getElementById('dash-stat-total');
    const elOpen = document.getElementById('dash-stat-open');
    const elClosed = document.getElementById('dash-stat-closed');

    if (elTotal) elTotal.innerText = total.toLocaleString();
    if (elOpen) elOpen.innerText = openCount.toLocaleString();
    if (elClosed) elClosed.innerText = closedCount.toLocaleString();
}

function renderCharts(jobs) {
    const locationCounts = {};
    let openCount = 0;
    let closedCount = 0;

    jobs.forEach(job => {
        const loc = (job.location && job.location !== '-') ? job.location.trim() : 'ไม่ระบุ';
        locationCounts[loc] = (locationCounts[loc] || 0) + 1;

        const isClosed = job.status && (job.status.includes('ปิด') || job.status.includes('หมด'));
        if (isClosed) closedCount++;
        else openCount++;
    });

    const ctxLoc = document.getElementById('chart-location');
    if (ctxLoc) {
        if (locationChartInstance) locationChartInstance.destroy();
        locationChartInstance = new Chart(ctxLoc, {
            type: 'bar',
            data: {
                labels: Object.keys(locationCounts),
                datasets: [{
                    label: 'จำนวนประกาศงาน',
                    data: Object.values(locationCounts),
                    backgroundColor: 'rgba(0, 119, 182, 0.75)',
                    borderColor: '#003566',
                    borderWidth: 1.5,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { 
                    y: { beginAtZero: true, ticks: { precision: 0 } },
                    x: { ticks: { font: { family: 'Prompt', size: 10 } } }
                }
            }
        });
    }

    const ctxStatus = document.getElementById('chart-status');
    if (ctxStatus) {
        if (statusChartInstance) statusChartInstance.destroy();
        statusChartInstance = new Chart(ctxStatus, {
            type: 'doughnut',
            data: {
                labels: ['เปิดรับสมัครอยู่', 'ปิดรับสมัครแล้ว'],
                datasets: [{
                    data: [openCount, closedCount],
                    backgroundColor: ['#10b981', '#f43f5e'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { 
                        position: 'bottom',
                        labels: { font: { family: 'Prompt', size: 11 } }
                    } 
                }
            }
        });
    }
}

function populateLocationFilter(jobs) {
    const filterSelect = document.getElementById('location-filter');
    if (!filterSelect) return;

    const locations = new Set();
    jobs.forEach(job => {
        if (job.location && job.location !== '-') locations.add(job.location.trim());
    });

    filterSelect.innerHTML = `<option value="">ทุกสถานที่ปฏิบัติงาน</option>`;
    locations.forEach(loc => {
        filterSelect.innerHTML += `<option value="${loc}">${loc}</option>`;
    });
}

function filterJobs() {
    const searchVal = document.getElementById('search-input')?.value.toLowerCase().trim() || '';
    const locationVal = document.getElementById('location-filter')?.value || '';

    filteredJobs = allJobs.filter(job => {
        const matchSearch = (job.company_name || '').toLowerCase().includes(searchVal) ||
                            (job.position_title || '').toLowerCase().includes(searchVal) ||
                            (job.location || '').toLowerCase().includes(searchVal) ||
                            (job.salary || '').toLowerCase().includes(searchVal);
                            
        const matchLocation = locationVal === '' || (job.location && job.location.trim() === locationVal);

        return matchSearch && matchLocation;
    });

    currentPage = 1;
    renderPaginatedTable();
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

    if (infoEl) {
        infoEl.innerText = totalItems > 0 
            ? `แสดง ${startIndex + 1} - ${endIndex} จากทั้งหมด ${totalItems.toLocaleString()} รายการ`
            : `แสดง 0 รายการ`;
    }

    if (paginatedData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center p-8 text-slate-400">📭 ไม่พบรายการประกาศงาน</td></tr>`;
    } else {
        tbody.innerHTML = '';
        paginatedData.forEach(job => {
            const isClosed = job.status && (job.status.includes('ปิด') || job.status.includes('หมด'));
            const statusBadge = isClosed
                ? `<span class="bg-rose-50 text-rose-600 border border-rose-100 px-2.5 py-0.5 rounded-full text-[11px] font-semibold font-heading whitespace-nowrap">🔴 ปิดรับสมัคร</span>`
                : `<span class="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-0.5 rounded-full text-[11px] font-semibold font-heading whitespace-nowrap">🟢 เปิดรับสมัคร</span>`;

            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50/80 transition-colors cursor-pointer";
            tr.onclick = () => openJobDetailModal(job);
            
            tr.innerHTML = `
                <td class="p-4 font-semibold text-slate-800">${job.company_name || '-'}</td>
                <td class="p-4 font-medium text-psublue">${job.position_title || '-'}</td>
                <td class="p-4 text-slate-600">${job.location || '-'}</td>
                <td class="p-4 font-semibold text-emerald-600">${job.salary || 'ไม่ระบุ'}</td>
                <td class="p-4 text-slate-500 text-xs">${job.contact_info || job.application_channel || '-'}</td>
                <td class="p-4">${statusBadge}</td>
                <td class="p-4 text-center">
                    <button class="px-3 py-1 bg-slate-100 text-psublue rounded-lg text-xs font-medium hover:bg-psublue hover:text-white transition-all font-heading">
                        🔍 ดูข้อมูล
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    if (btnContainer) {
        btnContainer.innerHTML = '';

        const prevBtn = document.createElement('button');
        prevBtn.innerText = '‹ ก่อนหน้า';
        prevBtn.className = `px-3 py-1.5 rounded-xl text-xs font-semibold ${currentPage === 1 ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-slate-100 text-slate-600 hover:bg-psublue hover:text-white transition-all'}`;
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
        nextBtn.className = `px-3 py-1.5 rounded-xl text-xs font-semibold ${currentPage === totalPages ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-slate-100 text-slate-600 hover:bg-psublue hover:text-white transition-all'}`;
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.onclick = () => { currentPage++; renderPaginatedTable(); };
        btnContainer.appendChild(nextBtn);
    }
}

function openJobDetailModal(job) {
    const modal = document.getElementById('job-detail-modal');
    if (!modal) return;

    const isClosed = job.status && (job.status.includes('ปิด') || job.status.includes('หมด'));

    document.getElementById('modal-company-name').innerText = job.company_name || 'ไม่ระบุชื่อบริษัท';
    document.getElementById('modal-position-title').innerText = job.position_title || 'ไม่ระบุตำแหน่ง';
    document.getElementById('modal-location').innerText = job.location || '-';
    document.getElementById('modal-work-format').innerText = job.work_format || 'Onsite';
    document.getElementById('modal-salary').innerText = job.salary || 'ไม่ระบุ / ตามตกลง';
    document.getElementById('modal-quota').innerText = job.quota || 'ไม่ระบุ';
    document.getElementById('modal-deadline').innerText = job.deadline || 'ไม่ระบุ';
    document.getElementById('modal-contact').innerText = job.contact_info || job.application_channel || '-';

    const statusBadge = document.getElementById('modal-badge-status');
    if (statusBadge) {
        statusBadge.innerText = isClosed ? '🔴 ปิดรับสมัครแล้ว' : '🟢 เปิดรับสมัครอยู่';
        statusBadge.className = `inline-block px-3 py-0.5 rounded-full text-[11px] font-semibold mb-2 ${isClosed ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`;
    }

    const applyBtn = document.getElementById('modal-apply-btn');
    if (applyBtn) {
        const channel = job.application_channel || job.contact_info || '';
        if (channel.startsWith('http')) {
            applyBtn.href = channel;
            applyBtn.style.display = 'inline-flex';
        } else {
            applyBtn.style.display = 'none';
        }
    }

    modal.classList.remove('hidden');
}

function closeJobDetailModal() {
    const modal = document.getElementById('job-detail-modal');
    if (modal) modal.classList.add('hidden');
}