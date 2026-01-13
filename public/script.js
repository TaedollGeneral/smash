/**
 * [FILE: public/script.js]
 * 역할: 브라우저 화면의 실시간 업데이트, 서버와의 데이터 송수신(AJAX), 사용자 이벤트 처리를 담당합니다.
 */

// ==========================================
// 1. [Global State] 전역 상태 관리
// ==========================================
let currentDay = 'WED'; 

// ==========================================
// 2. [Timer Logic] 실시간 카운트다운 로직
// ==========================================
function updateTimer() {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    
    const statusText = document.getElementById('status-text');
    const timerDisplay = document.getElementById('timer-display');
    
    let targetTime = new Date();
    let mode = "";

    if (currentDay === 'WED') {
        if (day === 3 || day === 4 || day === 5 || (day === 6 && hour < 22)) {
            mode = "OPEN_WAIT";
            const dist = (6 - day + 7) % 7;
            targetTime.setDate(now.getDate() + dist);
            targetTime.setHours(22, 0, 0, 0);
        } else {
            mode = "CLOSING";
            let dist = (2 - day + 7) % 7; 
            targetTime.setDate(now.getDate() + dist);
            targetTime.setHours(23, 59, 59, 999);
        }
    } else if (currentDay === 'FRI') {
        if (day === 5 || (day === 6 && hour < 22)) {
            mode = "OPEN_WAIT";
            const dist = (6 - day + 7) % 7;
            targetTime.setDate(now.getDate() + dist);
            targetTime.setHours(22, 0, 0, 0);
        } else {
            mode = "CLOSING";
            let dist = (4 - day + 7) % 7;
            targetTime.setDate(now.getDate() + dist);
            targetTime.setHours(23, 59, 59, 999);
        }
    }

    if (targetTime < now) targetTime.setDate(targetTime.getDate() + 7);

    if (mode === "OPEN_WAIT") {
        statusText.innerText = "투표 시작까지";
        timerDisplay.className = "timer-text text-gray";
    } else {
        statusText.innerText = "투표 마감까지";
        timerDisplay.className = "timer-text text-green";
    }

    const diff = targetTime - now;
    if (diff < 0) {
        timerDisplay.innerText = "00:00:00:00";
        return;
    }

    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const m = Math.floor((diff / (1000 * 60)) % 60);
    const s = Math.floor((diff / 1000) % 60);

    timerDisplay.innerText = 
        `${d.toString().padStart(2, '0')}:${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

setInterval(updateTimer, 1000);
updateTimer();

// ==========================================
// 3. [Data Fetching] 서버 데이터 통신
// ==========================================
function fetchStatus() {
    fetch(`/api/status?day=${currentDay}`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('exercise-list').innerHTML = '';
            document.getElementById('guest-list').innerHTML = '';
            document.getElementById('lesson-list').innerHTML = '';

            data.forEach(item => {
                const applicantName = item.user_name || item.student_id;
                const guestName = item.guest_name || "";
                addRawToTable(item.category, applicantName, guestName, item.created_at);
            });
        })
        .catch(err => console.error("명단 로딩 실패:", err));
}

setInterval(fetchStatus, 2000);
fetchStatus();

// ==========================================
// 4. [Event Handlers] 사용자 클릭 이벤트 처리
// ==========================================
function selectDay(day, element) {
    currentDay = day; 
    document.querySelectorAll('.day-btn').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');

    const lessonPanel = document.getElementById('lesson-panel');
    if (day === 'FRI') {
        lessonPanel.classList.add('hidden');
    } else {
        lessonPanel.classList.remove('hidden');
    }

    fetchStatus(); 
}

const categorySelect = document.getElementById('category-select');
const guestNameInput = document.getElementById('guest-name-input');

categorySelect.addEventListener('change', function() {
    if (this.value === 'guest') {
        guestNameInput.style.display = 'block';
    } else {
        guestNameInput.style.display = 'none';
        guestNameInput.value = '';
    }
});

// ==========================================
// 5. [AJAX Submission] 폼 제출 로직 수정
// ==========================================
/**
 * [수정] 확인 버튼 클릭 시 호출되는 통합 제출 함수
 */
async function submitForm() {
    // 각 입력 요소에서 직접 값을 가져옴
    const studentId = document.getElementById('user-id').value;
    const password = document.getElementById('user-pwd').value;
    const category = document.getElementById('category-select').value;
    const guestName = document.getElementById('guest-name-input').value;
    const actionType = document.querySelector('input[name="action"]:checked').value;

    if (!studentId || !password) {
        alert("학번과 비밀번호를 모두 입력해주세요!");
        return;
    }

    const formData = {
        id: studentId,
        pwd: password,
        category: category,
        name: guestName,
        day: currentDay
    };

    // --- [A] 취소 처리 ---
    if (actionType === 'cancel') {
        if (!confirm("정말 취소하시겠습니까?")) return;

        try {
            const response = await fetch('/api/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const result = await response.json();

            if (result.success) {
                alert(result.message);
                fetchStatus();
                document.getElementById('user-id').value = '';
                document.getElementById('user-pwd').value = '';
            } else {
                alert("실패: " + result.message);
            }
        } catch (error) {
            alert("서버 연결 실패");
        }
        return;
    }

    // --- [B] 신청 처리 ---
    try {
        const response = await fetch('/api/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        const result = await response.json();

        if (result.success) {
            alert(result.message);
            fetchStatus();
            document.getElementById('user-id').value = '';
            document.getElementById('user-pwd').value = '';
        } else {
            alert("실패: " + result.message);
        }
    } catch (error) {
        alert("서버 연결 실패");
    }
}

// ==========================================
// 6. [UI Utilities] 테이블 그리기 및 정보 업데이트
// ==========================================
function addRawToTable(category, applicantName, guestName, timeOverride = null) {
    let targetTableId = "";
    let col1_text = "";
    let col2_text = "";

    let displayTime;
    const dateObj = timeOverride ? new Date(timeOverride) : new Date();
    displayTime = `${dateObj.getHours()}:${dateObj.getMinutes().toString().padStart(2, '0')}`;

    if (category === "exercise") {
        targetTableId = "exercise-list";
        col1_text = applicantName; 
        col2_text = displayTime;
    } else if (category === "guest") {
        targetTableId = "guest-list";
        col1_text = guestName;       
        col2_text = applicantName;
    } else if (category === "lesson") {
        targetTableId = "lesson-list";
        col1_text = applicantName; 
        
        const tbody = document.getElementById('lesson-list');
        const currentCount = tbody.children.length; 
        const startMin = 18 * 60;
        const myLessonTimeMin = startMin + (currentCount * 15);
        
        if (myLessonTimeMin >= 21 * 60) {
            col2_text = "대기";
        } else {
            const h = Math.floor(myLessonTimeMin / 60);
            const m = myLessonTimeMin % 60;
            col2_text = `${h}:${m.toString().padStart(2, '0')}`;
        }
    }

    const tbody = document.getElementById(targetTableId);
    if (!tbody) return;

    const newRow = document.createElement('tr');
    const no = tbody.children.length + 1;

    newRow.innerHTML = `<td>${no}</td><td>${col1_text}</td><td>${col2_text}</td>`;
    tbody.appendChild(newRow);
}

function updateTitle() {
    fetch('/api/info')
        .then(res => res.json())
        .then(data => {
            const titleElement = document.querySelector('.title');
            if (titleElement) {
                titleElement.innerText = `${data.semester}학기 ${data.week}주차`;
            }
        })
        .catch(err => console.error("주차 정보 로딩 실패:", err));
}

updateTitle();

function toggleAccordion(panelId) {
    if (window.innerWidth <= 768) {
        const panel = document.getElementById(panelId);
        panel.classList.toggle('collapsed');
    }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((reg) => console.log('✅ 서비스 워커 등록 성공!', reg))
      .catch((err) => console.log('❌ 서비스 워커 등록 실패:', err));
  });
}