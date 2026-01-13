// ==========================================
// 📅 [전역 설정] 현재 요일 상태 관리 (기본값: 수요일)
// ==========================================
let currentDay = 'WED'; // 'WED' or 'FRI'


// ==========================================
// ⏰ [타이머] 시간 표시 로직
// ==========================================
function updateTimer() {
    const now = new Date();
    const day = now.getDay(); // 0(일) ~ 6(토)
    const hour = now.getHours();
    
    // 화면 요소 가져오기
    const statusText = document.getElementById('status-text');
    const timerDisplay = document.getElementById('timer-display');
    
    // 목표 시간(Target)과 상태(Mode) 결정
    let targetTime = new Date();
    let mode = ""; // 'OPEN_WAIT'(오픈대기) or 'QtCLOSING'(마감임박)

    // ----------------------------------------------------
    // 1. 현재 선택된 요일(currentDay)에 따라 목표 설정
    // ----------------------------------------------------
    
    if (currentDay === 'WED') {
        // [수요일 투표 기준]
        // 오픈 기간: 토요일 22:00 ~ 화요일 23:59:59
        // 마감 기간: 수요일 00:00 ~ 토요일 21:59:59
        
        // (1) 이미 마감되었는가? (수, 목, 금, 토요일 22시 전)
        if (day === 3 || day === 4 || day === 5 || (day === 6 && hour < 22)) {
            mode = "OPEN_WAIT";
            // 목표: 다가오는 토요일 22시
            const dist = (6 - day + 7) % 7; // 토요일까지 남은 일수
            targetTime.setDate(now.getDate() + dist);
            targetTime.setHours(22, 0, 0, 0);
        } 
        // (2) 오픈 중인가?
        else {
            mode = "CLOSING";
            // 목표: 다가오는 화요일 23:59:59
            // 일(0), 월(1), 화(2) -> 화요일까지
            // 토(6) -> 다음주 화요일까지
            let dist = (2 - day + 7) % 7; 
            targetTime.setDate(now.getDate() + dist);
            targetTime.setHours(23, 59, 59, 999);
        }
    } 
    else if (currentDay === 'FRI') {
        // [금요일 투표 기준]
        // 오픈 기간: 토요일 22:00 ~ 목요일 23:59:59
        // 마감 기간: 금요일 00:00 ~ 토요일 21:59:59

        // (1) 이미 마감되었는가? (금, 토요일 22시 전)
        if (day === 5 || (day === 6 && hour < 22)) {
            mode = "OPEN_WAIT";
            // 목표: 다가오는 토요일 22시
            const dist = (6 - day + 7) % 7;
            targetTime.setDate(now.getDate() + dist);
            targetTime.setHours(22, 0, 0, 0);
        } 
        // (2) 오픈 중인가?
        else {
            mode = "CLOSING";
            // 목표: 다가오는 목요일 23:59:59
            let dist = (4 - day + 7) % 7;
            targetTime.setDate(now.getDate() + dist);
            targetTime.setHours(23, 59, 59, 999);
        }
    }

    // ----------------------------------------------------
    // 2. 화면 표시 (글자색 및 텍스트 변경)
    // ----------------------------------------------------
    
    // 만약 목표 시간이 과거라면 (계산 꼬임 방지용 안전장치), 1주일 뒤로 밈
    if (targetTime < now) {
        targetTime.setDate(targetTime.getDate() + 7);
    }

    if (mode === "OPEN_WAIT") {
        statusText.innerText = "투표 시작까지";
        timerDisplay.className = "timer-text text-gray"; // 초록색
    } else {
        statusText.innerText = "투표 마감까지";
        timerDisplay.className = "timer-text text-green";   // 빨간색
    }

    // 남은 시간 계산
    const diff = targetTime - now;
    // (혹시 미세한 차이로 음수가 되면 0으로 처리)
    if (diff < 0) {
        timerDisplay.innerText = "00:00:00";
        return;
    }

    const d = Math.floor(diff / (1000 * 60 * 60 * 24)); // 일 (Days)
    const h = Math.floor((diff / (1000 * 60 * 60)) % 24); // 시 (Hours - 24시간 나머지)
    const m = Math.floor((diff / (1000 * 60)) % 60); // 분 (Minutes)
    const s = Math.floor((diff / 1000) % 60); // 초 (Seconds)

    
   // 화면에 표시 (예: 01:14:30:05)
    timerDisplay.innerText = 
        `${d.toString().padStart(2, '0')}:${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// 1초마다 타이머 갱신
setInterval(updateTimer, 1000);
updateTimer();


// ==========================================
// 👆 [UI] 요일 선택 버튼 로직 (핵심!)
// ==========================================
function selectDay(day, element) {
    // 1. 변수 업데이트
    currentDay = day; 
    console.log("요일 변경됨:", currentDay);

    // 2. 버튼 스타일 변경
    document.querySelectorAll('.day-btn').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');

    // 3. ★ 중요: 바뀐 요일의 데이터를 서버에서 즉시 가져오기
    fetchStatus(); 
}


// ==========================================
// 📡 [Polling] 서버에서 실시간 명단 가져오기
// ==========================================
function fetchStatus() {
    // 서버에 "현재 선택된 요일(currentDay)" 데이터를 달라고 요청
    fetch(`/api/status?day=${currentDay}`)
        .then(response => response.json())
        .then(data => {
            // 1. 기존 테이블 내용 싹 비우기 (초기화)
            document.getElementById('exercise-list').innerHTML = '';
            document.getElementById('guest-list').innerHTML = '';
            document.getElementById('lesson-list').innerHTML = '';

            // 2. 받아온 데이터로 테이블 다시 채우기
          data.forEach(item => {
                // DB에서 가져온 user_name(신청자)과 guest_name(게스트)을 그대로 넘김
                // (만약 조인 에러로 user_name이 없으면 학번이라도 넣도록 처리)
                const applicantName = item.user_name || item.student_id;
                const guestName = item.guest_name || "";

                addRawToTable(item.category, applicantName, guestName, item.created_at);
            });
        })
        .catch(err => console.error("데이터 로딩 실패:", err));
}

// 2초마다 자동으로 명단 새로고침 (실시간 효과)
setInterval(fetchStatus, 2000);
// 페이지 켜자마자 한번 실행
fetchStatus();


// ==========================================
// 🚀 [UI] 카테고리별 입력창 제어
// ==========================================
const categorySelect = document.getElementById('category-select');
const guestNameInput = document.getElementById('guest-name-input');

categorySelect.addEventListener('change', function() {
    if (this.value === 'guest') {
        guestNameInput.style.display = 'block';
        guestNameInput.required = true;
    } else {
        guestNameInput.style.display = 'none';
        guestNameInput.value = '';
        guestNameInput.required = false;
    }
});
categorySelect.dispatchEvent(new Event('change')); // 초기 실행


// ==========================================
// 📨 [AJAX] 신청서 제출 로직
// ==========================================
const applyForm = document.querySelector('.control-panel');

applyForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const actionType = document.querySelector('input[name="action"]:checked').value;

    const formData = {
        id: applyForm.id.value,
        pwd: applyForm.pwd.value,
        category: applyForm.category.value,
        name: applyForm.name.value,
        day: currentDay // ★ [추가] 현재 선택된 요일 정보도 같이 보냄!
    };

    if (!formData.id || !formData.pwd) {
        alert("학번과 비밀번호를 모두 입력해주세요!");
        return;
    }

    // [A] 취소 로직
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
            
            // ★ [수정] 서버가 준 userName과 guestName을 이용해서 즉시 추가
            addRawToTable(result.category, result.userName, result.guestName);
            
            applyForm.id.value = '';
            applyForm.name.value = '';
            } 
            else {
                alert("실패: " + result.message);
            }

        } catch (error) {
            console.error(error);
            alert("서버 연결 실패");
        }
        return;
    }

    // [B] 신청 로직
    try {
        const response = await fetch('/api/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (result.success) {
            alert(result.message);
            // 즉시 화면에 반영 (서버 응답값 활용)
            addRawToTable(result.category, result.id, result.name);
            
            applyForm.id.value = '';
            applyForm.name.value = '';
        } else {
            alert("실패: " + result.message);
        }
    } catch (error) {
        console.error("통신 에러:", error);
        alert("서버랑 연결이 안 돼요 ㅠㅠ");
    }
});


// ==========================================
// 📊 [Table] 테이블 그리기 함수 (시간 표시 수정됨)
// ==========================================
// timeOverride: 서버에서 받아온 과거 신청 시간 (없으면 현재시간)
function addRawToTable(category, applicantName, guestName, timeOverride = null) {
    let targetTableId = "";
    let col1_text = "";
    let col2_text = "";

    // 1. 시간 표시 로직
    let displayTime;
    if (timeOverride) {
        // DB에 저장된 시간(created_at)이 있으면 그걸 씀 (ISO 문자열 등)
        const dateObj = new Date(timeOverride);
        displayTime = `${dateObj.getHours()}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
    } else {
        // 방금 내가 신청한 거면 현재 시간
        const now = new Date();
        displayTime = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
    }

    // 2. 카테고리별 분기
    if (category === "exercise") {
        targetTableId = "exercise-list";
        col1_text = applicantName;          //학번 대신 실명으로 표시
        col2_text = displayTime; // 신청 시간

    } else if (category === "guest") {
        targetTableId = "guest-list";
        col1_text = guestName;       
        col2_text = applicantName;         

    } else if (category === "lesson") {
        targetTableId = "lesson-list";
        col1_text = applicantName;         
        
        // 레슨 시간 계산 (현재 테이블 줄 수 기반)
        const tbody = document.getElementById('lesson-list');
        const currentCount = tbody.children.length; // 대기자 수
        
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

    // 3. 테이블에 끼워넣기
    const tbody = document.getElementById(targetTableId);
    if (!tbody) return; // 에러 방지

    const newRow = document.createElement('tr');
    const no = tbody.children.length + 1;

    newRow.innerHTML = `
        <td>${no}</td>
        <td>${col1_text}</td>
        <td>${col2_text}</td>
    `;
    tbody.appendChild(newRow);
}


// ==========================================
// 🏷️ [UI] 주차 정보 자동 업데이트
// ==========================================
function updateTitle() {
    fetch('/api/info')
        .then(res => res.json())
        .then(data => {
            // HTML의 제목 태그(.title)를 찾아서 글자 변경
            // 예: "Smash 1주차" -> "Smash 2주차"
            const titleElement = document.querySelector('.title');
            if (titleElement) {
                titleElement.innerText = `${data.semester}학기 ${data.week}주차`;
            }
        })
        .catch(err => console.error("주차 정보 로딩 실패:", err));
}

// 페이지 켜지자마자 실행
updateTitle();