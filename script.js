// Configuration
const CONFIG = {
    BASE_URL: '[https://script.google.com/macros/s/AKfycbyCdTIFgOp4ZhxBPp60WM0jqq-X-WAR-vwqVh4nzW_aqmH6xphXUCkcENkdhXOoVkKZ/exec](https://script.google.com/macros/s/AKfycbyCdTIFgOp4ZhxBPp60WM0jqq-X-WAR-vwqVh4nzW_aqmH6xphXUCkcENkdhXOoVkKZ/exec)',
    ITEMS_PER_PAGE: 9, // 3x3 grid
    SHEET_ID: '13quDxkGVsmfPLCLxeDfB2zVBaO9kDf7L1Q7krEAMA20',
};

// State management
let currentPage = 1;
let totalPages = 1;
let isLoggedIn = false;
let globalActivities = []; // Store all fetched activities
let currentActivities = []; // Store currently displayed (filtered) activities

// Image zoom state
let currentZoom = 1;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let imageStartX = 0;
let imageStartY = 0;

function loadLocalActivities() {
    // No local activities in production mode
}

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    loadLocalActivities();
    initializeApp();
    setupEventListeners();
    loadActivities();
    checkUrlForActivity(); // Check for deep links
});

// Function to handle deep linking (?activityId=...)
function checkUrlForActivity() {
    const urlParams = new URLSearchParams(window.location.search);
    const activityId = urlParams.get('activityId');
    
    // We need to wait for activities to load first
    if (activityId) {
        window.pendingActivityId = activityId;
    }
}

function initializeApp() {
    const token = sessionStorage.getItem('adminToken');
    if (token) {
        isLoggedIn = true;
        showAdminInterface();
    }
    loadAvailableYears();
}

function setupEventListeners() {
    // Search functionality
    document.getElementById('searchBtn').addEventListener('click', handleSearch);
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });

    // NEW: Search Clear Button Logic
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    
    searchInput.addEventListener('input', function() {
        if (this.value.length > 0) {
            clearSearchBtn.style.display = 'block';
        } else {
            clearSearchBtn.style.display = 'none';
        }
    });

    clearSearchBtn.addEventListener('click', function() {
        searchInput.value = '';
        this.style.display = 'none';
        searchInput.focus();
        handleSearch(); // Reload/Reset data
    });

    // Filters
    document.getElementById('monthFilter').addEventListener('change', handleSearch);
    document.getElementById('yearFilter').addEventListener('change', handleSearch);
    document.getElementById('tagFilter').addEventListener('change', handleSearch);

    // Pagination
    document.getElementById('prevBtn').addEventListener('click', () => changePage(currentPage - 1));
    document.getElementById('nextBtn').addEventListener('click', () => changePage(currentPage + 1));

    // Login/Logout
    document.getElementById('loginBtn').addEventListener('click', showLoginForm);
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('cancelLogin').addEventListener('click', hideLoginForm);
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('togglePassword').addEventListener('click', togglePasswordVisibility);

    // Modal
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('imageModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });

    // Zoom controls
    document.getElementById('zoomInBtn').addEventListener('click', zoomIn);
    document.getElementById('zoomOutBtn').addEventListener('click', zoomOut);
    document.getElementById('resetZoomBtn').addEventListener('click', resetZoom);
    document.getElementById('modalImage').addEventListener('wheel', handleWheelZoom);

    // Touch/drag support
    setupImageDrag();

    // Activity Detail Modal
    document.getElementById('activityModalClose').addEventListener('click', closeActivityModal);
    
    // Shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const activityModal = document.getElementById('activityModal');
            const imageModal = document.getElementById('imageModal');
            if (activityModal.style.display === 'block') closeActivityModal();
            else if (imageModal.style.display === 'block') closeModal();
        }
        if (document.getElementById('imageModal').style.display === 'block') {
            if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn(); }
            else if (e.key === '-') { e.preventDefault(); zoomOut(); }
            else if (e.key === '0') { e.preventDefault(); resetZoom(); }
        }
    });

    // Admin functions
    document.getElementById('addActivityBtn').addEventListener('click', showAddActivityForm);
    
    // NEW: Admin Search & Filter Events
    document.getElementById('adminSearchInput').addEventListener('keyup', filterAdminActivities);
    document.getElementById('adminStatusFilter').addEventListener('change', filterAdminActivities);
    document.getElementById('adminYearFilter').addEventListener('change', filterAdminActivities);
}

// NEW: Filter Logic for Admin
function filterAdminActivities() {
    const searchText = document.getElementById('adminSearchInput').value.toLowerCase();
    const statusFilter = document.getElementById('adminStatusFilter').value;
    const yearFilter = document.getElementById('adminYearFilter').value;
    
    const rows = document.querySelectorAll('#adminTableBody tr');
    let visibleCount = 0;
    
    rows.forEach(row => {
        if (row.cells.length < 2) return;
        
        const title = row.querySelector('.admin-title-text').textContent.toLowerCase();
        const tags = row.querySelector('.admin-tags-text').textContent.toLowerCase();
        const status = row.getAttribute('data-status'); // published or draft
        const year = row.getAttribute('data-year');
        
        const matchesSearch = title.includes(searchText) || tags.includes(searchText);
        const matchesStatus = statusFilter === 'all' || status === statusFilter;
        const matchesYear = yearFilter === 'all' || year === yearFilter;
        
        if (matchesSearch && matchesStatus && matchesYear) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });
    
    document.getElementById('adminTotalCount').textContent = visibleCount;
}

async function loadAvailableYears() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(`${CONFIG.BASE_URL}?action=getYears`, {
            signal: controller.signal,
            mode: 'cors'
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
            const result = await response.json();
            if (result && result.success) {
                updateYearFilter(result.years || []);
                updateAdminYearFilter(result.years || []); // Update admin filter too
            }
        }
    } catch (error) {
        console.log('Could not load years from server:', error.message);
    }
}

function updateYearFilter(years) {
    const yearFilter = document.getElementById('yearFilter');
    const currentValue = yearFilter.value;
    yearFilter.innerHTML = '<option value="">ทุกปี</option>';
    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = (year + 543);
        yearFilter.appendChild(option);
    });
    if (currentValue && years.includes(parseInt(currentValue))) {
        yearFilter.value = currentValue;
    }
}

