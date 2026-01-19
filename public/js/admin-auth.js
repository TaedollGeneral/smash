/**
 * [FILE: public/js/admin-auth.js]
 * 역할: 관리자(임원진) 인증 담당 '문지기'
 * 기능: 마스터키 입력 검증 -> 성공 시 대시보드 패널(admin-dashboard.js) 활성화
 */

(function() {
    // 1. DOM 요소 가져오기
    const authBtn = document.getElementById('admin-auth-btn');       // ⚙️ 버튼
    const modal = document.getElementById('admin-auth-modal');       // 인증창 (검은 배경)
    const input = document.getElementById('master-key-input');       // 비번 입력칸
    const confirmBtn = document.getElementById('auth-confirm-btn');  // 확인 버튼
    const cancelBtn = document.getElementById('auth-cancel-btn');    // 취소 버튼
    
    // 대시보드 패널 (인증 성공 시 보여줄 녀석)
    const dashboard = document.getElementById('admin-dashboard-panel');

    // 2. 초기화 (이벤트 리스너 등록)
    function init() {
        // ⚙️ 버튼 누르면 -> 모달 열기
        authBtn.addEventListener('click', openModal);

        // 취소 누르면 -> 모달 닫기
        cancelBtn.addEventListener('click', closeModal);

        // 확인 누르면 -> 서버에 검사 요청
        confirmBtn.addEventListener('click', verifyMasterKey);

        // 엔터키 치면 -> 확인 버튼 누른 것과 동일하게 처리
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') verifyMasterKey();
        });
    }

    // 3. 모달 열기
    function openModal() {
        modal.style.display = 'flex';
        input.value = ''; // 입력창 비우기
        input.focus();    // 바로 입력할 수 있게 포커스
    }

    // 4. 모달 닫기
    function closeModal() {
        modal.style.display = 'none';
        input.value = '';
    }

    // 5. [핵심] 마스터키 검증 로직
    async function verifyMasterKey() {
        const key = input.value.trim();

        if (!key) {
            alert("마스터키를 입력해주세요.");
            return;
        }

        try {
            // 서버에 물어보기
            const response = await fetch('/api/admin/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ masterKey: key })
            });

            const result = await response.json();

            if (result.success) {
                // ✅ 인증 성공!
                alert("✅ 관리자 모드가 활성화되었습니다.");
                
                // 1) 전역 변수에 키 저장 (대시보드에서 쓰려고)
                window.SMASH_ADMIN_KEY = key;

                // 2) 인증창 닫고
                closeModal();

                // 3) 대시보드(통제실) 열기
                if (dashboard) {
                    dashboard.style.display = 'block';
                    // (옵션) 대시보드가 열릴 때 초기화할 게 있다면 여기서 이벤트 발송 가능
                }
            } else {
                // ❌ 인증 실패
                alert("❌ " + (result.message || "비밀번호가 틀렸습니다."));
                input.value = '';
                input.focus();
            }
        } catch (err) {
            console.error(err);
            alert("서버 통신 중 오류가 발생했습니다.");
        }
    }

    // 실행!
    init();

})();