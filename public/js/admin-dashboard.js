/**
 * [FILE: public/js/admin-dashboard.js]
 * 역할: 관리자 대시보드 기능 (명단 복사, 학기 초기화, 시간 수정)
 */

(function() {
    const panel = document.getElementById('admin-dashboard-panel');
    const closeBtn = document.getElementById('dashboard-close-btn');
    const copyBtn = document.getElementById('btn-copy-list');
    const maxCapInput = document.getElementById('max-capacity');
    const semesterSelect = document.getElementById('semester-select');
    const resetBtn = document.getElementById('btn-reset-semester');

    function init() {
        closeBtn.addEventListener('click', () => {
            panel.style.display = 'none';
        });
        copyBtn.addEventListener('click', handleCopyList);
        resetBtn.addEventListener('click', handleResetSemester);
    }

    async function handleCopyList() {
        const activeBtn = document.querySelector('.day-btn.active');
        const currentDay = activeBtn ? (activeBtn.textContent.trim() === '수' ? 'WED' : 'FRI') : 'WED';
        const maxCap = parseInt(maxCapInput.value) || 0;

        try {
            const [titleRes, statusRes] = await Promise.all([
                fetch(`/api/title-text?day=${currentDay}`),
                fetch(`/api/status?day=${currentDay}`)
            ]);
            const titleData = await titleRes.json();
            const members = await statusRes.json();

            if (!members || members.length === 0) {
                alert("⚠️ 신청자가 없습니다.");
                return;
            }

            const finalMembers = members.filter(m => m.category === 'exercise');
            const finalGuests = members.filter(m => m.category === 'guest');
            const finalLessons = members.filter(m => m.category === 'lesson');
            
            let text = `📌 ${titleData.text}\n\n`;

            if (finalMembers.length > 0) {
                const limit = maxCap > 0 ? maxCap : finalMembers.length;
                const memberList = finalMembers.slice(0, limit);
                memberList.sort((a, b) => (a.user_name || a.student_id).localeCompare((b.user_name || b.student_id), 'ko'));
                memberList.forEach((m, idx) => {
                    text += (m.user_name || m.student_id).padEnd(5, ' ');
                    if ((idx + 1) % 5 === 0) text += '\n';
                });
                text += '\n\n';
            }

            text += `📍임원진\n\n\n\n`;

            if (finalGuests.length > 0) {
                text += `📍게스트\n\n`;
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

            if (currentDay === 'WED' && finalLessons.length > 0) {
                 text += `📍레슨\n\n`;
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

            if (navigator.share) {
                navigator.share({ title: 'SMASH 명단', text: text }).catch(err => console.log('공유 취소', err));
            } else {
                prompt("전체 선택 후 복사하세요:", text);
            }

        } catch (err) { console.error(err); alert("명단 불러오기 실패"); }
    }

    async function handleResetSemester() {
        const newSemester = semesterSelect.value;
        const newWeek = document.getElementById('week-input') ? document.getElementById('week-input').value : 1;
        const masterKey = window.SMASH_ADMIN_KEY;

        if (!masterKey) { alert("보안 인증 만료"); location.reload(); return; }
        if (!confirm(`[${newSemester}학기 ${newWeek}주차]로 설정을 변경하시겠습니까?`)) return;

        try {
            const res = await fetch('/api/admin/semester', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ masterKey, semester: newSemester, week: newWeek })
            });
            const result = await res.json();
            if (result.success) { alert("✅ 설정 완료!"); location.reload(); }
            else { alert("❌ 실패: " + result.message); }
        } catch (err) { console.error(err); alert("통신 오류"); }
    }

    init();
})();

// [중요] 모달 관련 함수는 window 전역 객체에 등록해야 HTML onclick에서 보입니다.
window.openTimeModal = function() {
    document.getElementById('admin-time-modal').style.display = 'flex';
};

window.closeTimeModal = function() {
    document.getElementById('admin-time-modal').style.display = 'none';
};

window.submitTimeOverride = async function() {
    const target = document.getElementById('override-target').value;
    const type = document.getElementById('override-type').value;
    const timeVal = document.getElementById('override-time').value;
    const masterKey = window.SMASH_ADMIN_KEY;

    if (!timeVal) { alert("시간을 설정해주세요."); return; }

    const overrideKey = `${target}_${type}`;

    try {
        const res = await fetch('/api/admin/override', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ masterKey, key: overrideKey, value: timeVal })
        });
        const result = await res.json();
        if (result.success) {
            alert(`✅ 변경 완료!\n[${overrideKey}] -> ${timeVal.replace('T', ' ')}`);
            location.reload();
        } else {
            alert("❌ 실패: " + result.message);
        }
    } catch (err) { console.error(err); alert("통신 오류"); }
};

window.resetAllOverrides = async function() {
    if (!confirm("모든 강제 설정을 초기화하시겠습니까?")) return;
    const masterKey = window.SMASH_ADMIN_KEY;
    try {
        const res = await fetch('/api/admin/override/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ masterKey })
        });
        const result = await res.json();
        if (result.success) { alert("✅ 초기화 완료!"); location.reload(); }
    } catch (err) { alert("통신 오류"); }
};