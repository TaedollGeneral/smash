/**
 * [FILE: utils/TimeManager.js]
 * -----------------------------------------------------------------------------------------
 * 역할: SMASH 서비스의 '시간(Time)'과 '규칙(Rule)'을 관장하는 절대 권력자(Control Tower)입니다.
 * * [주요 기능]
 * 1. 설정 관리: config.json 파일을 읽고 쓰는 유일한 관리자 (메모리 캐싱 적용)
 * 2. 시간 규칙: 카테고리별(수/금 운동, 게스트 등) 5가지 상세 오픈/마감 규칙 적용
 * 3. 상태 판별: 현재 시간이 오픈 전인지, 신청 마감인지, 취소 마감인지 초 단위 판별
 * 4. 명단 초기화: 시간 규칙이 수정될 경우, 해당 카테고리의 신청 명단을 DB에서 삭제
 * 5. [수정] 마스터키 검증 함수 복구 완료
 * -----------------------------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const db = require('../config/db'); // 명단 초기화(DB 삭제)를 위해 필요

// [상수 설정]
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'config.json');
const MASTER_KEY = "2026m"; // 임원진 마스터키
const START_DATE_STRING = "2026-01-05"; // 2026년 1주차 월요일 (기준일)

// 5개 카테고리 정의 (ID는 설정 파일의 키값으로 사용됨)
const CATEGORIES = [
    { id: 'WED_EXERCISE', day: 'WED', type: 'exercise', name: '수요일 운동' },
    { id: 'WED_LESSON',   day: 'WED', type: 'lesson',   name: '수요일 레슨' },
    { id: 'WED_GUEST',    day: 'WED', type: 'guest',    name: '수요일 게스트' },
    { id: 'FRI_EXERCISE', day: 'FRI', type: 'exercise', name: '금요일 운동' },
    { id: 'FRI_GUEST',    day: 'FRI', type: 'guest',    name: '금요일 게스트' }
];

class TimeManager {
    constructor() {
        // 서버 시작 시 설정 파일을 메모리에 로드 (Disk I/O 최소화)
        this.config = this.loadConfig(); 
    }

    // =====================================================================================
    // [SECTION 1] 설정 및 주차 관리
    // =====================================================================================

    loadConfig() {
        try {
            const data = fs.readFileSync(CONFIG_PATH, 'utf8');
            return JSON.parse(data);
        } catch (err) {
            console.error("❌ [TimeManager] 설정 로드 실패. 기본값 사용.", err);
            return {
                system: { year: 2026, semester: "겨울", week: 1 },
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

    // [관리자용] 학기 초기화 (UI에서 개강 버튼 클릭 시)
    resetSemester(newSemester) {
        this.config.system.semester = newSemester;
        this.config.system.week = 1;
        this.resetOverrides(); 
        this.saveConfig();
        console.log(`🔄 [TimeManager] ${newSemester} 개강! 1주차로 리셋됨.`);
    }

    // [스케줄러용] 주차 자동 증가 (매주 토요일 00시 실행)
    incrementWeek() {
        this.config.system.week += 1;
        this.resetOverrides(); 
        this.saveConfig();
        console.log(`🆙 [TimeManager] ${this.config.system.week}주차로 변경됨.`);
    }

    // 오버라이드(임시 규칙) 초기화
    resetOverrides() {
        // 모든 시간 설정 키를 null로 초기화하여 '기본 규칙'으로 돌아가게 함
        this.config.overrides = {};
        CATEGORIES.forEach(cat => {
            this.config.overrides[`${cat.id}_OPEN`] = null;
            this.config.overrides[`${cat.id}_CLOSE`] = null;
            this.config.overrides[`${cat.id}_CANCEL`] = null;
        });
    }

    // 현재 시스템 정보 반환 (API용)
    getSystemInfo() {
        return this.config.system;
    }


    // =====================================================================================
    // [SECTION 2] 시간 규칙 엔진 (핵심 로직)
    // =====================================================================================

    /**
     * [API용] 5개 카테고리의 현재 상태를 한 번에 반환
     * - 프론트엔드 타이머가 이 정보를 받아 화면에 그립니다.
     */
    getAllTimerStatus() {
        const result = {};
        CATEGORIES.forEach(cat => {
            // 각 카테고리별 상태 계산 (상태코드, 목표시간, 메시지 등)
            result[cat.id] = this.calcCategoryState(cat.id, cat.day, cat.type);
        });
        return result;
    }

    /**
     * [API용] 사용자의 신청/취소 요청이 유효한지 검증
     * @returns { valid: boolean, msg: string }
     */
    validateApplyTime(targetDay, category) {
        // 1. 금요일 레슨 원천 차단
        if (targetDay === 'FRI' && category === 'lesson') {
            return { valid: false, msg: "금요일은 레슨이 없습니다." };
        }

        // 2. 카테고리 식별자 찾기 (예: WED_EXERCISE)
        const cat = CATEGORIES.find(c => c.day === targetDay && c.type === category);
        if (!cat) return { valid: false, msg: "잘못된 카테고리입니다." };

        // 3. 현재 상태 조회
        const status = this.calcCategoryState(cat.id, targetDay, category);
        const now = new Date();

        // 4. 상태별 차단 로직
        if (status.state === 'OPEN_WAIT') {
            return { valid: false, msg: `아직 신청 시간이 아닙니다.\n(오픈: ${this.formatDate(status.target)})` };
        }
        if (status.state === 'ENDED' || status.state === 'CANCEL_CLOSING') {
            // 신청 시점에서는 CANCEL_CLOSING 상태여도(취소만 가능하므로) 신규 신청은 막아야 함
            // 좀 더 정밀하게: "지금은 신청 마감 시간 지났음"
            if (now > status.rule.closeTime) {
                return { valid: false, msg: "신청이 마감되었습니다." };
            }
        }

        return { valid: true };
    }
    
    /**
     * [추가 검증] 취소 요청용 시간 검증
     * - 신청 마감 후라도 취소 마감 전이면 취소 가능
     */
    validateCancelTime(targetDay, category) {
        const cat = CATEGORIES.find(c => c.day === targetDay && c.type === category);
        if (!cat) return { valid: false, msg: "오류" };
        
        const status = this.calcCategoryState(cat.id, targetDay, category);
        const now = new Date();

        // 취소 마감 시간이 지났는지 확인
        if (now > status.rule.cancelTime) {
            return { valid: false, msg: "취소 가능 시간이 지났습니다." };
        }
        return { valid: true };
    }


    /**
     * [내부 로직] 카테고리 상태 계산기
     * - 현재 시간과 규칙을 비교하여 상태(State)를 결정합니다.
     * * [상태 목록]
     * 1. OPEN_WAIT : 오픈 전 (목표: 오픈 시간)
     * 2. CLOSING   : 오픈 됨 ~ 신청 마감 전 (목표: 신청 마감 시간)
     * 3. CANCEL_CLOSING : 신청 마감 ~ 취소 마감 전 (목표: 취소 마감 시간)
     * 4. ENDED     : 모든 마감 종료 (목표: 없음)
     */
    calcCategoryState(catId, day, type) {
        const now = new Date();
        const rule = this.getRule(catId, day, type); // 절대 시간(Date 객체)으로 된 규칙 가져오기

        // 1. 오픈 전
        if (now < rule.openTime) {
            return { state: 'OPEN_WAIT', target: rule.openTime, rule };
        }
        // 2. 신청 기간 (오픈 ~ 신청 마감)
        if (now < rule.closeTime) {
            return { state: 'CLOSING', target: rule.closeTime, rule };
        }
        // 3. 취소 가능 기간 (신청 마감 ~ 취소 마감)
        if (now < rule.cancelTime) {
            return { state: 'CANCEL_CLOSING', target: rule.cancelTime, rule };
        }
        // 4. 종료
        return { state: 'ENDED', target: null, rule };
    }


    /**
     * [내부 로직] 규칙 가져오기 (오버라이드 vs 기본값)
     */
    getRule(catId, day, type) {
        // 1. 오버라이드 값 확인
        const ovOpen = this.config.overrides[`${catId}_OPEN`];
        const ovClose = this.config.overrides[`${catId}_CLOSE`];
        const ovCancel = this.config.overrides[`${catId}_CANCEL`];

        // 2. 기본값 계산 (현재 주차 기준)
        const def = this.getDefaultRule(day, type);

        return {
            openTime: ovOpen ? new Date(ovOpen) : def.openTime,
            closeTime: ovClose ? new Date(ovClose) : def.closeTime,
            cancelTime: ovCancel ? new Date(ovCancel) : def.cancelTime
        };
    }

    /**
     * [기본 규칙 정의] 하드코딩된 시간 규칙
     */
    getDefaultRule(targetDay, type) {
        // 1. 이번 주 해당 요일의 '활동 날짜' 구하기
        const currentWeek = this.config.system.week;
        const start = new Date(START_DATE_STRING);
        const dayOffset = (targetDay === 'WED') ? 2 : 4;
        
        const activityDate = new Date(start);
        activityDate.setDate(start.getDate() + (currentWeek - 1) * 7 + dayOffset);

        // 2. 규칙 적용 (날짜 연산)
        let openTime = new Date(activityDate);
        let closeTime = new Date(activityDate);
        let cancelTime = new Date(activityDate);

        // [공통] 오픈 시간: 전주 토요일 22:00
        const openOffset = (targetDay === 'WED') ? -4 : -6;
        openTime.setDate(activityDate.getDate() + openOffset);
        openTime.setHours(22, 0, 0, 0);


        // [개별 마감 규칙 적용]
        if (targetDay === 'WED') {
            if (type === 'guest') {
                // 수요일 게스트: 수 18:00 신청마감, 수 24:00 취소마감
                closeTime.setHours(18, 0, 0, 0);
                cancelTime.setDate(activityDate.getDate() + 1);
                cancelTime.setHours(0, 0, 0, 0);
            } else {
                // 수요일 운동/레슨: 일 22:00 신청마감, 화 24:00 취소마감
                closeTime.setDate(activityDate.getDate() - 3);
                closeTime.setHours(22, 0, 0, 0);
                cancelTime.setHours(0, 0, 0, 0); // 당일 00시가 곧 전날 24시
            }
        } 
        else if (targetDay === 'FRI') {
            if (type === 'guest') {
                // 금요일 게스트: 금 17:00 신청마감, 금 24:00 취소마감
                closeTime.setHours(17, 0, 0, 0);
                cancelTime.setDate(activityDate.getDate() + 1);
                cancelTime.setHours(0, 0, 0, 0);
            } else {
                // 금요일 운동: 일 22:00 신청마감, 목 24:00 취소마감
                closeTime.setDate(activityDate.getDate() - 5);
                closeTime.setHours(22, 0, 0, 0);
                cancelTime.setHours(0, 0, 0, 0);
            }
        }

        return { openTime, closeTime, cancelTime };
    }


    // =====================================================================================
    // [SECTION 3] 명단 초기화 및 유틸리티
    // =====================================================================================

    /**
     * [중요] 마스터키 검증 함수 (누락되어 에러 발생했던 부분 복구)
     */
    checkMasterKey(inputKey) {
        return inputKey === MASTER_KEY;
    }

    /**
     * [명단 초기화] 시간 규칙 수정 시 호출됨
     */
    async resetList(catId) {
        const parts = catId.split('_'); 
        const day = parts[0];
        const category = parts[1].toLowerCase();

        console.log(`⚠️ [TimeManager] 명단 초기화 시도: ${day} - ${category}`);
        
        const sql = `DELETE FROM applications WHERE day = ? AND category = ?`;
        
        try {
            const [result] = await db.promise().query(sql, [day, category]);
            console.log(`✅ 명단 삭제 완료. (삭제된 인원: ${result.affectedRows}명)`);
            return true;
        } catch (err) {
            console.error("❌ 명단 초기화 실패(DB 에러):", err);
            return false;
        }
    }

    /**
     * 명단 제목 텍스트 생성 (예: "1/21 수요일 정기운동")
     */
    getTitleText(targetDay) {
        const currentWeek = this.config.system.week;
        const start = new Date(START_DATE_STRING);
        const dayOffset = (targetDay === 'WED') ? 2 : 4;
        
        const targetDate = new Date(start);
        targetDate.setDate(start.getDate() + (currentWeek - 1) * 7 + dayOffset);

        const month = targetDate.getMonth() + 1;
        const date = targetDate.getDate();
        const dayName = (targetDay === 'WED') ? '수요일' : '금요일';
        const type = (targetDay === 'WED') ? '정기운동 18-21시' : '추가운동 15-17시';

        return `${month}/${date} ${dayName} ${type}`;
    }

    // 날짜 포맷팅 유틸 (오류 메시지용)
    formatDate(dateObj) {
        if (!dateObj) return "미정";
        const d = new Date(dateObj);
        const days = ['일','월','화','수','목','금','토'];
        return `${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]}) ${d.getHours()}시`;
    }
}

module.exports = new TimeManager();