/**
 * [FILE: public/js/script.js]
 * 역할: 일반 사용자용 프론트엔드 로직
 */

let currentDay = 'WED'; 
let timerCache = {};    
let timerInterval = null; 

const els = {
    // 타이머
    timerExercise: document.getElementById('timer-exercise'),
    timerGuest: document.getElementById('timer-guest'),
    timerLesson: document.getElementById('timer-lesson'),
    
    // 패널 (숨김 처리용)
    panelLesson: document.getElementById('lesson-panel'),

    // 리스트
    listExercise: document.getElementById('exercise-list'),
    listGuest: document.getElementById('guest-list'),
    listLesson: document.getElementById('lesson-list'),
    
    // 입력창
    idInput: document.getElementById('user-id'),
    pwdInput: document.getElementById('user-pwd'),
    catSelect: document.getElementById('category-select'),
    guestNameInput: document.getElementById('guest-name-input'),
    titleText: document.querySelector('.title') 
};

document.addEventListener('DOMContentLoaded', () => {
    fetchServerTimer(); 
    fetchStatus();      
    fetchSystemInfo();
    setInterval(fetchServerTimer, 10000); 
    startLocalCountdown();
    els.catSelect.addEventListener('change', toggleGuestInput);
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js').catch(console.log);
    }
});

async function fetchSystemInfo() {
    try {
        const res = await fetch('/api/info');
        const data = await res.json();
        if(els.titleText) els.titleText.innerText = `${data.semester}학기 ${data.week}주차`;
    } catch (err) { console.error(err); }
}

async function fetchServerTimer() {
    try {
        const res = await fetch('/api/timer');
        if (res.ok) {
            timerCache = await res.json();
            updateTimerUI(); 
        }
    } catch (err) { console.error(err); }
}

function startLocalCountdown() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimerUI, 1000);
}

function updateTimerUI() {
    // [수정] 금요일이면 레슨 패널 자체를 숨김
    if (currentDay === 'FRI') {
        if(els.panelLesson) els.panelLesson.style.display = 'none';
    } else {
        if(els.panelLesson) els.panelLesson.style.display = 'flex'; // 아코디언 스타일 복구
    }

    if (!timerCache || Object.keys(timerCache).length === 0) return;

    const keys = {
        exercise: `${currentDay}_EXERCISE`,
        guest:    `${currentDay}_GUEST`,
        lesson:   `${currentDay}_LESSON`
    };

    renderSingleTimer(els.timerExercise, timerCache[keys.exercise]);
    renderSingleTimer(els.timerGuest, timerCache[keys.guest]);

    // 레슨 타이머는 수요일에만 그림
    if (currentDay !== 'FRI') {
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
    
    let labelText = "";
    let colorClass = "text-gray"; 

    switch (data.state) {
        case 'OPEN_WAIT':
            labelText = "오픈까지";
            colorClass = "text-gray";
            break;
        case 'CLOSING':
            labelText = "투표 마감까지"; 
            colorClass = "text-green"; 
            break;
        case 'CANCEL_CLOSING':
            labelText = "취소 마감까지";
            colorClass = "text-orange"; 
            break;
        case 'ENDED':
            labelText = "상태";
            colorClass = "text-gray";
            break;
    }

    const displayTime = (data.state === 'ENDED') ? "마감됨" : timeStr;

    // HTML 구조 업데이트 (라벨 + 시간)
    element.innerHTML = `
        <div class="timer-label">${labelText}</div>
        <div class="timer-number ${colorClass}">${displayTime}</div>
    `;
}

function formatTime(ms) {
    if (ms <= 0) return "00:00:00";
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function selectDay(day, btnElement) {
    currentDay = day;
    document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    fetchStatus();   
    updateTimerUI(); // UI 즉시 갱신 (패널 숨김 적용)
}

/**
 * [수정] 아코디언 토글 로직 수정 (active -> collapsed)
 * CSS에서 .collapsed 클래스를 사용하므로 이에 맞춤
 */
function toggleAccordion(panelId) {
    const panel = document.getElementById(panelId);
    panel.classList.toggle('collapsed');
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
    } catch (err) { console.error(err); }
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

// [최적화] 날짜 포맷 함수 (시:분:초 모두 두 자리 맞춤)
function formatDateShort(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    
    // 예: 1/20 09:05:07 (시간도 09로 표시됨)
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

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