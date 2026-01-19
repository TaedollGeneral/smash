/**
 * [FILE: public/js/script.js]
 * 역할: 일반 사용자용 프론트엔드 로직 (타이머, 명단 조회, 신청/취소)
 * 구조: 서버 API와 연동하여 상태를 표시하고 사용자 입력을 처리함
 */

// ============================================================
// [1] 전역 변수 및 상태 관리
// ============================================================
let currentDay = 'WED'; // 현재 보고 있는 요일 (기본값: 수요일)
let timerCache = {};    // 서버에서 받아온 타이머 정보 저장소
let timerInterval = null; // 1초마다 화면 갱신하는 인터벌

// DOM 요소 캐싱
const els = {
    // 타이머 텍스트 (제목 옆)
    timerExercise: document.getElementById('timer-exercise'),
    timerGuest: document.getElementById('timer-guest'),
    timerLesson: document.getElementById('timer-lesson'),
    
    // 리스트 바디
    listExercise: document.getElementById('exercise-list'),
    listGuest: document.getElementById('guest-list'),
    listLesson: document.getElementById('lesson-list'),
    
    // 입력 폼
    idInput: document.getElementById('user-id'),
    pwdInput: document.getElementById('user-pwd'),
    catSelect: document.getElementById('category-select'),
    guestNameInput: document.getElementById('guest-name-input')
};


// ============================================================
// [2] 초기화 및 이벤트 리스너
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. 초기 데이터 로드
    fetchServerTimer(); // 타이머 정보 가져오기
    fetchStatus();      // 명단 가져오기
    
    // 2. 주기적 동기화 (서버 부하를 줄이기 위해 타이머 정보는 10초에 한 번만 갱신)
    setInterval(fetchServerTimer, 10000); 

    // 3. 화면 카운트다운 시작 (1초마다 UI만 갱신)
    startLocalCountdown();

    // 4. 입력창 이벤트 (카테고리 변경 시 게스트 이름창 토글)
    els.catSelect.addEventListener('change', toggleGuestInput);
    
    // 5. 라디오 버튼 이벤트 (신청/취소 전환 시 UI 변경 필요하면 추가)
    document.querySelectorAll('input[name="action"]').forEach(radio => {
        radio.addEventListener('change', () => {
            // 필요시 버튼 색상 변경 등 UX 로직 추가 가능
        });
    });

    // PWA 서비스 워커 등록 (경로 주의: /service-worker.js)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(() => console.log('Service Worker Registered'))
            .catch(err => console.log('SW Fail:', err));
    }
});


// ============================================================
// [3] 타이머 시스템 (핵심 로직)
// ============================================================

/**
 * 서버에서 최신 목표 시간(Target Time)을 받아옴
 * - 매초 호출하지 않고 10초~1분 단위로 호출해도 충분함
 */
async function fetchServerTimer() {
    try {
        const res = await fetch('/api/timer');
        if (res.ok) {
            timerCache = await res.json();
            updateTimerUI(); // 데이터 받자마자 한 번 갱신
        }
    } catch (err) {
        console.error("타이머 동기화 실패:", err);
    }
}

/**
 * 로컬 카운트다운 시작
 * - 서버 데이터(timerCache)를 기반으로 1초마다 남은 시간을 계산해 화면에 그림
 */
function startLocalCountdown() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimerUI, 1000);
}

/**
 * 실제 화면에 시간을 그리는 함수
 */
function updateTimerUI() {
    if (!timerCache || Object.keys(timerCache).length === 0) return;

    // 현재 요일에 맞는 키 생성 (예: WED_EXERCISE)
    const keys = {
        exercise: `${currentDay}_EXERCISE`,
        guest:    `${currentDay}_GUEST`,
        lesson:   `${currentDay}_LESSON`
    };

    // 각 카테고리별 타이머 업데이트
    renderSingleTimer(els.timerExercise, timerCache[keys.exercise]);
    renderSingleTimer(els.timerGuest, timerCache[keys.guest]);

    // 레슨은 수요일만 존재, 금요일엔 숨김 처리
    if (currentDay === 'FRI') {
        els.timerLesson.textContent = "";
    } else {
        renderSingleTimer(els.timerLesson, timerCache[keys.lesson]);
    }
}

/**
 * 개별 타이머 요소 렌더링
 * @param {HTMLElement} element - 표시할 span 태그
 * @param {object} data - 서버에서 받은 상태 객체 { state, target }
 */
