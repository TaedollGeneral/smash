/**
 * [FILE: utils/TimeManager.js]
 */
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'config.json');
const MASTER_KEY = "2026m"; 

const CATEGORIES = [
    { id: 'WED_EXERCISE', day: 'WED', type: 'exercise' },
    { id: 'WED_LESSON',   day: 'WED', type: 'lesson' },
    { id: 'WED_GUEST',    day: 'WED', type: 'guest' },
    { id: 'FRI_EXERCISE', day: 'FRI', type: 'exercise' },
    { id: 'FRI_GUEST',    day: 'FRI', type: 'guest' }
];

class TimeManager {
    constructor() { this.config = this.loadConfig(); }

    loadConfig() {
        try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } 
        catch (err) { return { system: { year: 2026, semester: "겨울", week: 1 }, overrides: {} }; }
    }

    saveConfig() {
        try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2)); } catch (err) {}
    }

    resetSemester(newSemester, newWeek) {
        this.config.system.semester = newSemester;
        this.config.system.week = newWeek || 1;
        this.resetOverrides(); 
        this.saveConfig();
        console.log(`🔄 [TimeManager] ${newSemester} ${this.config.system.week}주차 설정`);
    }

    incrementWeek() {
        this.config.system.week += 1;
        this.resetOverrides(); 
        this.saveConfig();
    }

    resetOverrides() {
        this.config.overrides = {
            "WED_EXERCISE_OPEN": null, "WED_EXERCISE_CLOSE": null, "WED_EXERCISE_CANCEL": null,
            "WED_GUEST_OPEN": null,    "WED_GUEST_CLOSE": null,    "WED_GUEST_CANCEL": null,
            "WED_LESSON_OPEN": null,   "WED_LESSON_CLOSE": null,   "WED_LESSON_CANCEL": null,
            "FRI_EXERCISE_OPEN": null, "FRI_EXERCISE_CLOSE": null, "FRI_EXERCISE_CANCEL": null,
            "FRI_GUEST_OPEN": null,    "FRI_GUEST_CLOSE": null,    "FRI_GUEST_CANCEL": null
        };
    }

/**
     * [최종 수정] 요일 Offset(-2~4)과 시간을 받아 저장하되, '시간 순서'를 검증함
     */
    updateOverride(key, dayOffset, timeStr) {
        if (!timeStr) return;

        // 1. 기준이 되는 '이번 주 월요일' 찾기
        // (getActivityDate 로직 역이용: 수요일 날짜에서 2일 빼면 월요일)
        const wedDate = this.getActivityDate('WED'); 
        const anchorMon = new Date(wedDate);
        anchorMon.setDate(wedDate.getDate() - 2); 

        // 2. 사용자가 선택한 날짜/시간 생성
        const newDate = new Date(anchorMon);
        newDate.setDate(anchorMon.getDate() + dayOffset);
        const [h, m] = timeStr.split(':').map(Number);
        newDate.setHours(h, m, 0, 0);

        // 3. [검증] 이 시간으로 바꿨을 때 순서가 꼬이지 않는지 확인
        this.validateOverrideOrThrow(key, newDate);

        // 4. 통과되면 저장
        this.config.overrides[key] = newDate.toISOString();
        this.saveConfig();
        console.log(`⚡ [TimeManager] Override 성공: ${key} -> ${this.formatDate(newDate)}`);
    }

    /**
     * [NEW] 시간 순서 검증기 (Open < Close <= Cancel)
     */
    validateOverrideOrThrow(key, newDate) {
        // 키 분석: WED_EXERCISE_OPEN -> [WED_EXERCISE, OPEN]
        const lastUnderscore = key.lastIndexOf('_');
        const catId = key.substring(0, lastUnderscore); // 예: WED_EXERCISE
        const type = key.substring(lastUnderscore + 1); // 예: OPEN

        // 현재 설정된 규칙들 가져오기 (오버라이드 포함)
        // 주의: getRule은 '현재' 설정을 가져오므로, 우리가 바꾸려는 값만 newDate로 교체해서 비교해야 함
        const parts = catId.split('_'); // [WED, EXERCISE]
        const currentRule = this.getRule(catId, parts[0], parts[1].toLowerCase());

        // 가상의 규칙 세트 생성
        const testRule = {
            openTime: (type === 'OPEN') ? newDate : currentRule.openTime,
            closeTime: (type === 'CLOSE') ? newDate : currentRule.closeTime,
            cancelTime: (type === 'CANCEL') ? newDate : currentRule.cancelTime
        };

        // 검증 1: 오픈이 마감보다 늦거나 같으면 안 됨
        if (testRule.openTime >= testRule.closeTime) {
            throw new Error(`⛔ 불가: 투표 오픈(${this.formatDate(testRule.openTime)})이 마감보다 늦을 수 없습니다.`);
        }

        // 검증 2: 마감이 취소 마감보다 늦으면 안 됨 (보통 취소는 마감과 같거나 더 늦게까지 가능)
        if (testRule.closeTime > testRule.cancelTime) {
            throw new Error(`⛔ 불가: 투표 마감(${this.formatDate(testRule.closeTime)})이 취소 마감보다 늦을 수 없습니다.`);
        }
        
        // 검증 3: 오픈이 취소 마감보다 늦으면 당연히 안 됨
        if (testRule.openTime >= testRule.cancelTime) {
            throw new Error("⛔ 불가: 오픈 시간이 취소 마감 시간보다 늦습니다.");
        }
    }
    
    getSystemInfo() { return this.config.system; }

