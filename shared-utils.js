/* ============================================================
   CWIE PSU Surat Thani — Shared Utilities
   ------------------------------------------------------------
   ฟังก์ชันที่ใช้ร่วมกันทั้ง admin.js และ dashboard.js
   ต้องโหลด <script> ไฟล์นี้ "ก่อน" admin.js และ dashboard.js เสมอ

   เดิมทีฟังก์ชัน escapeHtml() ถูกก็อปวางซ้ำกันทั้งใน admin.js และ
   dashboard.js และตรรกะ "เช็คว่าปิดรับสมัครหรือยัง" ก็ถูกเขียนซ้ำ
   แบบ inline กระจายอยู่ 5 จุดทั่วทั้งสองไฟล์ — รวมมาไว้ที่เดียว
   เพื่อให้แก้ไขจุดเดียวแล้วมีผลทั้งเว็บ ลดโอกาสแก้ไม่ครบ
   ============================================================ */

// 🔒 กัน XSS — แปลงข้อความให้ปลอดภัยก่อนแทรกลงใน innerHTML
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 🔧 เช็คสถานะ "ปิดรับสมัครแล้ว" แบบรวมศูนย์ที่เดียว
//    (เดิมเขียน job.status === 'ปิดรับสมัครแล้ว' || ... ซ้ำ 5 จุดในหลายไฟล์)
const CLOSED_STATUS_SET = ['ปิดรับสมัครแล้ว', 'ปิดรับสมัคร', 'ปิด'];
function isJobClosed(status) {
    return CLOSED_STATUS_SET.includes(status);
}

// 🔧 สร้าง markup ของ status pill (จุดสี + ข้อความ) ใช้แทนอิโมจิ 🟢🔴 เดิม
function statusPillHtml(status) {
    const closed = isJobClosed(status);
    const label = closed ? 'ปิดรับสมัคร' : 'เปิดรับสมัคร';
    const cls = closed ? 'status-pill--closed' : 'status-pill--open';
    return `<span class="status-pill ${cls}"><span class="dot"></span>${label}</span>`;
}

// 🎨 อวตารบริษัท — วนสีจากโทน PSU + สีเสริม แฮชจากชื่อบริษัทให้สีเดิมทุกครั้งที่โหลด
const AVATAR_PALETTE = ['#003C71', '#315DAE', '#009CDE', '#0E9F6E', '#7C6FE0', '#DB6E2C'];
function getCompanyAvatar(name) {
    const safeName = String(name || '?').trim();
    const initial = safeName ? safeName.charAt(0).toUpperCase() : '?';
    let hash = 0;
    for (let i = 0; i < safeName.length; i++) {
        hash = safeName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
    return { initial, color };
}

// 🔧 markup แถวแสดง "กำลังโหลด..." ใช้แทนข้อความเปล่าๆ ระหว่างรอข้อมูลจาก Supabase
function loadingRowHtml(colspan, text) {
    return `<tr><td colspan="${colspan}"><div class="loading-state"><span class="loading-spinner"></span><span>${escapeHtml(text || 'กำลังโหลดข้อมูล...')}</span></div></td></tr>`;
}

// 🔧 markup แถว "ไม่พบข้อมูล" (empty state) ใช้แทนอิโมจิ 📭 เดิม
function emptyRowHtml(colspan, text) {
    return `<tr><td colspan="${colspan}">
        <div class="empty-state">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
                <path d="M3.3 7 12 12l8.7-5M12 22V12"/>
            </svg>
            <span>${escapeHtml(text || 'ไม่พบข้อมูล')}</span>
        </div>
    </td></tr>`;
}

// 🔧 แถวโครงกระดูก (skeleton) ระหว่างรอข้อมูลจริง — ให้ความรู้สึก "โหลดเสร็จสมบูรณ์" กว่าตัวหนังสือเปล่าๆ
function skeletonRowsHtml(colspan, rows) {
    rows = rows || 4;
    const widths = [78, 55, 40, 62, 35, 50, 45];
    let out = '';
    for (let r = 0; r < rows; r++) {
        out += '<tr>';
        for (let c = 0; c < colspan; c++) {
            const w = widths[(r + c) % widths.length];
            out += `<td><div class="skeleton-bar" style="width:${w}%;"></div></td>`;
        }
        out += '</tr>';
    }
    return out;
}

// 🔧 debounce ทั่วไป — เดิม dashboard.js เขียน setTimeout/clearTimeout มือเปล่าเอง
// และตอนนี้ admin.js ก็ต้องการแบบเดียวกันสำหรับช่องค้นหาใหม่ รวมมาไว้ที่เดียว
function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay || 200);
    };
}

// 🔧 ตัวช่วยวาดปุ่มเปลี่ยนหน้า (pagination) พร้อมจุดไข่ปลาเมื่อข้ามเลขหน้า
// ใช้ร่วมกันทั้งตารางรายการงานบนหน้า Dashboard และตาราง "ข้อมูลในระบบปัจจุบัน" ของแอดมิน
function renderPagination(container, opts) {
    if (!container) return;
    const currentPage = opts.currentPage;
    const totalPages = opts.totalPages;
    const onChange = opts.onChange;

    container.innerHTML = '';
    const mkBtn = (label, page, disabled, active) => {
        const btn = document.createElement('button');
        btn.innerText = label;
        btn.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold ' + (
            disabled ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
            : active ? 'bg-psublue text-white shadow-sm'
            : 'bg-slate-100 text-slate-600 hover:bg-psublue hover:text-white'
        );
        btn.disabled = !!disabled;
        if (!disabled) btn.onclick = () => onChange(page);
        return btn;
    };

    container.appendChild(mkBtn('‹ ก่อนหน้า', currentPage - 1, currentPage === 1, false));

    let lastRendered = 0;
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            if (lastRendered && i - lastRendered > 1) {
                const ellipsis = document.createElement('span');
                ellipsis.innerText = '…';
                ellipsis.className = 'page-ellipsis';
                container.appendChild(ellipsis);
            }
            container.appendChild(mkBtn(String(i), i, false, i === currentPage));
            lastRendered = i;
        }
    }

    container.appendChild(mkBtn('ถัดไป ›', currentPage + 1, currentPage === totalPages, false));
}
