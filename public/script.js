/**
 * [FILE: public/script.js]
 * 역할: 브라우저 화면의 실시간 업데이트, 서버와의 데이터 송수신(AJAX), 사용자 이벤트 처리를 담당합니다.
 */

// ==========================================
// 1. [Global State] 전역 상태 관리
// ==========================================
// 현재 사용자가 선택한 요일 정보를 저장합니다. (기본값: 수요일)
let currentDay = 'WED'; 

// ==========================================
// 2. [Timer Logic] 실시간 카운트다운 로직
// ==========================================
/**
 * 현재 시간과 목표 시간을 비교하여 남은 시간을 화면에 표시합니다.
 * 요일별로 오픈/마감 기준이 다르므로 이를 계산하는 로직이 핵심입니다.
 */
function updateTimer() {
    const now = new Date();           // 현재 시각
    const day = now.getDay();        // 현재 요일 (0:일 ~ 6:토)
    const hour = now.getHours();     // 현재 시간 (0~23)
    
    // HTML 요소를 변수에 저장
    const statusText = document.getElementById('status-text');
    const timerDisplay = document.getElementById('timer-display');
    
    let targetTime = new Date();     // 목표 시간을 담을 객체
    let mode = "";                   // 현재 상태 (오픈대기 vs 마감임박)

    // --- [수요일(WED) 기준 시간 계산] ---
    if (currentDay === 'WED') {
        // (1) 마감 모드 체크 (수, 목, 금, 토요일 밤 10시 전)
        if (day === 3 || day === 4 || day === 5 || (day === 6 && hour < 22)) {
            mode = "OPEN_WAIT";
            // 다음 오픈 목표: 다가오는 토요일 22:00:00
            const dist = (6 - day + 7) % 7;
            targetTime.setDate(now.getDate() + dist);
            targetTime.setHours(22, 0, 0, 0);
        } 
        // (2) 오픈 모드 (투표 진행 중)
        else {
            mode = "CLOSING";
            // 마감 목표: 다가오는 화요일 23:59:59
            let dist = (2 - day + 7) % 7; 
            targetTime.setDate(now.getDate() + dist);
            targetTime.setHours(23, 59, 59, 999);
        }
    } 
    // --- [금요일(FRI) 기준 시간 계산] ---
    else if (currentDay === 'FRI') {
        // (1) 마감 모드 체크 (금, 토요일 밤 10시 전)
        if (day === 5 || (day === 6 && hour < 22)) {
            mode = "OPEN_WAIT";
            // 다음 오픈 목표: 다가오는 토요일 22:00:00
            const dist = (6 - day + 7) % 7;
            targetTime.setDate(now.getDate() + dist);
            targetTime.setHours(22, 0, 0, 0);
        } 
        // (2) 오픈 모드 (투표 진행 중)
        else {
            mode = "CLOSING";
            // 마감 목표: 다가오는 목요일 23:59:59
            let dist = (4 - day + 7) % 7;
            targetTime.setDate(now.getDate() + dist);
            targetTime.setHours(23, 59, 59, 999);
        }
    }

    // --- [화면 렌더링] ---
    // 목표 시간이 이미 지났다면 1주일 뒤로 설정 (안전장치)
    if (targetTime < now) targetTime.setDate(targetTime.getDate() + 7);

    // 상태에 따른 UI 변경
    if (mode === "OPEN_WAIT") {
        statusText.innerText = "투표 시작까지";
        timerDisplay.className = "timer-text text-gray"; // 회색 처리
    } else {
        statusText.innerText = "투표 마감까지";
        timerDisplay.className = "timer-text text-green"; // 강조색 처리
    }

    // 시간 차이 계산 (밀리초 단위)
    const diff = targetTime - now;
    if (diff < 0) {
        timerDisplay.innerText = "00:00:00:00";
        return;
    }

    // 밀리초를 일:시:분:초 단위로 변환
    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const m = Math.floor((diff / (1000 * 60)) % 60);
    const s = Math.floor((diff / 1000) % 60);

    // 00:00:00:00 형식으로 표시 (padStart를 사용하여 한 자리 숫자 앞에 0을 붙임)
    timerDisplay.innerText = 
        `${d.toString().padStart(2, '0')}:${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// 1초마다 타이머 함수 실행
setInterval(updateTimer, 1000);
updateTimer(); // 페이지 접속 시 즉시 실행

// ==========================================
// 3. [Data Fetching] 서버 데이터 통신
// ==========================================
/**
 * 서버에서 특정 요일의 신청자 명단을 가져와 화면에 다시 그립니다.
 */
function fetchStatus() {
    // API 주소에 현재 선택된 요일(?day=WED)을 파라미터로 전달
    fetch(`/api/status?day=${currentDay}`)
        .then(response => response.json())
        .then(data => {
            // 기존에 그려진 테이블 내용 삭제 (중복 추가 방지)
            document.getElementById('exercise-list').innerHTML = '';
            document.getElementById('guest-list').innerHTML = '';
            document.getElementById('lesson-list').innerHTML = '';

            // 받아온 명단 데이터를 한 줄씩 테이블에 추가
            data.forEach(item => {
                const applicantName = item.user_name || item.student_id;
                const guestName = item.guest_name || "";
                addRawToTable(item.category, applicantName, guestName, item.created_at);
            });
        })
        .catch(err => console.error("명단 로딩 실패:", err));
}

// 2초마다 실시간으로 명단 동기화
setInterval(fetchStatus, 2000);
fetchStatus();

// ==========================================
// 4. [Event Handlers] 사용자 클릭 이벤트 처리
// ==========================================
/**
 * 요일 선택 버튼 클릭 시 호출됩니다.
 */
function selectDay(day, element) {
    currentDay = day; 
    // 모든 버튼에서 active 클래스 제거 후 클릭된 버튼에만 추가
    document.querySelectorAll('.day-btn').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');

    // --- [추가] 금요일 레슨 판넬 제어 ---
    const lessonPanel = document.getElementById('lesson-panel');
    if (day === 'FRI') {
        lessonPanel.classList.add('hidden'); // 금요일이면 숨김
    } else {
        lessonPanel.classList.remove('hidden'); // 수요일이면 다시 노출
    }

    // 바뀐 요일의 데이터를 즉시 불러옴
    fetchStatus(); 
}

/**
 * 신청 카테고리(운동/게스트/레슨) 변경 시 입력창 제어
 */
const categorySelect = document.getElementById('category-select');
const guestNameInput = document.getElementById('guest-name-input');

categorySelect.addEventListener('change', function() {
    // 게스트 카테고리일 때만 게스트 이름 입력창 노출
    if (this.value === 'guest') {
        guestNameInput.style.display = 'block';
        guestNameInput.required = true;
    } else {
        guestNameInput.style.display = 'none';
        guestNameInput.value = '';
        guestNameInput.required = false;
    }
});
categorySelect.dispatchEvent(new Event('change')); // 초기값에 맞춰 한 번 실행

// ==========================================
// 5. [AJAX Submission] 폼 제출 (신청/취소)
// ==========================================
const applyForm = document.querySelector('.control-panel');

applyForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // 기본 폼 새로고침 동작 방지

    // 라디오 버튼으로 선택된 액션(apply/cancel) 가져오기
    const actionType = document.querySelector('input[name="action"]:checked').value;

    const formData = {
        id: applyForm.id.value,
        pwd: applyForm.pwd.value,
        category: applyForm.category.value,
        name: applyForm.name.value,
        day: currentDay // 현재 화면에 표시된 요일 정보 전송
    };

    if (!formData.id || !formData.pwd) {
        alert("학번과 비밀번호를 모두 입력해주세요!");
        return;
    }

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
                fetchStatus(); // 취소 성공 시 명단 즉시 새로고침
                applyForm.id.value = '';
                applyForm.pwd.value = '';
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
            fetchStatus(); // 신청 성공 시 명단 즉시 새로고침
            applyForm.id.value = '';
            applyForm.pwd.value = '';
        } else {
            alert("실패: " + result.message);
        }
    } catch (error) {
        alert("서버 연결 실패");
    }
});

// ==========================================
// 6. [UI Utilities] 테이블 그리기 및 정보 업데이트
// ==========================================
/**
 * 명단 테이블에 데이터를 한 줄 추가합니다.
 */
function addRawToTable(category, applicantName, guestName, timeOverride = null) {
    let targetTableId = "";
    let col1_text = "";
    let col2_text = "";

    // 시간 표시 형식 변환 (HH:MM)
    let displayTime;
    const dateObj = timeOverride ? new Date(timeOverride) : new Date();
    displayTime = `${dateObj.getHours()}:${dateObj.getMinutes().toString().padStart(2, '0')}`;

    // 카테고리별 테이블 배정 및 데이터 설정
    if (category === "exercise") {
        targetTableId = "exercise-list";
        col1_text = applicantName; 
        col2_text = displayTime;
    } else if (category === "guest") {
        targetTableId = "guest-list";
        col1_text = guestName;       
        col2_text = applicantName; // 신청자 이름
    } else if (category === "lesson") {
        targetTableId = "lesson-list";
        col1_text = applicantName; 
        
        // 레슨 대기열 순번에 따라 예상 시간(15분 단위) 계산
        const tbody = document.getElementById('lesson-list');
        const currentCount = tbody.children.length; 
        const startMin = 18 * 60; // 18:00 시작
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
    const no = tbody.children.length + 1; // 연번 계산

    newRow.innerHTML = `
        <td>${no}</td>
        <td>${col1_text}</td>
        <td>${col2_text}</td>
    `;
    tbody.appendChild(newRow);
}

/**
 * 서버에서 현재 학기 및 주차 정보를 가져와 상단 제목을 업데이트합니다.
 */
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




//아코디언 코드
function toggleAccordion(panelId) {
    // 모바일 환경(너비 768px 이하)일 때만 아코디언 작동
    if (window.innerWidth <= 768) {
        const panel = document.getElementById(panelId);
        panel.classList.toggle('collapsed');
    }
}