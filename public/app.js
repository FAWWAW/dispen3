// ===== API Configuration =====
// Same-origin API (bekerja di localhost dan Vercel)
const API_URL = '/api';

// Check if running via file:// protocol
if (window.location.protocol === 'file:') {
    alert('PERHATIAN: Aplikasi ini tidak akan berjalan dengan baik jika dibuka langsung dari file manager.\n\nSilakan jalankan server terlebih dahulu dan buka melalui URL server (bukan file://).');
}

// ===== School Location with Geofencing =====
const SCHOOL_LOCATION = {
    name: 'SMP 1 Kudus',
    latitude: -6.8057694,
    longitude: 110.8430016,
    radiusMeters: 100,
    mapsUrl: 'https://www.google.com/maps?q=-6.8057694,110.8430016'
};

// ===== API Functions =====

// Helper to handle fetch errors
async function fetchAPI(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            // Check if 429 (Too Many Requests)
            if (response.status === 429) {
                throw new Error('Jangan terburu-buru, coba lagi nanti.');
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Fetch error:', error);
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            showToast('Gagal terhubung ke server. Pastikan server berjalan!', 'danger');
        }
        throw error;
    }
}

// Get all dispensations
async function getDispensations() {
    try {
        return await fetchAPI(`${API_URL}/dispensations`);
    } catch (error) {
        return [];
    }
}

// Get dispensation by tracking code
async function getDispensationByCode(code) {
    try {
        const data = await fetchAPI(`${API_URL}/dispensations?trackingCode=${code}`);
        return data[0] || null;
    } catch (error) {
        return null;
    }
}

// Update dispensation status
async function updateDispensationStatus(id, status, approvedBy = null) {
    try {
        const update = { status };
        if (approvedBy) update.approvedBy = approvedBy;

        return await fetchAPI(`${API_URL}/dispensations/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(update)
        });
    } catch (error) {
        console.error('Error updating dispensation:', error);
        return null;
    }
}

// Mark as returned
async function markAsReturned(id) {
    try {
        return await fetchAPI(`${API_URL}/dispensations/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'completed',
                returnedAt: new Date().toISOString()
            })
        });
    } catch (error) {
        console.error('Error marking as returned:', error);
        return null;
    }
}

// Generate tracking code (client-side backup)
function generateTrackingCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'DSP-';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// ===== Teacher Authentication =====

async function teacherLogin(username, password) {
    try {
        const data = await fetchAPI(`${API_URL}/teachers?username=${username}&password=${password}`);

        if (data && data.length > 0) {
            localStorage.setItem('currentTeacher', JSON.stringify(data[0]));
            return data[0];
        }
        return null;
    } catch (error) {
        console.error('Login error:', error);
        return null;
    }
}

function teacherLogout() {
    localStorage.removeItem('currentTeacher');
    window.location.href = 'login.html';
}

function getCurrentTeacher() {
    const teacher = localStorage.getItem('currentTeacher');
    return teacher ? JSON.parse(teacher) : null;
}

function requireTeacherAuth() {
    const teacher = getCurrentTeacher();
    if (!teacher) {
        window.location.href = 'login.html';
        return null;
    }
    return teacher;
}

// ===== Time Utilities =====

function formatTime(date) {
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(date) {
    return date.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getTimeRemaining(targetTime) {
    const now = new Date();
    const target = new Date(targetTime);
    const diff = target - now;

    if (diff <= 0) {
        return { total: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return { total: diff, hours, minutes, seconds, expired: false };
}

function formatCountdown(remaining) {
    const h = String(remaining.hours).padStart(2, '0');
    const m = String(remaining.minutes).padStart(2, '0');
    const s = String(remaining.seconds).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

// ===== Clock Widget =====

function startClock(timeElementId, dateElementId) {
    function updateClock() {
        const now = new Date();
        const timeEl = document.getElementById(timeElementId);
        const dateEl = document.getElementById(dateElementId);

        if (timeEl) timeEl.textContent = formatTime(now);
        if (dateEl) dateEl.textContent = formatDate(now);
    }

    updateClock();
    setInterval(updateClock, 1000);
}

// ===== Reminder & Notification =====

let reminderInterval = null;
let notificationSent = false;

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function sendNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '🔔' });
    }
}

function startReminder(returnTime, onExpired) {
    const reminderThreshold = 5 * 60 * 1000;
    let warningShown = false;

    function checkReminder() {
        const remaining = getTimeRemaining(returnTime);

        const countdownEl = document.getElementById('countdown');
        const timerWidget = document.getElementById('timer-widget');

        if (countdownEl) {
            countdownEl.textContent = formatCountdown(remaining);
        }

        if (remaining.expired) {
            if (timerWidget) timerWidget.classList.add('warning');

            if (!notificationSent) {
                notificationSent = true;
                sendNotification('⚠️ Waktu Habis!', 'Waktu dispensasi sudah habis. Segera kembali ke sekolah!');
                playAlertSound();
                if (onExpired) onExpired();
            }
            return;
        }

        if (remaining.total <= reminderThreshold && !warningShown) {
            warningShown = true;
            if (timerWidget) timerWidget.classList.add('warning');
            sendNotification('⏰ Pengingat', 'Waktu dispensasi akan habis dalam 5 menit.');
            playAlertSound();
        }
    }

    if (reminderInterval) {
        clearInterval(reminderInterval);
    }

    checkReminder();
    reminderInterval = setInterval(checkReminder, 1000);
}

function stopReminder() {
    if (reminderInterval) {
        clearInterval(reminderInterval);
        reminderInterval = null;
    }
    notificationSent = false;
}

function playAlertSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.3;

        oscillator.start();
        setTimeout(() => oscillator.stop(), 200);
    } catch (e) {
        console.log('Audio not supported');
    }
}

