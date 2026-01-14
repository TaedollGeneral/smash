/**
 * [FILE: public/script.js]
 * 역할: 브라우저 화면의 실시간 업데이트, 서버와의 데이터 송수신(AJAX), 사용자 이벤트 처리를 담당합니다.
 */

// ==========================================
// 1. [Global State] 전역 상태 관리
// ==========================================
let currentDay = 'WED'; 



// ==========================================
// 2. [Timer Logic] 실시간 카운트다운 로직: 투표 오픈/마감 시간 관리 중임
// ==========================================
/**
 * [함수: updateTimer]
 * 역할: 현재 요일과 시간을 기준으로 '투표 시작까지' 남았는지, '투표 마감까지' 남았는지 계산하여 화면에 표시합니다.
 * 핵심 규칙: 
 * - 투표 오픈: 매주 토요일 밤 22:00 (공통)
 * - 수요일 운동 마감: 화요일 밤 23:59:59
 * - 금요일 운동 마감: 목요일 밤 23:59:59
 */
function updateTimer() {
    // 1. 현재 시간과 요일 가져오기
    const now = new Date();
    const day = now.getDay();   // 0:일, 1:월, 2:화, 3:수, 4:목, 5:금, 6:토
    const hour = now.getHours();
    
    // 2. HTML 요소 가져오기 (텍스트와 시간 표시 부분)
    const statusText = document.getElementById('status-text');
    const timerDisplay = document.getElementById('timer-display');
    
    let targetTime = new Date();
    let mode = ""; // 현재 상태 (OPEN_WAIT: 오픈 전 대기, CLOSING: 투표 진행 중)

    // ---------------------------------------------------------
    // [CASE 1] 수요일(WED) 운동을 보고 있을 때
    // ---------------------------------------------------------
    if (currentDay === 'WED') {
        // 수(3), 목(4), 금(5)요일이거나, 토(6)요일 밤 10시(22시) 전이라면?
        // => 아직 다음 주 투표가 안 열린 상태입니다. (토요일 22시 오픈 대기)
        if (day === 3 || day === 4 || day === 5 || (day === 6 && hour < 22)) {
            mode = "OPEN_WAIT";
            // 목표 시간 설정: 다가오는 토요일 22:00
            const dist = (6 - day + 7) % 7;
            targetTime.setDate(now.getDate() + dist);
            targetTime.setHours(22, 0, 0, 0);
        } else {
            // 그 외 시간 (토요일 22시 이후 ~ 화요일) => 투표가 열려있는 상태!
            mode = "CLOSING";
            // 목표 시간 설정: 다가오는 수요일 00:00 (즉, 화요일 23:59:59 마감)
            let dist = (2 - day + 7) % 7; // 2는 화요일을 의미 (화요일 밤까지니까)
            targetTime.setDate(now.getDate() + dist);
            targetTime.setHours(23, 59, 59, 999);
        }
    } 
    // ---------------------------------------------------------
    // [CASE 2] 금요일(FRI) 운동을 보고 있을 때
    // ---------------------------------------------------------
    else if (currentDay === 'FRI') {
        // 금(5)요일이거나, 토(6)요일 밤 10시(22시) 전이라면?
        // => 아직 투표 오픈 전입니다.
        if (day === 5 || (day === 6 && hour < 22)) {
            mode = "OPEN_WAIT";
            // 목표 시간 설정: 다가오는 토요일 22:00
            const dist = (6 - day + 7) % 7;
            targetTime.setDate(now.getDate() + dist);
            targetTime.setHours(22, 0, 0, 0);
        } else {
            // 그 외 시간 (오픈 후) => 투표 진행 중
            mode = "CLOSING";
            // 목표 시간 설정: 다가오는 금요일 00:00 (즉, 목요일 23:59:59 마감)
            let dist = (4 - day + 7) % 7; // 4는 목요일을 의미
            targetTime.setDate(now.getDate() + dist);
            targetTime.setHours(23, 59, 59, 999);
        }
    }

    // [예외 처리] 만약 계산된 목표 시간이 이미 지난 시간이라면? (예: 일요일에 토요일을 타겟으로 잡음)
    // => 다음 주 같은 요일로 7일을 더해서 미래로 넘겨줍니다.
    if (targetTime < now) targetTime.setDate(targetTime.getDate() + 7);

    // 3. 상태에 따른 텍스트 및 색상 변경
    if (mode === "OPEN_WAIT") {
        statusText.innerText = "투표 시작까지";
        timerDisplay.className = "timer-text text-gray"; // 회색 (대기 중)
    } else {
        statusText.innerText = "투표 마감까지";
        timerDisplay.className = "timer-text text-green"; // 초록색 (활성 상태)
    }

    // 4. 남은 시간(diff) 계산 (밀리초 단위)
    const diff = targetTime - now;
    
    // 시간이 다 됐으면 00:00:00:00 처리하고 종료
    if (diff < 0) {
        timerDisplay.innerText = "00:00:00:00";
        return;
    }

    // 5. 밀리초를 일:시:분:초 로 변환
    const d = Math.floor(diff / (1000 * 60 * 60 * 24));      // 남은 일수
    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);    // 남은 시간
    const m = Math.floor((diff / (1000 * 60)) % 60);         // 남은 분
    const s = Math.floor((diff / 1000) % 60);                // 남은 초

    // 6. 화면에 출력 (두 자리수 포맷팅 00:00:00:00)
    timerDisplay.innerText = 
        `${d.toString().padStart(2, '0')}:${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// 1초(1000ms)마다 updateTimer 함수를 실행시켜 시간을 갱신함
setInterval(updateTimer, 1000);
// 페이지 로드 시 1초 기다리지 않고 즉시 한 번 실행
updateTimer();







// ==========================================
// 3. [Data Fetching] 서버 데이터 통신: 명단
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
// 4. [Event Handlers] 수/금 클릭 이벤트 처리
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

// ==========================================
// 5. [Guest Input Box] 게스트 카테고리 선택 시에만 인풋 박스 표시
// ==========================================

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
// 6. [AJAX Submission] 폼 제출 로직
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
            /*다음 신청을 위해 id pwd 둘다 그대로 남김
            document.getElementById('user-id').value = '';
            document.getElementById('user-pwd').value = '';
            */
        } else {
            alert("실패: " + result.message);
        }
    } catch (error) {
        alert("서버 연결 실패");
    }
}

// ==========================================
// 7. [UI Utilities] 테이블 그리기 및 정보 업데이트
// ==========================================
/**
 * [함수: addRawToTable]
 * 역할: 서버에서 받은 데이터나 방금 신청한 데이터를 화면의 표(Table)에 한 줄씩 추가합니다.
 * @param {string} category - 신청 종류 ('exercise', 'guest', 'lesson')
 * @param {string} applicantName - 신청자(부원) 이름
 * @param {string} guestName - 게스트 이름 (없으면 빈칸)
 * @param {string} timeOverride - 신청 시간 (서버 시간 기준, 없으면 현재 시간)
 */
function addRawToTable(category, applicantName, guestName, timeOverride = null) {
    let targetTableId = ""; // 데이터를 넣을 테이블의 ID (HTML 태그 ID)
    let col1_text = "";     // 두 번째 칸에 들어갈 내용 (주로 이름)
    let col2_text = "";     // 세 번째 칸에 들어갈 내용 (시간 또는 신청자)

    // ---------------------------------------------------------
    // 1. 시간 포맷팅 로직 강화 (요일:HH:MM:SS)
    // ---------------------------------------------------------
    let displayTime;
    const dateObj = timeOverride ? new Date(timeOverride) : new Date();

    // 01. 요일 구하기 (한글)
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = days[dateObj.getDay()]; // 0(일) ~ 6(토)를 한글로 변환

    // 02. 시, 분, 초 구하기 (모두 두 자리로 0 채움)
    // 기존에는 분만 채웠으나, 요청대로 시(Hour)와 초(Second)도 0을 채웁니다.
    const hh = dateObj.getHours().toString().padStart(2, '0');
    const mm = dateObj.getMinutes().toString().padStart(2, '0');
    const ss = dateObj.getSeconds().toString().padStart(2, '0');

    // 03. 최종 문자열 조립 (예: "수:18:30:05")
    displayTime = `${dayName}:${hh}:${mm}:${ss}`;
    // ------------------------------------------------------------
    // 1. end
    // ------------------------------------------------------------


    // 2. 카테고리별로 넣을 내용 결정
    if (category === "exercise") {
        // [운동 신청일 때]
        targetTableId = "exercise-list";
        col1_text = applicantName; // 이름
        col2_text = displayTime;   // 신청 시간
    } else if (category === "guest") {
        // [게스트 신청일 때]
        targetTableId = "guest-list";
        col1_text = guestName;     // 게스트 이름 (주인공)
        col2_text = applicantName; // 데려온 사람 (보증인)
    } else if (category === "lesson") {
        // [레슨 신청일 때] - 여기가 제일 복잡합니다!
        targetTableId = "lesson-list";
        col1_text = applicantName; 
        
        // ---------------------------------------------------------
        // [레슨 시간 자동 계산 로직]
        // 레슨은 18:00부터 시작해서 앞사람 수만큼 15분씩 뒤로 밀립니다.
        // ---------------------------------------------------------
        const tbody = document.getElementById('lesson-list');
        const currentCount = tbody.children.length; // 현재 신청된 사람 수 (0명, 1명...)
        
        const startMin = 18 * 60; // 시작 시간: 18시를 분으로 환산 (1080분)
        // 내 레슨 시간 = 18시 + (내 앞사람 수 * 15분)
        const myLessonTimeMin = startMin + (currentCount * 15);
        
        // 21:00 (1260분)가 넘어가면 '대기'로 표시
        if (myLessonTimeMin >= 21 * 60) {
            col2_text = "대기";
        } else {
            // 분을 다시 '시:분'으로 변환
            const h = Math.floor(myLessonTimeMin / 60); // 몫은 '시'
            const m = myLessonTimeMin % 60;             // 나머지는 '분'
            col2_text = `${h}:${m.toString().padStart(2, '0')}`;
        }
    }

    // 3. 실제 테이블(HTML) 찾기
    const tbody = document.getElementById(targetTableId);
    if (!tbody) return; // 테이블이 없으면 중단 (에러 방지)

    // 4. 새로운 줄(tr) 만들기
    const newRow = document.createElement('tr');
    // 순번 계산: 현재 줄 개수 + 1
    const no = tbody.children.length + 1;

    // 5. HTML 조립해서 화면에 끼워 넣기
    // <td>순번</td> <td>이름/게스트</td> <td>시간/신청자</td>
    newRow.innerHTML = `<td>${no}</td><td>${col1_text}</td><td>${col2_text}</td>`;
    tbody.appendChild(newRow);
}

/**
 * [함수: updateTitle]
 * 역할: 서버(/api/info)에 물어봐서 현재가 몇 학기, 몇 주차인지 가져와 제목을 바꿉니다.
 */
function updateTitle() {
    fetch('/api/info')
        .then(res => res.json())
        .then(data => {
            const titleElement = document.querySelector('.title');
            if (titleElement) {
                // 예: "겨울학기 2주차" 라고 글씨를 바꿈
                titleElement.innerText = `${data.semester}학기 ${data.week}주차`;
            }
        })
        .catch(err => console.error("주차 정보 로딩 실패:", err));
}

// 페이지가 로드되자마자 제목부터 업데이트 실행
updateTitle();



/**
 * [함수: toggleAccordion]
 * 역할: 모바일 화면에서 명단 패널 제목을 누르면 접었다 폈다(토글) 합니다.
 * @param {string} panelId - 접고 펼칠 패널의 ID (예: 'exercise-panel')
 */
function toggleAccordion(panelId) {
    // PC 화면(768px 초과)에서는 항상 펼쳐져 있어야 하므로 작동 안 함
    if (window.innerWidth <= 768) {
        const panel = document.getElementById(panelId);
        // 'collapsed' 클래스를 넣었다 뺐다 함 (CSS가 이걸 보고 화면을 숨김)
        panel.classList.toggle('collapsed');
    }
}



// ---------------------------------------------------------
// [서비스 워커 등록] - PWA(앱) 기능을 위한 필수 설정
// ---------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // 브라우저가 서비스 워커를 지원하면 등록 시도
    navigator.serviceWorker.register('/service-worker.js')
      .then((reg) => console.log('✅ 서비스 워커 등록 성공!', reg))
      .catch((err) => console.log('❌ 서비스 워커 등록 실패:', err));
  });
}