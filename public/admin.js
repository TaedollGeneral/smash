/**
 * [FILE: public/admin.js]
 * 역할: 관리자 인증 팝업 제어 및 임원진 전용 기능(명단 복사) 담당
 */

// 1. 관리자 인증 레이어 열기
function openAdminAuth() {
    document.getElementById('admin-auth-layer').style.display = 'flex';
    document.getElementById('master-key-input').focus();
}

// 2. 관리자 인증 레이어 닫기
function closeAdminAuth() {
    document.getElementById('admin-auth-layer').style.display = 'none';
    document.getElementById('master-key-input').value = '';
}

// 3. 마스터키 검증 ->백엔드로 이사 필요!!!!
async function verifyMasterKey() {
    const inputKey = document.getElementById('master-key-input').value;

    if (!inputKey) return;

    try {
        const response = await fetch('/api/admin/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ masterKey: inputKey })
        });

        const result = await response.json();

        if (result.success) {
            closeAdminAuth();
            document.getElementById('admin-panel').style.display = 'block';
            alert("✅ 관리자 모드가 활성화되었습니다.");
        } else {
            alert("❌ " + result.message);
            document.getElementById('master-key-input').value = '';
        }
    } catch (error) {
        alert("서버 통신 중 오류가 발생했습니다.");
    }
}

// 4. 관리자 도구 패널 닫기
function closeAdminMode() {
    document.getElementById('admin-panel').style.display = 'none';
}


//****코드 수정 필요!!!!!!!!!!!!!!!!! 그냥 현재 날짜 기준으로 수 , 금 며칠인지 계산하도록 바꾸자 */
/**
 * 5. 날짜 계산기 함수
 * 현재 주차(week)와 선택된 요일(currentDay)을 바탕으로 실제 날짜를 반환함
 */
function getTargetDate(week, day) {
    // 1. 학기 시작일 설정 (2026년 1주차 월요일: 1월 5일)
    // 이 날짜는 학기가 바뀔 때마다 여기서 한 번만 수정하면 돼!
    const startDate = new Date("2026-01-05"); 

    // 2. 주차에 따른 일수 계산: (주차 - 1) * 7일
    const daysFromWeek = (week - 1) * 7;

    // 3. 요일에 따른 보정치 계산
    const dayOffset = (day === 'WED') ? 2 : 4;

    // 4. 최종 날짜 계산
    const targetDate = new Date(startDate);
    targetDate.setDate(startDate.getDate() + daysFromWeek + dayOffset);

    // 5. 결과 포맷팅 (예: 1/14 수요일)
    const month = targetDate.getMonth() + 1;
    const date = targetDate.getDate();
    const dayName = (day === 'WED') ? '수요일' : '금요일';

    // 요일에 따른 자동 완성 문구 설정
    const type = (day === 'WED') ? '정기운동 18-21시' : '추가운동 15-17시';

    return `${month}/${date} ${dayName} ${type}`;
}



/**
 * 6. 카톡 공지용 명단 복사 함수
 * script.js에 있는 currentDay 변수를 그대로 사용하여 현재 화면의 명단을 가공함
 */