// ===== Geolocation =====

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function isAtSchool(userLat, userLon) {
    const distance = calculateDistance(
        userLat, userLon,
        SCHOOL_LOCATION.latitude, SCHOOL_LOCATION.longitude
    );
    return {
        isWithinRadius: distance <= SCHOOL_LOCATION.radiusMeters,
        distance: Math.round(distance),
        requiredRadius: SCHOOL_LOCATION.radiusMeters
    };
}

function verifyLocationAndReturn(dispensationId, onSuccess, onFail, onLocationError) {
    if (!navigator.geolocation) {
        onLocationError('Browser tidak mendukung GPS.');
        return;
    }

    const loadingEl = document.getElementById('location-status');
    if (loadingEl) {
        loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memeriksa lokasi GPS...';
        loadingEl.className = 'alert alert-warning';
        loadingEl.classList.remove('hidden');
    }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const result = isAtSchool(position.coords.latitude, position.coords.longitude);

            if (result.isWithinRadius) {
                await markAsReturned(dispensationId);
                if (loadingEl) {
                    loadingEl.innerHTML = '<i class="fas fa-check-circle"></i> Lokasi terverifikasi! Anda di sekolah.';
                    loadingEl.className = 'alert alert-success';
                }
                onSuccess(result);
            } else {
                if (loadingEl) {
                    loadingEl.innerHTML = `<i class="fas fa-map-marker-alt"></i> Jarak: ${result.distance}m. Harus dalam ${result.requiredRadius}m.`;
                    loadingEl.className = 'alert alert-danger';
                }
                onFail(result);
            }
        },
        (error) => {
            let errorMsg = 'Gagal mendapatkan lokasi. ';
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg += 'Izinkan akses lokasi.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg += 'Lokasi tidak tersedia.';
                    break;
                case error.TIMEOUT:
                    errorMsg += 'Waktu habis.';
                    break;
                default:
                    errorMsg += 'Terjadi kesalahan.';
            }
            if (loadingEl) {
                loadingEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${errorMsg}`;
                loadingEl.className = 'alert alert-danger';
            }
            onLocationError(errorMsg);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

function openSchoolLocation() {
    window.open(SCHOOL_LOCATION.mapsUrl, '_blank');
}

function getDirectionsToSchool() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const origin = `${position.coords.latitude},${position.coords.longitude}`;
                const destination = `${SCHOOL_LOCATION.latitude},${SCHOOL_LOCATION.longitude}`;
                window.open(`https://www.google.com/maps/dir/${origin}/${destination}`, '_blank');
            },
            () => window.open(SCHOOL_LOCATION.mapsUrl, '_blank')
        );
    } else {
        window.open(SCHOOL_LOCATION.mapsUrl, '_blank');
    }
}

// ===== UI Helpers =====

function showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function hideModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function getStatusBadge(status) {
    const badges = {
        pending: '<span class="badge badge-pending"><i class="fas fa-clock"></i> Menunggu</span>',
        approved: '<span class="badge badge-approved"><i class="fas fa-check"></i> Disetujui</span>',
        rejected: '<span class="badge badge-rejected"><i class="fas fa-times"></i> Ditolak</span>',
        completed: '<span class="badge badge-completed"><i class="fas fa-flag-checkered"></i> Selesai</span>'
    };
    return badges[status] || status;
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `alert alert-${type}`;
    toast.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; max-width: 400px;';
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'danger' ? 'exclamation-circle' : 'info-circle'}"></i> ${message}`;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ===== Particles Generation =====

function createParticles(container, count = 30) {
    const particlesDiv = document.createElement('div');
    particlesDiv.className = 'particles';

    for (let i = 0; i < count; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 4 + 's';
        particle.style.animationDuration = (3 + Math.random() * 3) + 's';
        particlesDiv.appendChild(particle);
    }

    container.appendChild(particlesDiv);
}
