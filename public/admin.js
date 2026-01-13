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
        // 1. 서버 데이터 가져오기 (currentDay 변수 공유)
        const response = await fetch(`/api/status?day=${currentDay}`);
        const data = await response.json();
        
        if (!data || data.length === 0) {
            alert("⚠️ 현재 신청된 명단이 없습니다.");
            return;
        }

        const today = new Date();
        const dateStr = `${today.getMonth() + 1}/${today.getDate()}`;
        const dayName = currentDay === 'WED' ? '수요일' : '금요일';
        
        let text = `🏸 SMASH ${dateStr}(${dayName}) 운동 명단\n\n`;
        const categories = { exercise: "🏃 정회원", guest: "😊 게스트", lesson: "🎓 레슨" };

        Object.keys(categories).forEach(key => {
            const list = data.filter(item => item.category === key);
            if (list.length > 0) {
                text += `[${categories[key]} - ${list.length}명]\n`;
                text += list.map((item, idx) => {
                    const name = item.user_name || item.student_id;
                    return key === 'guest' ? `${idx + 1}. ${item.guest_name}(${name})` : `${idx + 1}. ${name}`;
                }).join('\n');
                text += '\n\n';
            }
        });

        text += `신청: ${window.location.origin}`;
        const finalText = text.trim();

        // 2. [핵심 수정] 복사 로직 순서 변경 및 안전장치 강화
        // 최신 API가 확실히 존재할 때만 사용 (navigator.clipboard 객체 체크)
        if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(finalText);
            alert("📋 명단이 복사되었습니다!");
        } else {
            // HTTPS가 아니거나 최신 API가 없는 경우 (IP 접속 환경 등)
            const textArea = document.createElement("textarea");
            textArea.value = finalText;
            
            // 화면에 안 보이게 숨기기
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            textArea.style.top = "0";
            document.body.appendChild(textArea);
            
            textArea.focus();
            textArea.select();
            
            try {
                // 구식 복사 명령 실행 (줄 그어져 있어도 작동함)
                const successful = document.execCommand('copy');
                if (successful) {
                    alert("📋 명단이 복사되었습니다! (보안 우회 모드)");
                } else {
                    throw new Error('복사 명령 실패');
                }
            } catch (err) {
                alert("❌ 브라우저 차단으로 복사에 실패했습니다. 수동으로 복사해주세요.");
            }
            
            document.body.removeChild(textArea);
        }

    } catch (err) {
        console.error('명단 복사 에러:', err);
        alert("데이터 처리 중 오류가 발생했습니다.");
    }
}