/**
 * [FILE: public/js/script.js]
 * 역할: 일반 사용자용 프론트엔드 로직 (타이머, 명단 조회, 신청/취소, 제목 업데이트)
 */

// ============================================================
// [1] 전역 변수 및 상태 관리
// ============================================================
let currentDay = 'WED'; 
let timerCache = {};    
let timerInterval = null; 

const els = {
    timerExercise: document.getElementById('timer-exercise'),
    timerGuest: document.getElementById('timer-guest'),
    timerLesson: document.getElementById('timer-lesson'),
    listExercise: document.getElementById('exercise-list'),
    listGuest: document.getElementById('guest-list'),
    listLesson: document.getElementById('lesson-list'),
    idInput: document.getElementById('user-id'),
    pwdInput: document.getElementById('user-pwd'),
    catSelect: document.getElementById('category-select'),
    guestNameInput: document.getElementById('guest-name-input'),
    // [추가] 제목 요소 (index.html의 <h4 class="title">)
    titleText: document.querySelector('.title') 
};


// ============================================================
// [2] 초기화 및 이벤트 리스너
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. 초기 데이터 로드
    fetchServerTimer(); 
    fetchStatus();      
    fetchSystemInfo(); // [추가] 제목(학기/주차) 가져오기!
    
    // 2. 주기적 동기화
    setInterval(fetchServerTimer, 10000); 

    // 3. 화면 카운트다운 시작
    startLocalCountdown();

    // 4. 입력창 이벤트
    els.catSelect.addEventListener('change', toggleGuestInput);
    
    // PWA 서비스 워커 등록
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(() => console.log('SW Registered'))
            .catch(err => console.log('SW Fail:', err));
    }
});


// ============================================================
// [추가] 시스템 정보(제목) 가져오기
// ============================================================
async function fetchSystemInfo() {
    try {
        const res = await fetch('/api/info');
        const data = await res.json();
        // 예: "겨울학기 1주차"
        if(els.titleText) {
            els.titleText.innerText = `${data.semester}학기 ${data.week}주차`;
        }
    } catch (err) {
        console.error("정보 로드 실패:", err);
    }
}


// ============================================================
// [3] 타이머 시스템
// ============================================================
async function fetchServerTimer() {
    try {
        const res = await fetch('/api/timer');
        if (res.ok) {
            timerCache = await res.json();
            updateTimerUI(); 
        }
    } catch (err) {
        console.error("타이머 동기화 실패:", err);
    }
}

function startLocalCountdown() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimerUI, 1000);
}

function updateTimerUI() {
    if (!timerCache || Object.keys(timerCache).length === 0) return;

    const keys = {
        exercise: `${currentDay}_EXERCISE`,
        guest:    `${currentDay}_GUEST`,
        lesson:   `${currentDay}_LESSON`
    };

    renderSingleTimer(els.timerExercise, timerCache[keys.exercise]);
    renderSingleTimer(els.timerGuest, timerCache[keys.guest]);

    if (currentDay === 'FRI') {
        els.timerLesson.textContent = "";
    } else {
        renderSingleTimer(els.timerLesson, timerCache[keys.lesson]);
    }
}

function renderSingleTimer(element, data) {
    if (!element || !data) return;

    const now = new Date();
    const target = new Date(data.target);
    let diff = target - now;

    if (diff < 0) diff = 0;

    const timeStr = formatTime(diff);
    
    let label = "";
    let colorClass = "text-gray"; 

    switch (data.state) {
        case 'OPEN_WAIT':
            label = `오픈 ${timeStr}`;
            colorClass = "text-gray";
            break;
        case 'CLOSING':
            label = `마감 ${timeStr}`;
            colorClass = "text-green"; 
            break;
        case 'CANCEL_CLOSING':
            label = `취소마감 ${timeStr}`;
            colorClass = "text-orange"; 
            break;
        case 'ENDED':
            label = "마감됨";
            colorClass = "text-gray";
            break;
    }

    element.textContent = label;
    element.className = "timer-text"; 
    element.classList.add(colorClass);
}

function formatTime(ms) {
    if (ms <= 0) return "00:00:00";
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}


// ============================================================
// [4] 명단 리스트 및 UI 제어
// ============================================================
function selectDay(day, btnElement) {
    currentDay = day;
    document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    fetchStatus();   
    updateTimerUI(); 
}

function toggleAccordion(panelId) {
    const panel = document.getElementById(panelId);
    panel.classList.toggle('active');
}

function toggleGuestInput() {
    const isGuest = els.catSelect.value === 'guest';
    els.guestNameInput.style.display = isGuest ? 'block' : 'none';
    if (isGuest) els.guestNameInput.focus();
}

async function fetchStatus() {
    try {
        const res = await fetch(`/api/status?day=${currentDay}`);
        const data = await res.json();
        renderLists(data);
    } catch (err) {
        console.error("명단 로드 실패:", err);
    }
}

function renderLists(data) {
    els.listExercise.innerHTML = '';
    els.listGuest.innerHTML = '';
    els.listLesson.innerHTML = '';

    if (!data || data.length === 0) {
        els.listExercise.innerHTML = '<tr><td colspan="3">신청자가 없습니다.</td></tr>';
        return;
    }

    const exercises = data.filter(d => d.category === 'exercise');
    const guests = data.filter(d => d.category === 'guest');
    const lessons = data.filter(d => d.category === 'lesson');

    exercises.forEach((item, idx) => {
        const row = `<tr><td>${idx + 1}</td><td>${item.user_name || item.student_id}</td><td>${formatDateShort(item.created_at)}</td></tr>`;
        els.listExercise.innerHTML += row;
    });

    guests.forEach((item, idx) => {
        const row = `<tr><td>${idx + 1}</td><td>${item.guest_name}</td><td>${item.user_name || item.student_id}</td></tr>`;
        els.listGuest.innerHTML += row;
    });

    lessons.forEach((item, idx) => {
        const startMin = 18 * 60 + (idx * 15);
        const h = Math.floor(startMin / 60);
        const m = startMin % 60;
        const timeStr = `${h}:${m.toString().padStart(2, '0')}`;
        const row = `<tr><td>${idx + 1}</td><td>${item.user_name || item.student_id}</td><td>${timeStr}</td></tr>`;
        els.listLesson.innerHTML += row;
    });
}

function formatDateShort(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`;
}


// ============================================================
// [5] 폼 제출
// ============================================================
async function submitForm() {
    const id = els.idInput.value.trim();
    const pwd = els.pwdInput.value.trim();
    const category = els.catSelect.value;
    const action = document.querySelector('input[name="action"]:checked').value;
    const guestName = els.guestNameInput.value.trim();

    if (!id || !pwd) { alert("학번과 비밀번호를 입력해주세요."); return; }
    if (category === 'guest' && !guestName) { alert("게스트 이름을 입력해주세요."); return; }

    const payload = { id, pwd, category, day: currentDay, name: guestName };
    const endpoint = action === 'apply' ? '/api/apply' : '/api/cancel';

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            alert(result.message);
            els.idInput.value = ''; els.pwdInput.value = ''; els.guestNameInput.value = '';
            fetchStatus();
        } else {
            alert("❌ " + result.message);
        }
    } catch (err) {
        console.error(err);
        alert("서버 통신 오류");
    }
}