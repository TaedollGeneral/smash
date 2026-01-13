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
function verifyMasterKey() {
    const inputKey = document.getElementById('master-key-input').value;
    const MASTER_KEY = "2026m"; // validator.js의 설정과 동일하게 맞춤

    if (inputKey === MASTER_KEY) {
        closeAdminAuth();
        document.getElementById('admin-panel').style.display = 'block';
        alert("✅ 관리자 모드가 활성화되었습니다.");
    } else {
        alert("❌ 마스터키가 올바르지 않습니다.");
        document.getElementById('master-key-input').value = '';
    }
}

// 4. 관리자 도구 패널 닫기
function closeAdminMode() {
    document.getElementById('admin-panel').style.display = 'none';
}

/**
 * 5. 카톡 공지용 명단 복사 함수
 * script.js에 있는 currentDay 변수를 그대로 사용하여 현재 화면의 명단을 가공함
 */
async function copyCurrentStatus() {
    try {
        const response = await fetch(`/api/status?day=${currentDay}`); //
        const data = await response.json();
        
        if (!data || data.length === 0) {
            alert("⚠️ 현재 신청된 명단이 없습니다.");
            return;
        }

        const today = new Date();
        const dateStr = `${today.getMonth() + 1}/${today.getDate()}`;
        const dayName = currentDay === 'WED' ? '수요일' : '금요일';
        
        let text = `🏸 SMASH ${dateStr}(${dayName}) 운동 명단\n\n`;

        // 카테고리별 분류 (서버 API 응답 필드 기준: category, user_name, guest_name)
        const categories = {
            exercise: "🏃 정회원",
            guest: "😊 게스트",
            lesson: "🎓 레슨"
        };

        Object.keys(categories).forEach(key => {
            const list = data.filter(item => item.category === key);
            if (list.length > 0) {
                text += `[${categories[key]} - ${list.length}명]\n`;
                text += list.map((item, idx) => {
                    const name = item.user_name || item.student_id;
                    return key === 'guest' 
                        ? `${idx + 1}. ${item.guest_name}(${name})` 
                        : `${idx + 1}. ${name}`;
                }).join('\n');
                text += '\n\n';
            }
        });

        text += `신청: ${window.location.origin}`;

        await navigator.clipboard.writeText(text.trim());
        alert("📋 명단이 복사되었습니다! 카톡방에 붙여넣기 하세요.");

    } catch (err) {
        console.error('명단 복사 에러:', err);
        alert("데이터를 가져오는 중 오류가 발생했습니다.");
    }
}