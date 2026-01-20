/**
 * [FILE: public/js/admin-dashboard.js]
 * 역할: 관리자 대시보드 기능 (명단 복사, 학기 초기화 등)
 * 특징: 로직을 직접 수행하지 않고, 서버(TimeManager) API를 호출하여 처리함.
 */

(function() {
    // DOM 요소
    const panel = document.getElementById('admin-dashboard-panel');
    const closeBtn = document.getElementById('dashboard-close-btn');
    
    // 명단 복사 관련
    const copyBtn = document.getElementById('btn-copy-list');
    const maxCapInput = document.getElementById('max-capacity');

    // 학기 초기화 관련
    const semesterSelect = document.getElementById('semester-select');
    const resetBtn = document.getElementById('btn-reset-semester');


    // 초기화
    function init() {
        // 닫기 버튼
        closeBtn.addEventListener('click', () => {
            panel.style.display = 'none';
        });

        // 1. 명단 복사 & 공유 버튼
        copyBtn.addEventListener('click', handleCopyList);

        // 2. 개강(학기 초기화) 버튼
        resetBtn.addEventListener('click', handleResetSemester);
    }


    /**
     * [기능 1] 명단 복사 및 공유 (Web Share API)
     * - 서버에서 제목(Title)과 명단(Status)을 가져와 조립 후 공유
     */
    async function handleCopyList() {
        // 현재 선택된 요일 가져오기 (DOM에서 활성화된 버튼 찾기)
        // script.js의 상태에 의존하지 않고 독립적으로 파악
        const activeBtn = document.querySelector('.day-btn.active');
        const currentDay = activeBtn ? (activeBtn.textContent.trim() === '수' ? 'WED' : 'FRI') : 'WED';
        
        const maxCap = parseInt(maxCapInput.value) || 0; // 정원 (입력 없으면 0)

        try {
            // [서버 요청] 1. 명단 제목 가져오기 (TimeManager가 만들어줌)
            // [서버 요청] 2. 실제 명단 데이터 가져오기
            const [titleRes, statusRes] = await Promise.all([
                fetch(`/api/title-text?day=${currentDay}`),
                fetch(`/api/status?day=${currentDay}`)
            ]);

            const titleData = await titleRes.json(); // { text: "1/21 수요일 정기운동" }
            const members = await statusRes.json();  // [ ...명단 배열... ]

            if (!members || members.length === 0) {
                alert("⚠️ 신청자가 없습니다.");
                return;
            }

            // --- 텍스트 조립 (프론트엔드 UI 역할) ---
            const finalMembers = members.filter(m => m.category === 'exercise');
            const finalGuests = members.filter(m => m.category === 'guest');
            const finalLessons = members.filter(m => m.category === 'lesson');

            // 정원 자르기 로직 등은 UI 표현의 영역이므로 여기서 수행
            // (간소화를 위해 상세 정렬/필터 로직은 기존 admin.js 로직을 따름)
            
            let text = `📌 ${titleData.text}\n\n`; // 서버가 준 제목 사용!

            // 정회원
            if (finalMembers.length > 0) {
                const limit = maxCap > 0 ? maxCap : finalMembers.length;
                const memberList = finalMembers.slice(0, limit); // 정원 컷
                
                // 가나다순 정렬
                memberList.sort((a, b) => (a.user_name || a.student_id).localeCompare((b.user_name || b.student_id), 'ko'));

                memberList.forEach((m, idx) => {
                    text += (m.user_name || m.student_id).padEnd(5, ' ');
                    if ((idx + 1) % 5 === 0) text += '\n';
                });
                text += '\n\n';
            }

            text += `📍임원진\n\n\n\n`;

            // 게스트
            if (finalGuests.length > 0) {
                text += `📍게스트\n\n`;
                // 남은 자리 계산
                const remaining = maxCap > 0 ? (maxCap - finalMembers.length) : 999;
                const guestList = (remaining > 0) ? finalGuests.slice(0, remaining) : [];
                
                guestList.sort((a, b) => a.guest_name.localeCompare(b.guest_name, 'ko'));

                guestList.forEach((g, idx) => {
                    text += (g.guest_name).padEnd(5, ' ');
                    if ((idx + 1) % 5 === 0) text += '\n';
                });
                text += '\n\n';
            }

            if (maxCap > 0) {
                const total = Math.min(finalMembers.length, maxCap) + Math.min(finalGuests.length, Math.max(0, maxCap - finalMembers.length));
                text += `( 잔여석 : ${Math.max(0, maxCap - total)} )\n\n\n`;
            }

            // 레슨 (수요일만)
            if (currentDay === 'WED' && finalLessons.length > 0) {
                 text += `📍레슨\n\n`;
                 // 레슨 로직: 18:00부터 15분 간격 (단순화)
                 finalLessons.forEach((l, idx) => {
                     const startMin = 18 * 60 + (idx * 15);
                     if (startMin < 21 * 60) {
                        const h = Math.floor(startMin / 60);
                        const m = startMin % 60;
                        const timeStr = `${h}:${m.toString().padStart(2, '0')}`;
                        text += `${idx + 1}. ${l.user_name || l.student_id} (${timeStr})\n`;
                     }
                 });
                 text += '\n';
            }

            // [핵심] 공유하기 실행
            if (navigator.share) {
                navigator.share({
                    title: 'SMASH 명단',
                    text: text
                }).catch(err => console.log('공유 취소', err));
            } else {
                // PC 등 미지원 환경
                prompt("전체 선택 후 복사하세요:", text);
            }

        } catch (err) {
            console.error(err);
            alert("명단 불러오기 실패");
        }
    }


    /**
     * [기능 2] 학기 초기화 (개강)
     * - 마스터키(admin-auth.js에서 저장됨)를 함께 전송해야 함
     */
/**
 * [기능 2] 학기 및 주차 설정 (Override)
 */
async function handleResetSemester() {
    const newSemester = semesterSelect.value;
    const newWeek = document.getElementById('week-input').value; // [NEW] 주차 값 가져오기
    const masterKey = window.SMASH_ADMIN_KEY; 

    if (!masterKey) {
        alert("보안 인증이 만료되었습니다. 다시 로그인해주세요.");
        location.reload();
        return;
    }

    // 메시지 수정: "초기화"가 아니라 "설정"임을 명시
    if (!confirm(`[${newSemester}학기 ${newWeek}주차]로 설정을 변경하시겠습니까?\n\n⚠️ 주의: 현재 시스템의 시간이 이 기준으로 변경됩니다.`)) {
        return;
    }

    try {
        const res = await fetch('/api/admin/semester', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                masterKey: masterKey,
                semester: newSemester,
                week: newWeek // [NEW] 주차 데이터 전송
            })
        });

        const result = await res.json();
        if (result.success) {
            alert("✅ 설정이 반영되었습니다!");
            location.reload(); 
        } else {
            alert("❌ 실패: " + result.message);
        }
    } catch (err) {
        console.error(err);
        alert("서버 통신 오류");
    }
}
    // 실행
    init();

})();