// NEW: Populate Admin Year Filter
function updateAdminYearFilter(years) {
    const adminYearFilter = document.getElementById('adminYearFilter');
    adminYearFilter.innerHTML = '<option value="all">ปีทั้งหมด</option>';
    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = (year + 543);
        adminYearFilter.appendChild(option);
    });
}

// === FIX วันที่: ฟังก์ชันแปลงวันที่ให้เสถียร ไม่โดน Timezone ขยับ ===
function parseDateCorrectly(dateInput) {
    if (!dateInput) return new Date();
    
    try {
        // เผื่อมาเป็น Object Date 
        if (dateInput instanceof Date) return dateInput;

        let cleanDate = String(dateInput).trim();
        
        // การตัด 'T' และช่องว่าง ทำให้เราสนใจเฉพาะส่วนของ YYYY-MM-DD
        // เป็นการตัดปัญหาเรื่อง Timezone ออก 100%
        cleanDate = cleanDate.split('T')[0].split(' ')[0];
        
        let day, month, year;

        // ตรวจสอบรูปแบบ DD/MM/YYYY
        if (cleanDate.includes('/')) {
            const parts = cleanDate.split('/');
            if (parts.length === 3) {
                day = parseInt(parts[0], 10);
                month = parseInt(parts[1], 10) - 1; 
                year = parseInt(parts[2], 10);
            }
        } 
        // ตรวจสอบรูปแบบ YYYY-MM-DD หรือ DD-MM-YYYY
        else if (cleanDate.includes('-')) {
            const parts = cleanDate.split('-');
            if (parts.length === 3) {
                if (parts[0].length === 4) { // แบบ YYYY-MM-DD
                    year = parseInt(parts[0], 10);
                    month = parseInt(parts[1], 10) - 1;
                    day = parseInt(parts[2], 10);
                } else { // แบบ DD-MM-YYYY
                    day = parseInt(parts[0], 10);
                    month = parseInt(parts[1], 10) - 1;
                    year = parseInt(parts[2], 10);
                }
            }
        } else {
            return new Date(dateInput); 
        }

        // แปลงพ.ศ. เป็น ค.ศ. ป้องกันบั๊กปี 3111
        if (year >= 2500) {
            year -= 543;
        }

        if (isNaN(day) || isNaN(month) || isNaN(year)) {
            return new Date();
        }

        return new Date(year, month, day);
    } catch (e) {
        console.error("Date parsing error:", e);
        return new Date();
    }
}

