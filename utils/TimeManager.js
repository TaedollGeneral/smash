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
     * [수정됨] "시간(HH:MM)"만 입력받아, 자동으로 '이번 주 해당 요일'의 날짜와 결합합니다.
     * 절대 날짜를 입력받지 않으므로, 주간 반복 시스템의 철학을 완벽하게 따릅니다.
     */
    updateOverride(key, timeStr) {
        if (!timeStr) return;

        // 1. 키에서 요일 추출 (예: WED_EXERCISE_OPEN -> WED)
        const targetDay = key.startsWith('FRI') ? 'FRI' : 'WED';

        // 2. [핵심] '이번 주'의 해당 요일 날짜를 서버가 직접 계산 (클라이언트 날짜 무시)
        const targetDate = this.getActivityDate(targetDay);

        // 3. 입력받은 시간(HH:MM)을 기준 날짜에 적용
        const [hour, minute] = timeStr.split(':').map(Number);
        targetDate.setHours(hour, minute, 0, 0);

        // 4. 완성된 시점을 저장
        this.config.overrides[key] = targetDate.toISOString();
        
        this.saveConfig();
        console.log(`⚡ [TimeManager] Override 적용: ${key} -> ${timeStr} (기준일: ${this.formatDate(targetDate)})`);
    }

    getSystemInfo() { return this.config.system; }

    getActivityDate(targetDay) {
        const now = new Date();
        const day = now.getDay(); 
        const hour = now.getHours();
        const isNextCycle = (day === 6 && hour >= 22);
        
        let targetDate = new Date(now);
        const dayDiffToMon = (day === 0) ? -6 : (1 - day);
        targetDate.setDate(now.getDate() + dayDiffToMon);

        if (isNextCycle) targetDate.setDate(targetDate.getDate() + 7);

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