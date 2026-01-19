/**
 * [FILE: utils/TimeManager.js]
 * -----------------------------------------------------------------------------------------
 * 역할: SMASH 서비스의 '시간(Time)'과 '규칙(Rule)'을 관장하는 절대 권력자(Control Tower)입니다.
 * * [주요 기능]
 * 1. 설정 관리: config.json 파일을 읽고 쓰는 유일한 관리자 (메모리 캐싱 적용)
 * 2. 시간 규칙: 카테고리별(수/금 운동, 게스트 등) 5가지 상세 오픈/마감 규칙 적용
 * 3. 상태 판별: 현재 시간이 오픈 전인지, 신청 마감인지, 취소 마감인지 초 단위 판별
 * 4. 명단 초기화: 시간 규칙이 수정될 경우, 해당 카테고리의 신청 명단을 DB에서 삭제
 * 5. 마스터키 검증 함수 포함
 * -----------------------------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const db = require('../config/db'); // 명단 초기화(DB 삭제)를 위해 필요

// [상수 설정]
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'config.json');
const MASTER_KEY = "2026m"; // 임원진 마스터키

// 5개 카테고리 정의
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
    // [SECTION 1] 설정 및 주차 관리
    // =====================================================================================

    loadConfig() {
        try {
            const data = fs.readFileSync(CONFIG_PATH, 'utf8');
            return JSON.parse(data);
        } catch (err) {
            console.error("❌ [TimeManager] 설정 로드 실패. 기본값 사용.", err);
            return {
                system: { year: 2026, semester: "겨울", week: 1, startDate: "2026-01-05" },
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
        // [핵심] "오늘"이 포함된 주의 월요일을 새로운 개강일로 설정
        const now = new Date();
        const day = now.getDay(); // 0(일)~6(토)
        // 월요일(1)과의 차이 계산 (일요일(0)이면 -6일, 월(1)이면 0일, 화(2)면 -1일)
        const diff = (day === 0 ? -6 : 1 - day); 
        
        const newStart = new Date(now);
        newStart.setDate(now.getDate() + diff);
        
        // 날짜 포맷팅 (YYYY-MM-DD)
        const yyyy = newStart.getFullYear();
        const mm = String(newStart.getMonth() + 1).padStart(2, '0');
        const dd = String(newStart.getDate()).padStart(2, '0');
        const startDateString = `${yyyy}-${mm}-${dd}`;

        this.config.system.semester = newSemester;
        this.config.system.week = 1;
        this.config.system.startDate = startDateString; // 새로운 기준일 저장
        
        this.resetOverrides(); 
        this.saveConfig();
        console.log(`🔄 [TimeManager] ${newSemester} 개강! 기준일: ${startDateString}, 1주차로 리셋됨.`);
    }

    // [스케줄러용] 주차 자동 증가 (매주 토요일 00시 실행)
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
    // [SECTION 2] 시간 규칙 엔진 (핵심 로직)
    // =====================================================================================

    getAllTimerStatus() {
        const result = {};
        CATEGORIES.forEach(cat => {
            result[cat.id] = this.calcCategoryState(cat.id, cat.day, cat.type);
        });
        return result;
    }

    validateApplyTime(targetDay, category) {
        if (targetDay === 'FRI' && category === 'lesson') {
            return { valid: false, msg: "금요일은 레슨이 없습니다." };
        }

        const cat = CATEGORIES.find(c => c.day === targetDay && c.type === category);
        if (!cat) return { valid: false, msg: "잘못된 카테고리입니다." };

        const status = this.calcCategoryState(cat.id, targetDay, category);
        const now = new Date();

        if (status.state === 'OPEN_WAIT') {
            return { valid: false, msg: `아직 신청 시간이 아닙니다.\n(오픈: ${this.formatDate(status.target)})` };
        }
        if (status.state === 'ENDED' || status.state === 'CANCEL_CLOSING') {
            if (now > status.rule.closeTime) {
                return { valid: false, msg: "신청이 마감되었습니다." };
            }
        }

        return { valid: true };
    }
    
    validateCancelTime(targetDay, category) {
        const cat = CATEGORIES.find(c => c.day === targetDay && c.type === category);
        if (!cat) return { valid: false, msg: "오류" };
        
        const status = this.calcCategoryState(cat.id, targetDay, category);
        const now = new Date();

        if (now > status.rule.cancelTime) {
            return { valid: false, msg: "취소 가능 시간이 지났습니다." };
        }
        return { valid: true };
    }

    calcCategoryState(catId, day, type) {
        const now = new Date();
        const rule = this.getRule(catId, day, type); 

        if (now < rule.openTime) {
            return { state: 'OPEN_WAIT', target: rule.openTime, rule };
        }
        if (now < rule.closeTime) {
            return { state: 'CLOSING', target: rule.closeTime, rule };
        }
        if (now < rule.cancelTime) {
            return { state: 'CANCEL_CLOSING', target: rule.cancelTime, rule };
        }
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
     * [수정됨] 저장된 기준일(startDate)을 사용하여 마감 시간 계산
     */
    getDefaultRule(targetDay, type) {
        const currentWeek = this.config.system.week;
        // 설정 파일에 저장된 시작일 불러오기 (없으면 하드코딩 값)
        const start = new Date(this.config.system.startDate || START_DATE_STRING);
        
        const dayOffset = (targetDay === 'WED') ? 2 : 4;
        
        const activityDate = new Date(start);
        activityDate.setDate(start.getDate() + (currentWeek - 1) * 7 + dayOffset);

        let openTime = new Date(activityDate);
        let closeTime = new Date(activityDate);
        let cancelTime = new Date(activityDate);

        // [공통] 오픈: 전주 토요일 22:00
        const openOffset = (targetDay === 'WED') ? -4 : -6;
        openTime.setDate(activityDate.getDate() + openOffset);
        openTime.setHours(22, 0, 0, 0);

        if (targetDay === 'WED') {
            if (type === 'guest') {
                closeTime.setHours(18, 0, 0, 0);
                cancelTime.setDate(activityDate.getDate() + 1);
                cancelTime.setHours(0, 0, 0, 0);
            } else {
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
        const currentWeek = this.config.system.week;
        const start = new Date(this.config.system.startDate || START_DATE_STRING);
        const dayOffset = (targetDay === 'WED') ? 2 : 4;
        
        const targetDate = new Date(start);
        targetDate.setDate(start.getDate() + (currentWeek - 1) * 7 + dayOffset);

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