async function copyCurrentStatus() {
    let finalText = ""; // [수정] 에러 발생 시에도 텍스트를 살리기 위해 변수를 밖으로 뺌

    try {
        const [infoRes, statusRes] = await Promise.all([
            fetch('/api/info'),
            fetch(`/api/status?day=${currentDay}`)
        ]);
        const info = await infoRes.json();
        const data = await statusRes.json();
        
        if (!data || data.length === 0) {
            alert("⚠️ 신청자가 없습니다.");
            return;
        }

        const dateTitle = getTargetDate(info.week, currentDay);
        const maxCap = parseInt(document.getElementById('max-capacity').value) || 0;

        // --- [핵심: 정원 필터링 로직] ---
        const allMembers = data.filter(item => item.category === 'exercise');
        const allGuests = data.filter(item => item.category === 'guest');
        const allLessons = data.filter(item => item.category === 'lesson');

        // 1. 정회원 우선 확정
        const finalMembers = maxCap > 0 ? allMembers.slice(0, maxCap) : allMembers;

        // [추가] 정회원 가나다순 정렬
        finalMembers.sort((a, b) => {
            const nameA = a.user_name || a.student_id;
            const nameB = b.user_name || b.student_id;
            return nameA.localeCompare(nameB, 'ko');
        });
        
        // 2. 게스트 채우기 (남는 자리가 있을 때만)
        const remainingSeats = maxCap > 0 ? maxCap - finalMembers.length : 999;
        const finalGuests = remainingSeats > 0 ? allGuests.slice(0, remainingSeats) : [];

        // [추가] 게스트 가나다순 정렬
        finalGuests.sort((a, b) => a.guest_name.localeCompare(b.guest_name, 'ko'));

        // 3. 잔여석 계산
        const lastEmptySeats = maxCap > 0 ? (maxCap - (finalMembers.length + finalGuests.length)) : 0;

        // --- [텍스트 조립 시작] ---
        let text = `📌${dateTitle}\n\n`;

        // 정회원 출력 (한 줄에 5명씩 예쁘게)
        if (finalMembers.length > 0) {
            finalMembers.forEach((item, idx) => {
                const name = item.user_name || item.student_id;
                text += name.padEnd(5, ' '); // 띄어쓰기 정렬
                if ((idx + 1) % 5 === 0) text += '\n';
            });
            text += '\n\n';
        }

        text += `📍임원진\n\n\n\n`;
        
        if (finalGuests.length > 0) {
            text += `📍게스트\n\n`;
            finalGuests.forEach((item, idx) => {
                const gName = item.guest_name || "이름없음"; // 게스트 본인 이름
                text += gName.padEnd(5, ' '); 
                if ((idx + 1) % 5 === 0) text += '\n';
            });
            text += '\n\n';
        }

        if (maxCap > 0) {
            text += `( 잔여석 : ${lastEmptySeats} )\n\n\n`;
        }

        if (currentDay === 'WED' && allLessons.length > 0) {
            // [수정 포인트 1] 21시 이전 인원만 필터링하여 activeLessons 정의
            const activeLessons = allLessons.filter((item, idx) => {
                const startMin = 18 * 60; // 18:00 시작
                return (startMin + (idx * 15)) < (21 * 60); // 21:00 미만인 사람만 남김
            });

            // [수정 포인트 2] 필터링된 인원이 있을 때만 출력
            if (activeLessons.length > 0) {
                text += `📍레슨\n\n`;
                text += activeLessons.map((item, idx) => {
                    const name = item.user_name || item.student_id;
                    const startMin = 18 * 60;
                    const myTimeMin = startMin + (idx * 15); // 순서에 따른 시간 계산
                    const h = Math.floor(myTimeMin / 60);
                    const m = myTimeMin % 60;
                    const timeLabel = `${h}:${m.toString().padStart(2, '0')}`;
                    
                    return `${idx + 1}. ${name} (${timeLabel})`;
                }).join('\n');            
                text += '\n';
            }
        }

        finalText = text.trim();

        // --- [수정] 복사 실행 (아이폰 대응 강화) ---
        
        // 시도 1: 최신 API 시도 (비동기 처리로 인해 아이폰에서 실패할 확률 있음 -> catch로 넘김)
        if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(finalText);
                alert("📋 명단이 복사되었습니다!");
                return; // 성공 시 종료
            } catch (err) {
                // 아이폰 등에서 권한 문제로 실패 시 아래 '시도 2'로 넘어감
                console.warn("Clipboard API 실패, fallback 시도");
            }
        }

        // 시도 2: 전통적인 textarea 방식 (아이폰 호환 코드 추가)
        const textArea = document.createElement("textarea");
        textArea.value = finalText;
        
        // [iOS 대응] 키보드 올라옴 방지 및 선택 영역 확보
        textArea.setAttribute('readonly', ''); 
        textArea.style.position = 'absolute';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);

        // [iOS 대응] 단순 select() 대신 Range 사용
        const range = document.createRange();
        range.selectNodeContents(textArea);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        textArea.setSelectionRange(0, 999999); // 아이폰 필수: 전체 선택 강제

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (successful) {
            alert("📋 명단이 복사되었습니다! (구형 방식)");
            } else {
            throw new Error("자동 복사 실패");
        }

    } catch (err) {
        console.error(err);
        // [최후의 수단] 모든 자동 복사가 실패했을 때 (특히 아이폰)
        // 사용자가 직접 복사할 수 있도록 prompt 창에 텍스트를 띄워줌
        if (finalText) {
            prompt("📱 아이폰 보안상 자동 복사가 차단되었습니다.\n아래 텍스트를 전체 선택하여 복사하세요!", finalText);
        } else {
            alert("오류가 발생했습니다.");
        }
    }
}