function renderSingleTimer(element, data) {
    if (!element || !data) return;

    const now = new Date();
    const target = new Date(data.target);
    let diff = target - now;

    // 시간이 지났으면 0으로 고정
    if (diff < 0) diff = 0;

    const timeStr = formatTime(diff);
    
    // 상태별 텍스트 및 색상 결정
    // state: OPEN_WAIT(대기), CLOSING(신청중), CANCEL_CLOSING(취소만), ENDED(끝)
    let label = "";
    let colorClass = "text-gray"; // 기본 회색

    switch (data.state) {
        case 'OPEN_WAIT':
            label = `오픈 ${timeStr}`;
            colorClass = "text-gray";
            break;
        case 'CLOSING':
            label = `마감 ${timeStr}`;
            colorClass = "text-green"; // 활성 상태 (초록)
            break;
        case 'CANCEL_CLOSING':
            label = `취소마감 ${timeStr}`;
            colorClass = "text-orange"; // 주의 상태 (주황/노랑) - CSS 필요시 추가, 일단 green/gray 활용
            break;
        case 'ENDED':
            label = "마감됨";
            colorClass = "text-gray";
            break;
    }

    element.textContent = label;
    
    // 클래스 초기화 후 색상 적용
    element.className = "timer-text"; 
    element.classList.add(colorClass);
    
    // (CSS에 text-green, text-orange 등이 정의되어 있어야 함. 없다면 style.css 수정 필요)
    // 기존 style.css에 text-green은 있을 것임.
}

// 시간 포맷팅 (HH:MM:SS)
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

/**
 * 요일 선택 (수/금 탭 전환)
 */
function selectDay(day, btnElement) {
    currentDay = day;
    
    // 버튼 스타일 활성화
    document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');

    // UI 갱신
    fetchStatus();   // 명단 새로고침
    updateTimerUI(); // 타이머 즉시 갱신 (요일 변경 반영)
}

/**
 * 아코디언 토글
 */
function toggleAccordion(panelId) {
    const panel = document.getElementById(panelId);
    panel.classList.toggle('active');
}

/**
 * 게스트 입력창 토글 (카테고리 선택 시)
 */
function toggleGuestInput() {
    const isGuest = els.catSelect.value === 'guest';
    els.guestNameInput.style.display = isGuest ? 'block' : 'none';
    if (isGuest) els.guestNameInput.focus();
}

/**
 * 명단 데이터 가져오기 (API 호출)
 */
async function fetchStatus() {
    try {
        const res = await fetch(`/api/status?day=${currentDay}`);
        const data = await res.json();
        renderLists(data);
    } catch (err) {
        console.error("명단 로드 실패:", err);
    }
}

/**
 * 명단 렌더링
 */
function renderLists(data) {
    // 초기화
    els.listExercise.innerHTML = '';
    els.listGuest.innerHTML = '';
    els.listLesson.innerHTML = '';

    if (!data || data.length === 0) {
        els.listExercise.innerHTML = '<tr><td colspan="3">신청자가 없습니다.</td></tr>';
        return;
    }

    // 카테고리별 필터링
    const exercises = data.filter(d => d.category === 'exercise');
    const guests = data.filter(d => d.category === 'guest');
    const lessons = data.filter(d => d.category === 'lesson');

    // 1. 운동 명단
    exercises.forEach((item, idx) => {
        const row = `<tr>
            <td>${idx + 1}</td>
            <td>${item.user_name || item.student_id}</td>
            <td>${formatDateShort(item.created_at)}</td>
        </tr>`;
        els.listExercise.innerHTML += row;
    });

    // 2. 게스트 명단
    guests.forEach((item, idx) => {
        const row = `<tr>
            <td>${idx + 1}</td>
            <td>${item.guest_name}</td>
            <td>${item.user_name || item.student_id}</td>
        </tr>`;
        els.listGuest.innerHTML += row;
    });

    // 3. 레슨 명단
    lessons.forEach((item, idx) => {
        // 레슨 시간 계산 (18:00부터 15분 간격)
        const startMin = 18 * 60 + (idx * 15);
        const h = Math.floor(startMin / 60);
        const m = startMin % 60;
        const timeStr = `${h}:${m.toString().padStart(2, '0')}`;

        const row = `<tr>
            <td>${idx + 1}</td>
            <td>${item.user_name || item.student_id}</td>
            <td>${timeStr}</td>
        </tr>`;
        els.listLesson.innerHTML += row;
    });
}

function formatDateShort(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2,'0')}`;
}


// ============================================================
// [5] 폼 제출 (신청/취소)
// ============================================================

async function submitForm() {
    const id = els.idInput.value.trim();
    const pwd = els.pwdInput.value.trim();
    const category = els.catSelect.value;
    const action = document.querySelector('input[name="action"]:checked').value;
    const guestName = els.guestNameInput.value.trim();

    // 유효성 검사
    if (!id || !pwd) {
        alert("학번과 비밀번호를 입력해주세요.");
        return;
    }
    if (category === 'guest' && !guestName) {
        alert("게스트 이름을 입력해주세요.");
        return;
    }

    // 데이터 준비
    const payload = {
        id, pwd, category,
        day: currentDay,
        name: guestName
    };

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
            // 성공 시 입력창 초기화
            els.idInput.value = '';
            els.pwdInput.value = '';
            els.guestNameInput.value = '';
            // 명단 갱신
            fetchStatus();
        } else {
            alert("❌ " + result.message);
        }
    } catch (err) {
        console.error(err);
        alert("서버 통신 오류");
    }
}