/**
     * [수정됨] 토요일 00시 기준으로 주차가 넘어가도록 날짜 계산 로직 수정
     * - 토(6), 일(0)인 경우, 이미 다음 주 사이클에 진입한 것으로 보고 +7일을 해줌.
     */
    getActivityDate(targetDay) {
        const now = new Date();
        const day = now.getDay(); // 0(일)~6(토)
        
        let targetDate = new Date(now);
        
        // 1. 일단 이번 주 월요일을 찾음
        // (일요일(0)은 JS 달력상 주초지만, 우리는 주말이므로 -6을 해줘야 전주 월요일이 됨)
        const dayDiffToMon = (day === 0) ? -6 : (1 - day);
        targetDate.setDate(now.getDate() + dayDiffToMon);

        // 2. [핵심] 토요일(6) 00시부터는 '새로운 주'로 간주 -> 다음 주 월요일로 점프
        // (일요일도 마찬가지로 새 주차의 시작임)
        if (day === 6 || day === 0) {
            targetDate.setDate(targetDate.getDate() + 7);
        }

        // 3. 월요일 기준으로 목표 요일(수/금) 날짜 계산
        const offset = (targetDay === 'WED') ? 2 : 4;
        targetDate.setDate(targetDate.getDate() + offset);
        targetDate.setHours(0, 0, 0, 0);

        return targetDate;
    }

    getAllTimerStatus() {
        const result = {};
        CATEGORIES.forEach(cat => {
            result[cat.id] = this.calcCategoryState(cat.id, cat.day, cat.type);
        });
        return result;
    }

    validateApplyTime(targetDay, category) {
        if (targetDay === 'FRI' && category === 'lesson') return { valid: false, msg: "금요일 레슨 없음" };
        const cat = CATEGORIES.find(c => c.day === targetDay && c.type === category);
        if (!cat) return { valid: false, msg: "잘못된 카테고리" };

        const status = this.calcCategoryState(cat.id, targetDay, category);
        const now = new Date();

        if (status.state === 'OPEN_WAIT') return { valid: false, msg: `아직 오픈 전입니다.` };
        if (status.state === 'CLOSING') return { valid: true };
        if (status.state === 'CANCEL_CLOSING') return { valid: false, msg: "신청 마감됨" };
        return { valid: true }; 
    }
    
    validateCancelTime(targetDay, category) {
        const cat = CATEGORIES.find(c => c.day === targetDay && c.type === category);
        if (!cat) return { valid: false, msg: "오류" };
        
        const status = this.calcCategoryState(cat.id, targetDay, category);
        const now = new Date();
        if (now > status.rule.cancelTime) return { valid: false, msg: "취소 가능 시간 지남" };
        return { valid: true };
    }

    calcCategoryState(catId, day, type) {
        const now = new Date();
        const rule = this.getRule(catId, day, type); 

        if (now < rule.openTime) return { state: 'OPEN_WAIT', target: rule.openTime, rule };
        if (now < rule.closeTime) return { state: 'CLOSING', target: rule.closeTime, rule };
        if (now < rule.cancelTime) return { state: 'CANCEL_CLOSING', target: rule.cancelTime, rule };
        
        // 무한 순환: 취소 마감 이후엔 다음 주 오픈 시간 표시
        const nextOpen = new Date(rule.openTime);
        nextOpen.setDate(nextOpen.getDate() + 7);
        return { state: 'OPEN_WAIT', target: nextOpen, rule };
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

    getDefaultRule(targetDay, type) {
        const activityDate = this.getActivityDate(targetDay);
        let openTime = new Date(activityDate);
        let closeTime = new Date(activityDate);
        let cancelTime = new Date(activityDate);

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
        } else if (targetDay === 'FRI') {
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

    checkMasterKey(inputKey) { return inputKey === MASTER_KEY; }

    getTitleText(targetDay) {
        const targetDate = this.getActivityDate(targetDay);
        const month = targetDate.getMonth() + 1;
        const date = targetDate.getDate();
        const dayName = (targetDay === 'WED') ? '수요일' : '금요일';
        const type = (targetDay === 'WED') ? '정기운동 18-21시' : '추가운동 15-17시';
        return `${month}/${date} ${dayName} ${type}`;
    }
}

module.exports = new TimeManager();