async function loadActivities() {
    showLoading(true);
    try {
        const query = document.getElementById('searchInput').value;
        const month = document.getElementById('monthFilter').value;
        const year = document.getElementById('yearFilter').value;
        const tag = document.getElementById('tagFilter').value;
        
        const params = new URLSearchParams();
        params.append('action', 'getActivities');
        if (query) params.append('query', query);
        if (month) params.append('month', month);
        if (year) params.append('year', year);
        if (tag) params.append('tag', tag);
        
        // ส่ง Token ไปด้วยเสมอถ้ามีการล็อกอินอยู่ เพื่อให้ระบบฝั่ง Apps Script คืนค่าข้อมูลแบบร่าง (Draft) กลับมาด้วย
        const token = sessionStorage.getItem('adminToken');
        if (token && isLoggedIn) {
            params.append('token', token);
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(`${CONFIG.BASE_URL}?${params.toString()}`, {
            signal: controller.signal,
            mode: 'cors'
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const result = await response.json();
        
        if (result && result.success) {
            const activities = result.data || [];
            // Fix sorting using robust parser
            activities.sort((a, b) => parseDateCorrectly(b.date) - parseDateCorrectly(a.date));
            
            // Store ALL activities globally (for Admin use)
            globalActivities = activities;
            
            // ดักจับเฉพาะที่เผยแพร่เพื่อแสดงหน้าหลัก (ถ้าเป็นแอดมิน Google Sheets อาจส่งข้อมูลทั้งหมดมา)
            const publicActivities = globalActivities.filter(a => {
                // ป้องกันค่า Boolean ที่มาเป็น String 
                return a.isPublished === true || a.isPublished === 'true' || a.isPublished === 'TRUE' || a.isPublished === 1;
            });
            
            // Display on Main Grid
            displayActivities(publicActivities);
            
            // Admin always gets full list
            if (isLoggedIn) loadAdminData();

            // Check for pending deep link
            if (window.pendingActivityId) {
                const found = globalActivities.find(a => a.id === window.pendingActivityId);
                if (found) {
                    openActivityDetail(window.pendingActivityId);
                }
                window.pendingActivityId = null;
            }
            
        } else {
            throw new Error(result?.error || 'Invalid response from server');
        }
    } catch (error) {
        console.error('Google Apps Script connection failed:', error.message);
        globalActivities = [];
        currentActivities = [];
        displayActivities([]);
        showErrorNotification();
    } finally {
        showLoading(false);
    }
}

function showErrorNotification() {
     if (document.querySelector('.error-notice')) document.querySelector('.error-notice').remove();
        const notice = document.createElement('div');
        notice.className = 'error-notice';
        notice.style.cssText = `position: fixed; top: 80px; right: 20px; background: rgba(220, 53, 69, 0.9); color: white; padding: 12px 20px; border-radius: 10px; font-size: 0.9rem; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.15); backdrop-filter: blur(10px); border: 1px solid rgba(220, 53, 69, 0.3);`;
        notice.innerHTML = `<i class="fas fa-exclamation-triangle" style="margin-right: 8px;"></i> ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้`;
        document.body.appendChild(notice);
        setTimeout(() => { if (notice.parentNode) notice.remove(); }, 8000);
}

function displayActivities(activities) {
    const grid = document.getElementById('activitiesGrid');
    
    // Pagination logic
    totalPages = Math.ceil(activities.length / CONFIG.ITEMS_PER_PAGE);
    if (totalPages === 0) totalPages = 1;
    
    // Adjust current page if out of bounds
    if (currentPage > totalPages) currentPage = totalPages;
    
    const startIndex = (currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
    const endIndex = startIndex + CONFIG.ITEMS_PER_PAGE;
    const pageActivities = activities.slice(startIndex, endIndex);
    
    // Set current displayed activities (filtered set)
    currentActivities = activities;
    
    updateTagFilter(activities);
    
    if (pageActivities.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem; color: var(--text-muted);">
                <i class="fas fa-search" style="font-size: 4rem; margin-bottom: 1.5rem; opacity: 0.3; color: var(--primary-color)"></i>
                <h3 style="font-size: 1.5rem; margin-bottom: 0.5rem; color: var(--primary-dark);">ไม่พบกิจกรรมที่ค้นหา</h3>
                <p>ลองเปลี่ยนคำค้นหาหรือตัวกรองใหม่</p>
            </div>
        `;
    } else {
        grid.innerHTML = pageActivities.map(activity => createActivityCard(activity)).join('');
        
        grid.querySelectorAll('.activity-card').forEach(card => {
            card.addEventListener('click', function(e) {
                if (e.target.closest('button')) {
                    const button = e.target.closest('button');
                    const action = button.getAttribute('data-action');
                    const id = button.getAttribute('data-id');
                    
                    // Handle View Counting & Actions
                    if (action === 'open-album') {
                        incrementView(id);
                        window.open(button.getAttribute('data-album-link'), '_blank');
                    } else if (action === 'view-image') {
                        incrementView(id);
                        openImageModal(button.getAttribute('data-image-url'));
                    } else if (action === 'share-activity') {
                        shareActivity(id);
                    }
                } else {
                    openActivityDetail(this.getAttribute('data-activity-id'));
                }
            });
        });
    }
    updatePagination();
}

function updateTagFilter(activities) {
    const tagFilter = document.getElementById('tagFilter');
    const currentValue = tagFilter.value;
    const allTags = new Set();
    activities.forEach(activity => {
        if (activity.tags) {
            activity.tags.split(',').map(t => t.trim()).filter(t => t).forEach(t => allTags.add(t));
        }
    });
    const sortedTags = Array.from(allTags).sort();
    tagFilter.innerHTML = '<option value="">ทุกแท็ก</option>';
    sortedTags.forEach(tag => {
        const option = document.createElement('option');
        option.value = tag;
        option.textContent = tag;
        tagFilter.appendChild(option);
    });
    if (currentValue && sortedTags.includes(currentValue)) tagFilter.value = currentValue;
}

function createActivityCard(activity) {
    const tags = activity.tags ? activity.tags.split(',').slice(0, 3).map(tag => `<span class="tag">${tag.trim()}</span>`).join('') : '';
    
    // ใช้ parseDateCorrectly ที่แก้แล้ว
    const dateObj = parseDateCorrectly(activity.date);

    const day = dateObj.getDate();
    const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const month = monthNames[dateObj.getMonth()];
    
    const viewCount = activity.views || 0;

    return `
        <div class="activity-card" data-activity-id="${activity.id}">
            <div class="card-image-wrapper">
                <div class="date-badge">
                    <span class="day">${day}</span>
                    <span class="month">${month}</span>
                </div>
                <div class="view-count-badge" id="view-badge-${activity.id}">
                    <i class="fas fa-eye"></i> <span>${viewCount}</span>
                </div>
                <img src="${activity.imageUrl}" alt="${activity.title}" class="activity-image">
            </div>
            
            <div class="activity-content">
                <div class="activity-tags">${tags}</div>
                <h3 class="activity-title">${activity.title}</h3>
                <p class="activity-description">${activity.description}</p>
            </div>
            
            <div class="card-footer">
                <div class="photographer-info">
                    ${activity.photographer ? `<i class="fas fa-camera"></i> ${activity.photographer}` : ''}
                </div>
                <div class="activity-actions">
                    <button class="btn-icon-action" data-action="view-image" data-id="${activity.id}" data-image-url="${activity.imageUrl}" title="ดูรูป">
                        <i class="fas fa-search-plus"></i>
                    </button>
                    <button class="btn-icon-action" data-action="open-album" data-id="${activity.id}" data-album-link="${activity.albumLink}" title="อัลบั้มเต็ม">
                        <i class="fas fa-external-link-alt"></i>
                    </button>
                     <button class="btn-icon-action" data-action="share-activity" data-id="${activity.id}" title="แชร์กิจกรรม">
                        <i class="fas fa-share-alt"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Real-time Increment View Function
function incrementView(id) {
    const activity = globalActivities.find(a => a.id === id);
    if (activity) {
        if (!activity.views) activity.views = 0;
        activity.views++;
        
        const badgeElement = document.getElementById(`view-badge-${id}`);
        if (badgeElement) {
            badgeElement.querySelector('span').textContent = activity.views;
            badgeElement.classList.add('view-count-update');
            setTimeout(() => badgeElement.classList.remove('view-count-update'), 300);
        }
    }

    const formData = new FormData();
    formData.append('action', 'incrementView');
    formData.append('id', id);
    
    fetch(CONFIG.BASE_URL, {
        method: 'POST',
        body: formData,
        mode: 'no-cors' 
    }).catch(err => console.log('View count error', err));
}

// Share Logic
function shareActivity(id) {
    const activity = globalActivities.find(a => a.id === id);
    const title = activity ? activity.title : 'กิจกรรมโรงเรียน';
    const currentUrl = window.location.href.split('?')[0];
    const shareUrl = `${currentUrl}?activityId=${id}`;

    Swal.fire({
        title: 'แชร์กิจกรรมนี้',
        html: `
            <p style="margin-bottom: 20px; font-size: 0.9rem; color: #666;">${title}</p>
            <div class="share-grid">
                <div class="share-item" onclick="handleSocialShare('copy', '${shareUrl}')">
                    <div class="share-icon share-copy"><i class="fas fa-link"></i></div>
                    <span class="share-label">คัดลอกลิงก์</span>
                </div>
                <div class="share-item" onclick="handleSocialShare('facebook', '${shareUrl}')">
                    <div class="share-icon share-fb"><i class="fab fa-facebook-f"></i></div>
                    <span class="share-label">Facebook</span>
                </div>
                 <div class="share-item" onclick="handleSocialShare('instagram', '${shareUrl}')">
                    <div class="share-icon share-ig"><i class="fab fa-instagram"></i></div>
                    <span class="share-label">Instagram</span>
                </div>
                <div class="share-item" onclick="handleSocialShare('line', '${shareUrl}')">
                    <div class="share-icon share-line"><i class="fab fa-line"></i></div>
                    <span class="share-label">Line</span>
                </div>
                <div class="share-item" onclick="handleSocialShare('tiktok', '${shareUrl}')">
                    <div class="share-icon share-tiktok"><i class="fab fa-tiktok"></i></div>
                    <span class="share-label">TikTok</span>
                </div>
            </div>
        `,
        showConfirmButton: false,
        showCloseButton: true,
        customClass: { popup: 'share-popup' }
    });
}

window.handleSocialShare = function(platform, url, title = '') {
    let shareLink = '';
    
    switch(platform) {
        case 'facebook': shareLink = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`; break;
        case 'line': shareLink = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`; break;
        case 'twitter': shareLink = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`; break;
        case 'copy':
        case 'instagram': 
        case 'tiktok':    
            navigator.clipboard.writeText(url).then(() => {
                const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                let msg = 'คัดลอกลิงก์แล้ว';
                if (platform === 'instagram') msg = 'คัดลอกลิงก์แล้ว (นำไปวางใน IG ได้เลย)';
                if (platform === 'tiktok') msg = 'คัดลอกลิงก์แล้ว (นำไปวางใน TikTok ได้เลย)';
                Toast.fire({ icon: 'success', title: msg });
            });
            return; 
    }

    if(shareLink) window.open(shareLink, '_blank', 'width=600,height=400');
};

function openImageModal(imageUrl) {
    const modalImage = document.getElementById('modalImage');
    modalImage.src = imageUrl;
    document.getElementById('imageModal').style.display = 'block';
    currentZoom = 1;
    modalImage.style.transform = 'scale(1) translate(0, 0)';
    updateZoomInfo();
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('imageModal').style.display = 'none';
    currentZoom = 1;
    document.getElementById('modalImage').style.transform = 'scale(1) translate(0, 0)';
    document.body.style.overflow = 'auto';
}

function zoomIn() { if (currentZoom < 5) { currentZoom += 0.25; applyZoom(); } }
function zoomOut() { if (currentZoom > 0.25) { currentZoom -= 0.25; applyZoom(); } }
function resetZoom() { currentZoom = 1; document.getElementById('modalImage').style.transform = 'scale(1) translate(0, 0)'; updateZoomInfo(); }
function applyZoom() {
    const modalImage = document.getElementById('modalImage');
    const currentTransform = modalImage.style.transform;
    const translateMatch = currentTransform.match(/translate\(([^)]+)\)/);
    const translateValue = translateMatch ? translateMatch[1] : '0, 0';
    modalImage.style.transform = `scale(${currentZoom}) translate(${translateValue})`;
    updateZoomInfo();
}
function updateZoomInfo() { document.getElementById('zoomInfo').textContent = Math.round(currentZoom * 100) + '%'; }
function handleWheelZoom(e) { e.preventDefault(); e.deltaY < 0 ? zoomIn() : zoomOut(); }

function setupImageDrag() {
    const modalImage = document.getElementById('modalImage');
    modalImage.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);
    modalImage.addEventListener('touchstart', startDragTouch);
    document.addEventListener('touchmove', dragTouch);
    document.addEventListener('touchend', endDrag);
}

function startDrag(e) {
    if (currentZoom <= 1) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const modalImage = document.getElementById('modalImage');
    const transform = modalImage.style.transform;
    const translateMatch = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
    if (translateMatch) { imageStartX = parseFloat(translateMatch[1]) || 0; imageStartY = parseFloat(translateMatch[2]) || 0; }
    else { imageStartX = 0; imageStartY = 0; }
    e.preventDefault();
}

function startDragTouch(e) {
    if (currentZoom <= 1) return;
    isDragging = true;
    const touch = e.touches[0];
    dragStartX = touch.clientX;
    dragStartY = touch.clientY;
    const modalImage = document.getElementById('modalImage');
    const transform = modalImage.style.transform;
    const translateMatch = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
    if (translateMatch) { imageStartX = parseFloat(translateMatch[1]) || 0; imageStartY = parseFloat(translateMatch[2]) || 0; }
    else { imageStartX = 0; imageStartY = 0; }
    e.preventDefault();
}

function drag(e) {
    if (!isDragging || currentZoom <= 1) return;
    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;
    const modalImage = document.getElementById('modalImage');
    modalImage.style.transform = `scale(${currentZoom}) translate(${imageStartX + deltaX}px, ${imageStartY + deltaY}px)`;
    e.preventDefault();
}

function dragTouch(e) {
    if (!isDragging || currentZoom <= 1) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - dragStartX;
    const deltaY = touch.clientY - dragStartY;
    const modalImage = document.getElementById('modalImage');
    modalImage.style.transform = `scale(${currentZoom}) translate(${imageStartX + deltaX}px, ${imageStartY + deltaY}px)`;
    e.preventDefault();
}

function endDrag() { isDragging = false; }

function openActivityDetail(activityId) {
    incrementView(activityId);

    const activity = globalActivities.find(a => a.id === activityId);
    if (!activity) return;
    
    const dateObj = parseDateCorrectly(activity.date);
    const dateStr = dateObj.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    
    const tagsHtml = activity.tags ? activity.tags.split(',').map(tag => 
        `<span class="activity-detail-tag"><i class="fas fa-hashtag"></i> ${tag.trim()}</span>`
    ).join('') : '';
    
    const photographerHtml = activity.photographer ? 
        `<span><i class="fas fa-camera"></i> ภาพโดย: ${activity.photographer}</span>` : '';

    const modalContent = `
        <div class="activity-detail-header">
            <img src="${activity.imageUrl}" alt="${activity.title}" class="activity-detail-image">
            <div class="activity-detail-overlay">
                <div class="activity-detail-title-wrapper">
                    <h2 class="activity-detail-title">${activity.title}</h2>
                    <div class="activity-detail-meta">
                        <span><i class="fas fa-calendar-alt"></i> ${dateStr}</span>
                        ${photographerHtml}
                    </div>
                </div>
            </div>
        </div>
        <div class="activity-detail-body">
            <div class="activity-detail-description">${activity.description}</div>
            
            ${tagsHtml ? `<div class="activity-detail-tags">${tagsHtml}</div>` : ''}
            
            <div class="activity-detail-actions">
                <button class="btn btn-primary" onclick="window.open('${activity.albumLink}', '_blank'); incrementView('${activity.id}')">
                    <i class="fas fa-images"></i> ดูอัลบั้มรูปภาพทั้งหมด
                </button>
                <button class="btn btn-secondary" onclick="shareActivity('${activity.id}')">
                    <i class="fas fa-share-alt"></i> แชร์กิจกรรม
                </button>
            </div>
        </div>
    `;
    document.getElementById('activityModalContent').innerHTML = modalContent;
    document.getElementById('activityModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeActivityModal() {
    document.getElementById('activityModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

function updatePagination() {
    document.getElementById('prevBtn').disabled = currentPage <= 1;
    document.getElementById('nextBtn').disabled = currentPage >= totalPages;
    document.getElementById('pageInfo').textContent = `หน้า ${currentPage} จาก ${totalPages}`;
}

function changePage(page) {
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        displayActivities(currentActivities); 
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function handleSearch() {
    currentPage = 1;
    loadActivities();
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

// Authentication
function showLoginForm() { document.getElementById('loginSection').style.display = 'block'; }
function hideLoginForm() { document.getElementById('loginSection').style.display = 'none'; document.getElementById('loginForm').reset(); }

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    Swal.fire({
        title: 'กำลังเข้าสู่ระบบ...',
        text: 'กรุณารรอสักครู่',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const params = new URLSearchParams();
        params.append('action', 'login');
        params.append('username', username);
        params.append('password', password);
        
        const response = await fetch(`${CONFIG.BASE_URL}?${params.toString()}`, {
            signal: controller.signal,
            mode: 'cors',
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        
        if (result && result.success) {
            sessionStorage.setItem('adminToken', result.token);
            isLoggedIn = true;
            hideLoginForm();
            showAdminInterface();
            
            // เรียกโหลดข้อมูลใหม่ทั้งหมดทันทีหลัง Login เพื่อให้ได้ข้อมูล Draft มาด้วย
            loadActivities(); 
            
            Swal.fire({ icon: 'success', title: 'เข้าสู่ระบบสำเร็จ', timer: 2000, showConfirmButton: false });
        } else {
            throw new Error(result?.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        }
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: error.message });
    }
}

function logout() {
    Swal.fire({
        title: 'ยืนยันการออกจากระบบ',
        text: "คุณต้องการออกจากระบบใช่หรือไม่?",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ใช่, ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            sessionStorage.removeItem('adminToken');
            isLoggedIn = false;
            hideAdminInterface();
            loadActivities(); 
            Swal.fire({
                title: 'ออกจากระบบสำเร็จ!',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            });
        }
    });
}

function showAdminInterface() {
    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('logoutBtn').style.display = 'inline-flex';
    
    document.querySelector('.search-section').style.display = 'none';
    document.querySelector('.activities-section').style.display = 'none';
    
    document.getElementById('adminSection').style.display = 'block';
    
    window.scrollTo(0, 0);
}

function hideAdminInterface() {
    document.getElementById('loginBtn').style.display = 'inline-flex';
    document.getElementById('logoutBtn').style.display = 'none';
    
    document.querySelector('.search-section').style.display = ''; 
    document.querySelector('.activities-section').style.display = ''; 
    
    document.getElementById('adminSection').style.display = 'none';
}

function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const icon = document.getElementById('togglePassword').querySelector('i');
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        passwordInput.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

function loadAdminData() {
    const tbody = document.getElementById('adminTableBody');
    
    let activities = [...globalActivities];
    activities.sort((a, b) => parseDateCorrectly(b.date) - parseDateCorrectly(a.date));
    
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 2rem; color: #666;"><i class="fas fa-spinner fa-spin" style="margin-right: 8px; color: var(--primary-color);"></i> กำลังโหลดข้อมูล...</td></tr>`;
    
    setTimeout(() => {
        if (activities.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 2rem; color: #666;">ยังไม่มีกิจกรรมในระบบ <br> <small>คลิก "เพิ่มกิจกรรม" เพื่อเริ่มต้น</small></td></tr>`;
            document.getElementById('adminTotalCount').textContent = '0';
        } else {
            tbody.innerHTML = activities.map((activity, index) => {
                
                const activityDate = parseDateCorrectly(activity.date);
                const thaiDate = activityDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
                const year = activityDate.getFullYear();
                
                // ป้องกัน Error หากข้อมูล Description, Title ว่าง (null/undefined)
                const desc = activity.description || '';
                const title = activity.title || 'ไม่มีชื่อกิจกรรม';
                const tags = activity.tags || '-';
                
                // แปลงค่า Boolean ให้ชัวร์ 100% ว่าเป็นสถานะอะไร
                const isPublished = (activity.isPublished === true || activity.isPublished === 'true' || activity.isPublished === 'TRUE' || activity.isPublished === 1);
                
                return `
                <tr style="animation: fadeIn 0.3s ease-in-out ${index * 0.05}s both;" data-status="${isPublished ? 'published' : 'draft'}" data-year="${year}">
                    <td>
                        <div class="admin-title-text" style="font-weight: 500; color: var(--primary-dark); margin-bottom: 4px;">${title}</div>
                        <small style="color: var(--text-muted);">${desc.substring(0, 50)}${desc.length > 50 ? '...' : ''}</small>
                    </td>
                    <td>
                        <div style="font-size: 0.9rem; color: var(--text-main); margin-bottom: 4px;"><i class="fas fa-calendar-alt" style="color: var(--primary-color); margin-right: 5px;"></i> ${thaiDate}</div>
                        <small class="admin-tags-text" style="color: var(--text-muted); background: #f8fbff; padding: 2px 8px; border-radius: 6px; font-size: 0.8rem; display: inline-block;">${tags}</small>
                    </td>
                    <td>
                        <span class="status-badge ${isPublished ? 'status-published' : 'status-draft'}">
                            <i class="fas fa-${isPublished ? 'check-circle' : 'circle'}" style="margin-right: 4px;"></i>
                            ${isPublished ? 'เผยแพร่' : 'แบบร่าง'}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-icon btn-edit" onclick="editActivity('${activity.id}')" title="แก้ไข">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon btn-toggle" onclick="togglePublish('${activity.id}')" title="${isPublished ? 'ซ่อน' : 'เผยแพร่'}">
                                <i class="fas fa-${isPublished ? 'eye-slash' : 'eye'}"></i>
                            </button>
                            <button class="btn-icon btn-delete" onclick="deleteActivity('${activity.id}')" title="ลบ">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            }).join('');
            
            document.getElementById('adminTotalCount').textContent = activities.length;
            filterAdminActivities();
        }
    }, 300);
}

const style = document.createElement('style');
style.textContent = `@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`;
document.head.appendChild(style);

function switchImageTab(mode, prefix = '') {
    const tabUrl = document.getElementById(prefix + 'tabUrl');
    const tabUpload = document.getElementById(prefix + 'tabUpload');
    const inputUrlGroup = document.getElementById(prefix + 'inputUrlGroup');
    const inputUploadGroup = document.getElementById(prefix + 'inputUploadGroup');
    
    if (mode === 'url') {
        tabUrl.classList.add('active');
        tabUpload.classList.remove('active');
        inputUrlGroup.style.display = 'block';
        inputUploadGroup.style.display = 'none';
    } else {
        tabUpload.classList.add('active');
        tabUrl.classList.remove('active');
        inputUploadGroup.style.display = 'block';
        inputUrlGroup.style.display = 'none';
    }
}

function createThaiDateSelectors(prefix, defaultDateStr = null) {
    let day = new Date().getDate();
    let month = new Date().getMonth() + 1; // 1-12
    let year = new Date().getFullYear();
    
    if (defaultDateStr) {
         const dateParts = defaultDateStr.split('/');
         if (dateParts.length === 3) {
             day = parseInt(dateParts[0]);
             month = parseInt(dateParts[1]);
             year = parseInt(dateParts[2]);
         } else {
             const oldParts = defaultDateStr.split('-');
             if (oldParts.length >= 3) {
                 year = parseInt(oldParts[0]);
                 month = parseInt(oldParts[1]);
                 day = parseInt(oldParts[2]);
             }
         }
    }

    const currentYearBE = new Date().getFullYear() + 543;
    
    let dayOptions = '<option value="">วัน</option>';
    for(let i=1; i<=31; i++) {
        dayOptions += `<option value="${i}" ${i === day ? 'selected' : ''}>${i}</option>`;
    }
    
    const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    let monthOptions = '<option value="">เดือน</option>';
    thaiMonths.forEach((m, index) => {
        const val = index + 1;
        monthOptions += `<option value="${val}" ${val === month ? 'selected' : ''}>${m}</option>`;
    });
    
    let yearOptions = '<option value="">ปี พ.ศ.</option>';
    const startYear = currentYearBE - 10;
    const endYear = currentYearBE + 2;
    const targetYearBE = year + 543;
    
    for(let y=endYear; y>=startYear; y--) {
        yearOptions += `<option value="${y}" ${y === targetYearBE ? 'selected' : ''}>${y}</option>`;
    }
    
    return `
        <div class="date-selector-group">
            <select id="${prefix}Day" class="date-select date-select-day">${dayOptions}</select>
            <select id="${prefix}Month" class="date-select date-select-month">${monthOptions}</select>
            <select id="${prefix}Year" class="date-select date-select-year">${yearOptions}</select>
        </div>
    `;
}

// แก้ไข: ให้ส่งค่าออกไปเป็น YYYY-MM-DD เสมอ เพื่อให้ Sheets จัดการได้ถูกต้อง
function getValFromThaiDateSelectors(prefix) {
    const d = document.getElementById(prefix + 'Day').value;
    const m = document.getElementById(prefix + 'Month').value;
    const yBE = document.getElementById(prefix + 'Year').value;
    
    if(!d || !m || !yBE) return null;
    
    const yAD = parseInt(yBE) - 543;
    const dd = d.toString().padStart(2, '0');
    const mm = m.toString().padStart(2, '0');
    
    // ส่งรูปแบบสากลเข้า Google Sheets กัน Google ปรับวัน/เดือนสลับกัน
    return `${yAD}-${mm}-${dd}`;
}

async function uploadFileToDrive(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async function() {
            try {
                const token = sessionStorage.getItem('adminToken');
                const base64Data = reader.result; 
                
                const payload = {
                    action: 'uploadImage',
                    token: token,
                    image: base64Data,
                    filename: file.name
                };

                const response = await fetch(CONFIG.BASE_URL, {
                    method: 'POST',
                    body: JSON.stringify(payload),
                    headers: { "Content-Type": "text/plain;charset=utf-8" } 
                });

                if (!response.ok) throw new Error('Network error');
                const result = await response.json();
                
                if (result.success) {
                    resolve(result.imageUrl);
                } else {
                    reject(new Error(result.error || 'Upload failed'));
                }
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = error => reject(error);
    });
}

function showAddActivityForm() {
    Swal.fire({
        title: 'เพิ่มกิจกรรมใหม่',
        html: `
            <div style="text-align: left;">
                <div class="form-group"><label>หัวข้อกิจกรรม</label><input type="text" id="actTitle" class="form-input" required placeholder="ระบุชื่อกิจกรรม"></div>
                
                <!-- Image Upload Section -->
                <div class="image-option-tabs">
                    <button type="button" class="btn-tab active" id="add_tabUrl">ใช้ลิงก์</button>
                    <button type="button" class="btn-tab" id="add_tabUpload">อัปโหลดรูป</button>
                </div>
                <div id="add_inputUrlGroup">
                    <label>URL รูปภาพปก</label>
                    <input type="text" id="actImageUrl" class="form-input" placeholder="วางลิงก์ Google Drive หรือ ID">
                </div>
                <div id="add_inputUploadGroup" style="display:none;">
                    <label>เลือกไฟล์รูปภาพ</label>
                    <input type="file" id="actImageFile" class="form-input" accept="image/*">
                    <div id="add_uploadPreview" style="margin-top:10px; text-align:center;"></div>
                </div>
                <!-- End Image Upload Section -->

                <div class="form-group" style="margin-top:15px;"><label>รายละเอียด</label><textarea id="actDescription" class="form-input" rows="3" required placeholder="รายละเอียดโดยย่อ"></textarea></div>
                <div class="form-group"><label>ลิงก์อัลบั้มเต็ม (Facebook/Drive)</label><input type="url" id="actAlbumLink" class="form-input" required placeholder="https://..."></div>
                
                <div class="form-group">
                    <label>วันที่จัดกิจกรรม (วัน/เดือน/ปี พ.ศ.)</label>
                    ${createThaiDateSelectors('add_')}
                </div>
                
                <div class="form-group"><label>ภาพถ่ายโดย</label><input type="text" id="actPhotographer" class="form-input" placeholder="ระบุชื่อช่างภาพ (ไม่บังคับ)"></div>
                <div class="form-group"><label>แท็ก (คั่นด้วยจุลภาค ,)</label><input type="text" id="actTags" class="form-input" placeholder="เช่น กีฬา, วิชาการ"></div>
                
                <div class="form-group">
                     <label style="margin-bottom: 5px;">สถานะการเผยแพร่</label>
                     <div class="switch-wrapper">
                        <label class="switch">
                            <input type="checkbox" id="actPublished" checked>
                            <span class="slider"></span>
                        </label>
                        <span class="switch-label">เผยแพร่ทันที</span>
                    </div>
                </div>
            </div>
        `,
        showCancelButton: true, confirmButtonText: 'บันทึกข้อมูล', cancelButtonText: 'ยกเลิก', width: '600px',
        padding: '2rem',
        customClass: {
            input: 'my-swal-input',
            popup: 'my-swal-popup'
        },
        didOpen: () => {
            document.getElementById('add_tabUrl').addEventListener('click', () => switchImageTab('url', 'add_'));
            document.getElementById('add_tabUpload').addEventListener('click', () => switchImageTab('upload', 'add_'));
            
            document.getElementById('actImageFile').addEventListener('change', function() {
                const file = this.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        document.getElementById('add_uploadPreview').innerHTML = `<img src="${e.target.result}" style="max-height:150px; border-radius:12px; border:2px solid #e6f2ff;">`;
                    }
                    reader.readAsDataURL(file);
                } else {
                    document.getElementById('add_uploadPreview').innerHTML = '';
                }
            });
        },
        preConfirm: async () => {
            const title = document.getElementById('actTitle').value;
            const description = document.getElementById('actDescription').value;
            const albumLink = document.getElementById('actAlbumLink').value;
            
            const date = getValFromThaiDateSelectors('add_');
            
            const photographer = document.getElementById('actPhotographer').value;
            const tags = document.getElementById('actTags').value;
            const isPublished = document.getElementById('actPublished').checked;
            
            let imageUrl = '';
            const isUploadMode = document.getElementById('add_tabUpload').classList.contains('active');
            
            if (isUploadMode) {
                const fileInput = document.getElementById('actImageFile');
                if (fileInput.files.length > 0) {
                    try {
                        Swal.showLoading(); 
                        imageUrl = await uploadFileToDrive(fileInput.files[0]);
                    } catch (e) {
                        Swal.showValidationMessage('อัปโหลดรูปภาพไม่สำเร็จ: ' + e.message);
                        return false;
                    }
                } else {
                    Swal.showValidationMessage('กรุณาเลือกไฟล์รูปภาพ');
                    return false;
                }
            } else {
                imageUrl = document.getElementById('actImageUrl').value;
                if (!imageUrl) {
                    Swal.showValidationMessage('กรุณาระบุ URL รูปภาพ');
                    return false;
                }
            }

            if (!title || !description || !imageUrl || !albumLink || !date) { Swal.showValidationMessage('กรุณากรอกข้อมูลให้ครบถ้วน'); return false; }
            
            if (!isUploadMode) {
                const driveMatch = imageUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (driveMatch) {
                    imageUrl = '[https://lh3.googleusercontent.com/d/](https://lh3.googleusercontent.com/d/)' + driveMatch[1];
                } else if (!imageUrl.startsWith('http') && imageUrl.length > 0) {
                    imageUrl = '[https://lh3.googleusercontent.com/d/](https://lh3.googleusercontent.com/d/)' + imageUrl;
                }
            }

            return { title, description, imageUrl, albumLink, date, photographer, tags, isPublished };
        }
    }).then((result) => { if (result.isConfirmed) addActivity(result.value); });
}

async function addActivity(data) {
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const token = sessionStorage.getItem('adminToken');
        const formData = new FormData(); 
        formData.append('action', 'addActivity');
        formData.append('token', token);
        formData.append('id', 'act_' + Date.now());
        Object.keys(data).forEach(key => formData.append(key, data[key]));
        
        const response = await fetch(CONFIG.BASE_URL, { method: 'POST', body: formData });
        if (response.ok) {
            await loadActivities();
            Swal.fire({ icon: 'success', title: 'เพิ่มสำเร็จ', timer: 1500, showConfirmButton: false });
        } else throw new Error('Server error');
    } catch (error) { Swal.fire({ icon: 'error', title: 'ไม่สามารถเพิ่มข้อมูลได้', text: error.message }); }
}

// === แก้ไขฟังก์ชัน EditActivity ที่บั๊กและโค้ดซ้ำซ้อน ===
function editActivity(id) {
    // ค้นหา Activity จาก array ส่วนกลาง
    const activity = globalActivities.find(a => a.id === id);
    if (!activity) {
        Swal.fire({ icon: 'error', title: 'ไม่พบข้อมูลกิจกรรม' });
        return;
    }

    // แปลงวันที่สำหรับให้ Dropdown ทำงานได้
    const d = parseDateCorrectly(activity.date);
    // สร้างรูปแบบ DD/MM/YYYY ตามที่ UI ต้องการเริ่มต้น
    const localDateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    
    // ดึงสถานะการเผยแพร่แบบชัวร์ๆ
    const isPub = (activity.isPublished === true || activity.isPublished === 'true' || activity.isPublished === 'TRUE' || activity.isPublished === 1);
    
    Swal.fire({
        title: 'แก้ไขกิจกรรม',
        html: `
            <div style="text-align: left;">
                <div class="form-group"><label>หัวข้อกิจกรรม</label><input type="text" id="editTitle" class="form-input" value="${activity.title || ''}" required></div>
                
                <!-- Image Upload Section -->
                <div class="image-option-tabs">
                    <button type="button" class="btn-tab active" id="edit_tabUrl">ใช้ลิงก์</button>
                    <button type="button" class="btn-tab" id="edit_tabUpload">อัปโหลดรูป</button>
                </div>
                <div id="edit_inputUrlGroup">
                    <label>URL รูปภาพปก</label>
                    <input type="text" id="editImageUrl" class="form-input" value="${activity.imageUrl || ''}" required>
                </div>
                <div id="edit_inputUploadGroup" style="display:none;">
                    <label>เลือกไฟล์รูปภาพ (หากต้องการเปลี่ยน)</label>
                    <input type="file" id="editImageFile" class="form-input" accept="image/*">
                    <div id="edit_uploadPreview" style="margin-top:10px; text-align:center;"></div>
                </div>
                <!-- End Image Upload Section -->

                <div class="form-group" style="margin-top:15px;"><label>รายละเอียด</label><textarea id="editDescription" class="form-input" rows="3" required>${activity.description || ''}</textarea></div>
                <div class="form-group"><label>ลิงก์อัลบั้มเต็ม</label><input type="url" id="editAlbumLink" class="form-input" value="${activity.albumLink || ''}" required></div>
                
                <!-- วันที่ -->
                <div class="form-group">
                    <label>วันที่ (วัน/เดือน/ปี พ.ศ.)</label>
                     ${createThaiDateSelectors('edit_', localDateStr)}
                </div>
                
                <div class="form-group"><label>ภาพถ่ายโดย</label><input type="text" id="editPhotographer" class="form-input" value="${activity.photographer || ''}"></div>
                <div class="form-group"><label>แท็ก</label><input type="text" id="editTags" class="form-input" value="${activity.tags || ''}"></div>
                
                <div class="form-group">
                     <label style="margin-bottom: 5px;">สถานะการเผยแพร่</label>
                     <div class="switch-wrapper">
                        <label class="switch">
                            <input type="checkbox" id="editPublished" ${isPub ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                        <span class="switch-label">เผยแพร่บนหน้าเว็บ</span>
                    </div>
                </div>
            </div>
        `,
        showCancelButton: true, 
        confirmButtonText: 'บันทึกการแก้ไข', 
        cancelButtonText: 'ยกเลิก',
        width: '600px',
        padding: '2rem',
        didOpen: () => {
            document.getElementById('edit_tabUrl').addEventListener('click', () => switchImageTab('url', 'edit_'));
            document.getElementById('edit_tabUpload').addEventListener('click', () => switchImageTab('upload', 'edit_'));
            
            document.getElementById('editImageFile').addEventListener('change', function() {
                const file = this.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        document.getElementById('edit_uploadPreview').innerHTML = `<img src="${e.target.result}" style="max-height:150px; border-radius:12px; border:2px solid #e6f2ff;">`;
                    }
                    reader.readAsDataURL(file);
                } else {
                    document.getElementById('edit_uploadPreview').innerHTML = '';
                }
            });
        },
        preConfirm: async () => {
            const title = document.getElementById('editTitle').value;
            const description = document.getElementById('editDescription').value;
            const albumLink = document.getElementById('editAlbumLink').value;
            
            const date = getValFromThaiDateSelectors('edit_');
            
            const photographer = document.getElementById('editPhotographer').value;
            const tags = document.getElementById('editTags').value;
            const isPublished = document.getElementById('editPublished').checked;

            if (!date) {
                 Swal.showValidationMessage('กรุณาระบุวันที่ให้ครบถ้วน');
                 return false;
            }

            let imageUrl = '';
            const isUploadMode = document.getElementById('edit_tabUpload').classList.contains('active');
            
            if (isUploadMode) {
                const fileInput = document.getElementById('editImageFile');
                if (fileInput.files.length > 0) {
                    try {
                        Swal.showLoading(); 
                        imageUrl = await uploadFileToDrive(fileInput.files[0]);
                    } catch (e) {
                        Swal.showValidationMessage('อัปโหลดรูปภาพไม่สำเร็จ: ' + e.message);
                        return false;
                    }
                } else {
                    imageUrl = activity.imageUrl; 
                }
            } else {
                imageUrl = document.getElementById('editImageUrl').value;
            }

            if (!imageUrl.startsWith('data:')) { 
                const driveMatch = imageUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (driveMatch) {
                    imageUrl = '[https://lh3.googleusercontent.com/d/](https://lh3.googleusercontent.com/d/)' + driveMatch[1];
                } else if (!imageUrl.startsWith('http') && imageUrl.length > 0) {
                    imageUrl = '[https://lh3.googleusercontent.com/d/](https://lh3.googleusercontent.com/d/)' + imageUrl;
                }
            }
            
            const data = { title, description, imageUrl, albumLink, date, photographer, tags, isPublished };

            return data;
        }
    }).then((result) => { 
        if (result.isConfirmed && result.value) { 
            updateActivity(id, result.value); 
        } 
    });
}

async function updateActivity(id, data) {
    Swal.fire({ title: 'กำลังแก้ไข...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const token = sessionStorage.getItem('adminToken');
        const formData = new FormData();
        formData.append('action', 'updateActivity');
        formData.append('token', token);
        formData.append('id', id);
        Object.keys(data).forEach(key => formData.append(key, data[key]));
        
        const response = await fetch(CONFIG.BASE_URL, { method: 'POST', body: formData });
        if (response.ok) {
            await loadActivities();
            Swal.fire({ icon: 'success', title: 'แก้ไขสำเร็จ', timer: 1500, showConfirmButton: false });
        } else throw new Error('Server error');
    } catch (error) { Swal.fire({ icon: 'error', title: 'ไม่สามารถแก้ไขได้', text: error.message }); }
}

async function togglePublish(id) {
    const activity = globalActivities.find(a => a.id === id);
    
    // ป้องกัน Bug ค่า Boolean/String ของ Google Sheets
    const isPub = (activity.isPublished === true || activity.isPublished === 'true' || activity.isPublished === 'TRUE' || activity.isPublished === 1);
    const actionText = isPub ? 'ซ่อน' : 'เผยแพร่';
    
    Swal.fire({
        title: 'ยืนยันการเปลี่ยนสถานะ',
        text: `คุณต้องการ "${actionText}" กิจกรรมนี้ใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
             try {
                const token = sessionStorage.getItem('adminToken');
                const formData = new FormData();
                formData.append('action', 'togglePublish');
                formData.append('token', token);
                formData.append('id', id);
                
                const response = await fetch(CONFIG.BASE_URL, { method: 'POST', body: formData });
                if (response.ok) {
                    await loadActivities();
                    const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
                    Toast.fire({ icon: 'success', title: 'อัปเดตสถานะเรียบร้อย' });
                }
            } catch (error) { console.error(error); }
        }
    });
}

function deleteActivity(id) {
    Swal.fire({
        title: 'ยืนยันการลบ', 
        text: 'คุณต้องการลบกิจกรรมนี้หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้', 
        icon: 'warning',
        showCancelButton: true, 
        confirmButtonText: 'ลบข้อมูล', 
        cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            try {
                const token = sessionStorage.getItem('adminToken');
                const formData = new FormData();
                formData.append('action', 'deleteActivity');
                formData.append('token', token);
                formData.append('id', id);
                
                const response = await fetch(CONFIG.BASE_URL, { method: 'POST', body: formData });
                if (response.ok) {
                    await loadActivities();
                    Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false });
                }
            } catch (error) { Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: error.message }); }
        }
    });
}
