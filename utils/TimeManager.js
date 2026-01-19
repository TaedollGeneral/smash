/**
 * [FILE: utils/TimeManager.js]
 * -----------------------------------------------------------------------------------------
 * 역할: SMASH 서비스의 '시간(Time)'과 '규칙(Rule)'을 관장하는 절대 권력자(Control Tower)입니다.
 * [변경 사항]
 * - startDate, week 등 '저장된 상태'에 의존하지 않습니다.
 * - 오직 '현재 시간(Now)'을 기준으로 이번 주 수요일/금요일을 자동으로 계산합니다.
 * -----------------------------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

// [상수 설정]
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'config.json');
const MASTER_KEY = "2026m"; 

const CATEGORIES = [
    { id: 'WED_EXERCISE', day: 'WED', type: 'exercise', name: '수요일 운동' },
    { id: 'WED_LESSON',   day: 'WED', type: 'lesson',   name: '수요일 레슨' },
    { id: 'WED_GUEST',    day: 'WED', type: 'guest',    name: '수요일 게스트' },
    { id: 'FRI_EXERCISE', day: 'FRI', type: 'exercise', name: '금요일 운동' },
    { id: 'FRI_GUEST',    day: 'FRI', type: 'guest',    name: '금요일 게스트' }
];

class TimeManager {
    constructor() {
        this.config = this.loadConfig(); 
    }

    // =====================================================================================
    // [SECTION 1] 설정 관리 (날짜 계산에는 관여 X, 학기/주차 표시용으로만 사용)
    // =====================================================================================

    loadConfig() {
        try {
            const data = fs.readFileSync(CONFIG_PATH, 'utf8');
            return JSON.parse(data);
        } catch (err) {
            console.error("❌ [TimeManager] 설정 로드 실패. 기본값 사용.", err);
            return {
                system: { year: 2026, semester: "겨울", week: 1 }, // 날짜 계산엔 안 씀
                overrides: {}
            };
        }
    }

    saveConfig() {
        try {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2));
            console.log("💾 [TimeManager] 설정 저장 완료");
        } catch (err) {
            console.error("❌ [TimeManager] 설정 저장 실패", err);
        }
    }

    resetSemester(newSemester) {
        // 이제 날짜 계산 로직이 없으므로, 단순히 표시용 텍스트만 바꿉니다.
        this.config.system.semester = newSemester;
        this.config.system.week = 1; 
        this.resetOverrides(); 
        this.saveConfig();
        console.log(`🔄 [TimeManager] ${newSemester} 개강 (표시용 주차 리셋)`);
    }

    incrementWeek() {
        this.config.system.week += 1;
        this.resetOverrides(); 
        this.saveConfig();
        console.log(`🆙 [TimeManager] ${this.config.system.week}주차로 변경됨.`);
    }

    resetOverrides() {
        this.config.overrides = {};
        CATEGORIES.forEach(cat => {
            this.config.overrides[`${cat.id}_OPEN`] = null;
            this.config.overrides[`${cat.id}_CLOSE`] = null;
            this.config.overrides[`${cat.id}_CANCEL`] = null;
        });
    }

    getSystemInfo() {
        return this.config.system;
    }


    // =====================================================================================
    // [SECTION 2] 시간 규칙 엔진 (핵심: 자동 날짜 계산)
    // =====================================================================================

    /**
     * [핵심] 현재 시점을 기준으로 '이번 회차'의 활동 날짜(수/금)를 계산합니다.
     * 기준: 매주 토요일 22:00를 기점으로 회차가 넘어갑니다.
     */
    getActivityDate(targetDay) {
        const now = new Date();
        const day = now.getDay(); // 0(일)~6(토)
        const hour = now.getHours();

        // 1. 이번 주 월요일 찾기
        // (주의: 일요일(0)인 경우, JS에서 getDay()는 이번 주 시작이 아니라 한 주 뒤로 인식될 수 있음)
        // 안전하게: 현재 날짜에서 (요일-1)만큼 뺌. (월=0일 뺌, 화=1일 뺌...)
        // 단, 일요일(0)은 -6을 해야 지난 주 월요일이 아니라 '이번 주(끝자락) 일요일' 기준의 월요일이 됨.
        // 우리는 "토요일 22시"가 넘어가면 다음 주 활동을 바라봐야 함.

        // 더 쉬운 로직: "다가오는 수요일/금요일"을 찾자.
        // 단, 오늘이 수요일인데 23시라면? -> 이번 주 수요일임.
        // 오늘이 토요일 23시라면? -> 다음 주 수요일임.

        let targetDate = new Date(now);
        
        // 현재 요일이 토(6)이고 22시가 넘었으면 -> '다음 주'로 간주
        const isNextCycle = (day === 6 && hour >= 22);
        
        // '이번 주'의 월요일을 기준으로 잡음
        // (일요일이면 day가 0이므로 -6을 해줘야 월요일로 돌아감)
        const dayDiffToMon = (day === 0) ? -6 : (1 - day);
        targetDate.setDate(now.getDate() + dayDiffToMon); // 이번 주 월요일로 이동

        // 만약 다음 사이클(토 22시 이후)이면 7일 더함
        if (isNextCycle) {
            targetDate.setDate(targetDate.getDate() + 7);
        }

        // 월요일 기준으로 수(+2), 금(+4) 계산
        const offset = (targetDay === 'WED') ? 2 : 4;
        targetDate.setDate(targetDate.getDate() + offset);
        targetDate.setHours(0, 0, 0, 0); // 00시 00분으로 초기화

        return targetDate;
    }

    // ----------------------------------------------------------------------

    getAllTimerStatus() {
        const result = {};
        CATEGORIES.forEach(cat => {
            result[cat.id] = this.calcCategoryState(cat.id, cat.day, cat.type);
        });
        return result;
    }

    validateApplyTime(targetDay, category) {
        if (targetDay === 'FRI' && category === 'lesson') return { valid: false, msg: "금요일은 레슨이 없습니다." };

        const cat = CATEGORIES.find(c => c.day === targetDay && c.type === category);
        if (!cat) return { valid: false, msg: "잘못된 카테고리입니다." };

        const status = this.calcCategoryState(cat.id, targetDay, category);
        const now = new Date();

        if (status.state === 'OPEN_WAIT') {
            return { valid: false, msg: `아직 신청 시간이 아닙니다.\n(오픈: ${this.formatDate(status.target)})` };
        }
        if (status.state === 'ENDED' || status.state === 'CANCEL_CLOSING') {
            if (now > status.rule.closeTime) return { valid: false, msg: "신청이 마감되었습니다." };
        }
        return { valid: true };
    }
    
    validateCancelTime(targetDay, category) {
        const cat = CATEGORIES.find(c => c.day === targetDay && c.type === category);
        if (!cat) return { valid: false, msg: "오류" };
        
        const status = this.calcCategoryState(cat.id, targetDay, category);
        const now = new Date();

        if (now > status.rule.cancelTime) return { valid: false, msg: "취소 가능 시간이 지났습니다." };
        return { valid: true };
    }

    calcCategoryState(catId, day, type) {
        const now = new Date();
        const rule = this.getRule(catId, day, type); 

        if (now < rule.openTime) return { state: 'OPEN_WAIT', target: rule.openTime, rule };
        if (now < rule.closeTime) return { state: 'CLOSING', target: rule.closeTime, rule };
        if (now < rule.cancelTime) return { state: 'CANCEL_CLOSING', target: rule.cancelTime, rule };
        return { state: 'ENDED', target: null, rule };
    }

    getRule(catId, day, type) {
        const ovOpen = this.config.overrides[`${catId}_OPEN`];
        const ovClose = this.config.overrides[`${catId}_CLOSE`];
        const ovCancel = this.config.overrides[`${catId}_CANCEL`];
        const def = this.getDefaultRule(day, type);

        return {
            openTime: ovOpen ? new Date(ovOpen) : def.openTime,
            closeTime: ovClose ? new Date(ovClose) : def.closeTime,
            cancelTime: ovCancel ? new Date(ovCancel) : def.cancelTime
        };
    }

    /**
     * [수정됨] startDate 없이, getActivityDate()로 자동 계산
     */
    getDefaultRule(targetDay, type) {
        // 1. 이번 회차의 활동 날짜(수/금)를 자동으로 구함
        const activityDate = this.getActivityDate(targetDay);

        // 2. 규칙 적용 (역산)
        let openTime = new Date(activityDate);
        let closeTime = new Date(activityDate);
        let cancelTime = new Date(activityDate);

        // [공통] 오픈: 전주 토요일 22:00
        const openOffset = (targetDay === 'WED') ? -4 : -6;
        openTime.setDate(activityDate.getDate() + openOffset);
        openTime.setHours(22, 0, 0, 0);

        // [개별 마감 규칙]
        if (targetDay === 'WED') {
            if (type === 'guest') {
                // 수요일 게스트: 수 18:00 마감
                closeTime.setHours(18, 0, 0, 0);
                cancelTime.setDate(activityDate.getDate() + 1); // 다음날 00시
                cancelTime.setHours(0, 0, 0, 0);
            } else {
                // 수요일 운동: 일요일 22:00 마감
                // ★ 주의: 오늘이 화요일이면, 일요일은 이미 지났으므로 '마감됨'이 뜨는게 정상입니다.
                // 테스트를 위해 열고 싶다면 이 부분을 수정하거나 오버라이드 하세요.
                closeTime.setDate(activityDate.getDate() - 3); 
                closeTime.setHours(22, 0, 0, 0);
                cancelTime.setHours(0, 0, 0, 0); 
            }
        } 
        else if (targetDay === 'FRI') {
            if (type === 'guest') {
                closeTime.setHours(17, 0, 0, 0);
                cancelTime.setDate(activityDate.getDate() + 1);
                cancelTime.setHours(0, 0, 0, 0);
            } else {
                // 금요일 운동: 일요일 22:00 마감
                closeTime.setDate(activityDate.getDate() - 5);
                closeTime.setHours(22, 0, 0, 0);
                cancelTime.setHours(0, 0, 0, 0);
            }
        }

        return { openTime, closeTime, cancelTime };
    }


    // =====================================================================================
    // [SECTION 3] 유틸리티
    // =====================================================================================

    checkMasterKey(inputKey) {
        return inputKey === MASTER_KEY;
    }

    async resetList(catId) {
        const parts = catId.split('_'); 
        const day = parts[0];
        const category = parts[1].toLowerCase();
        const sql = `DELETE FROM applications WHERE day = ? AND category = ?`;
        try {
            const [result] = await db.promise().query(sql, [day, category]);
            return true;
        } catch (err) {
            return false;
        }
    }

    getTitleText(targetDay) {
        // 제목용 날짜도 자동으로 계산
        const targetDate = this.getActivityDate(targetDay);
        const month = targetDate.getMonth() + 1;
        const date = targetDate.getDate();
        const dayName = (targetDay === 'WED') ? '수요일' : '금요일';
        const type = (targetDay === 'WED') ? '정기운동 18-21시' : '추가운동 15-17시';
        return `${month}/${date} ${dayName} ${type}`;
    }

    formatDate(dateObj) {
        if (!dateObj) return "미정";
        const d = new Date(dateObj);
        const days = ['일','월','화','수','목','금','토'];
        return `${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]}) ${d.getHours()}시`;
    }
}

module.exports = new TimeManager();