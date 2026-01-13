/**
 * [FILE: utils/validator.js]
 * 역할: 사용자가 신청/취소를 시도할 때, 현재 시간이 허용된 범위인지 판별합니다.
 * 주요 규칙: 토요일 22:00 오픈 / 각 요일 및 종목별 순차적 마감
 */

/**
 * 시간 검증 함수
 * @param {string} targetDay - 사용자가 선택한 요일 ('WED' 또는 'FRI')
 * @param {string} category - 신청 종목 ('exercise', 'lesson', 'guest')
 * @returns {object} - { valid: true/false, msg: "에러메시지" }
 */

//------------------------------------------------------------------------
// 1. 임원진 마스터키 검증 함수 (pwd), 단순 일치 검증(관리자 패널)
//------------------------------------------------------------------------
const MASTER_KEY = "2026m";

function checkMasterAuth(pwd)
{
    if (pwd !== MASTER_KEY) return { valid: false };

    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();

    if(day === 6 && hour < 22)
    {
        return { valid: false, msg: "투표 오픈 전 마스터키 적용 불가" };
    }
    
    return { valid: true};
}

const checkMasterKey = (inputKey) => {
    return inputKey === MASTER_KEY;
};




//-------------------------------------------------------------------------
// 2. 일반 회원용 "시간" 검증 함수 (요일, 카테고리)
//-------------------------------------------------------------------------

function checkTimeParams(targetDay, category) {
    // 현재 시스템 날짜와 시간 정보를 가져옵니다.
    const now = new Date();
    
    // 현재 요일을 숫자로 변환 (0:일, 1:월, 2:화, 3:수, 4:목, 5:금, 6:토)
    const day = now.getDay(); 
    
    // 현재 시(hour) 정보를 24시간 체계로 가져옵니다. (0~23)
    const hour = now.getHours();

    // ---------------------------------------------------------
    // [추가] 금요일 레슨 원천 차단 규칙
    // ---------------------------------------------------------
    if (targetDay === 'FRI' && category === 'lesson') {
        return { 
            valid: false, 
            msg: "금요일은 레슨이 없습니다." 
        };
    }

    // ---------------------------------------------------------
    // 2-1. [공통 규칙] 토요일 오픈 전 차단 (매주 투표의 시작점)
    // ---------------------------------------------------------
    // 요일이 토요일(6)이고, 시간이 밤 10시(22시) 이전이라면 아직 투표 기간이 아닙니다.
    // 이는 금요일 게스트 마감(금 23:59) 직후인 토요일 새벽부터 밤까지를 모두 포함합니다.
    if (day === 6 && hour < 22) {
        return { 
            valid: false, 
            msg: "지금은 투표 시간이 아닙니다. (토요일 22시 오픈)" 
        };
    }

    // ---------------------------------------------------------
    // 2-2. [요일별/카테고리별] 세부 마감 시간 체크
    // ---------------------------------------------------------
    
    // 사용자가 '수요일(WED)' 투표를 하려는 경우
    if (targetDay === 'WED') {
        if (category === 'guest') {
            // [수요일 게스트]: 수요일 23:59까지 신청 가능 (목요일 00:00 마감)
            // 따라서 현재가 목요일(4) 또는 금요일(5)이라면 신청을 막습니다.
            if (day === 4 || day === 5) {
                return { valid: false, msg: "수요일 게스트 신청이 마감되었습니다." };
            }
        } else {
            // [수요일 일반/레슨]: 화요일 23:59까지 신청 가능 (수요일 00:00 마감)
            // 따라서 현재가 수요일(3), 목요일(4), 금요일(5)이라면 신청을 막습니다.
            if (day === 3 || day === 4 || day === 5) {
                return { valid: false, msg: "수요일 투표가 마감되었습니다." };
            }
        }
    } 
    // 사용자가 '금요일(FRI)' 투표를 하려는 경우
    else if (targetDay === 'FRI') {
        if (category === 'guest') {
            // [금요일 게스트]: 금요일 23:59까지 신청 가능 (토요일 00:00 마감)
            // 토요일 00:00부터는 위의 '1번 공통 규칙(토요일 22시 전 금지)'에 의해 자동으로 걸러집니다.
            // 별도의 추가 조건 없이 통과시킵니다.
        } else {
            // [금요일 일반/레슨]: 목요일 23:59까지 신청 가능 (금요일 00:00 마감)
            // 따라서 현재가 금요일(5)이라면 신청을 막습니다.
            if (day === 5) {
                return { valid: false, msg: "금요일 투표가 마감되었습니다." };
            }
        }
    }

    // 위의 모든 필터링 조건에 걸리지 않았다면, '신청 가능한 시간'으로 판단합니다.
    return { valid: true };
}





//-------------------------------------------------------------------------
// 3. 일반 회원용 "pwd" 검증 함수
//-------------------------------------------------------------------------
const db = require('../config/db'); //본인 확인용 db 조회

async function checkUserAuth(id, pwd)
{
    return new Promise((resolve) => {
        const sql = `SELECT name FROM users WHERE student_id = ? AND password = ?`;
        db.query(sql, [id, pwd], (err, users) => {
            if(err) return resolve({ valid: false, msg: "서버 에러"});
            if(users.length === 0) return resolve({ valid: false, msg: "비밀번호가 틀렸거나 등록되지 않은 학번입니다."});
            resolve({ valid: true, name: users[0].name });
        });
    });
}






/**
 * 다른 파일(api.js 등)에서 이 함수를 불러와서 사용할 수 있도록 내보냅니다.
 * { checkTimeParams: checkTimeParams }의 줄임표현입니다.
 */
module.exports = { checkTimeParams, checkMasterAuth, checkUserAuth, checkMasterKey};
