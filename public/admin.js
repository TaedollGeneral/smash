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

// 3. 마스터키 검증
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
    // [아이폰 대응] 비동기 작업 전 미리 textarea를 생성하여 포커스 기반을 마련합니다.
    const textArea = document.createElement("textarea");
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);

    try {
        const [infoRes, statusRes] = await Promise.all([
            fetch('/api/info'),
            fetch(`/api/status?day=${currentDay}`)
        ]);
        const info = await infoRes.json();
        const data = await statusRes.json();
        
        if (!data || data.length === 0) {
            alert("⚠️ 신청자가 없습니다.");
            document.body.removeChild(textArea); // 에러 시 제거
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
                text += name.padEnd(5, ' '); 
                if ((idx + 1) % 5 === 0) text += '\n';
            });
            text += '\n\n';
        }

        text += `📍임원진\n\n\n`;
        
        if (finalGuests.length > 0) {
            text += `📍게스트\n`;
            finalGuests.forEach((item, idx) => {
                const gName = item.guest_name || "이름없음"; 
                text += gName.padEnd(5, ' '); 
                if ((idx + 1) % 5 === 0) text += '\n';
            });
            text += '\n\n';
        }

        if (maxCap > 0) {
            text += `( 잔여석 : ${lastEmptySeats} )\n\n\n`;
        }

        if (currentDay === 'WED' && allLessons.length > 0) {
            const activeLessons = allLessons.filter((item, idx) => {
                const startMin = 18 * 60; 
                return (startMin + (idx * 15)) < (21 * 60); 
            });

            if (activeLessons.length > 0) {
                text += `📍레슨\n\n`;
                text += activeLessons.map((item, idx) => {
                    const name = item.user_name || item.student_id;
                    const startMin = 18 * 60;
                    const myTimeMin = startMin + (idx * 15); 
                    const h = Math.floor(myTimeMin / 60);
                    const m = myTimeMin % 60;
                    const timeLabel = `${h}:${m.toString().padStart(2, '0')}`;
                    
                    return `${idx + 1}. ${name} (${timeLabel})`;
                }).join('\n');            
                text += '\n';
            }
        }

        const finalText = text.trim();
        textArea.value = finalText;

        // --- [아이폰 호환 복사 실행] ---
        // iOS Safari에서는 복사 로직 전에 텍스트 선택(Range)을 강제로 잡아주는 것이 중요합니다.
        if (navigator.userAgent.match(/ipad|ipod|iphone/i)) {
            const range = document.createRange();
            range.selectNodeContents(textArea);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            textArea.setSelectionRange(0, 999999);
        } else {
            textArea.select();
        }

        const successful = document.execCommand('copy');
        if (successful) {
            alert("📋 명단이 복사되었습니다!");
        } else {
            // Clipboard API 시도 (execCommand 실패 시 대비)
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(finalText);
                alert("📋 명단이 복사되었습니다!");
            } else {
                throw new Error('복사 실패');
            }
        }

    } catch (err) {
        console.error(err);
        alert("오류가 발생했습니다.");
    } finally {
        // 성공하든 실패하든 임시 생성한 textArea는 제거합니다.
        if (document.body.contains(textArea)) {
            document.body.removeChild(textArea);
        }
    }
}