/**
 * [FILE: routes/api.js]
 * 역할: 프론트엔드와 서버의 소통 창구 (TimeManager 적용 완료)
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const TimeManager = require('../utils/TimeManager'); // [핵심] TimeManager 연결

// ============================================================
// [SECTION 1] 일반 사용자 기능 (신청/취소/조회)
// ============================================================

// 1. 신청하기
router.post('/apply', async (req, res) => {
    const { id, pwd, category, name, day } = req.body;

    // 1-1. 마스터키 확인 (비번이 마스터키면 프리패스)
    const isMaster = TimeManager.checkMasterKey(pwd);
    let applicantName = "관리자(대리)";

    if (!isMaster) {
        // 1-2. [TimeManager] 신청 가능 시간인지 검증
        const timeCheck = TimeManager.validateApplyTime(day, category);
        if (!timeCheck.valid) {
            return res.json({ success: false, message: timeCheck.msg });
        }

        // 1-3. 본인 확인 (DB 조회 - 기존 로직 유지)
        // (validator.js가 사라졌으므로 checkUserAuth 로직을 여기로 가져오거나 별도 유틸로 분리해야 하지만,
        //  편의상 여기에 직접 DB 조회를 구현하거나, 기존 validator의 checkUserAuth만 따로 살려두는 방법이 있음.
        //  여기서는 '본인 확인' 로직을 간단하게 인라인으로 구현합니다.)
        try {
            const user = await checkUserAuth(id, pwd);
            if (!user.valid) return res.json({ success: false, message: user.msg });
            applicantName = user.name;
        } catch (e) {
            return res.json({ success: false, message: "DB 에러" });
        }
    }

    // 1-4. 중복 검사 및 저장
    const dupSql = `SELECT * FROM applications WHERE student_id = ? AND day = ? AND category = ?`;
    db.query(dupSql, [id, day, category], (err, rows) => {
        if (rows.length > 0) return res.json({ success: false, message: "이미 신청 내역이 있습니다." });

        const insertSql = `INSERT INTO applications (student_id, day, category, guest_name) VALUES (?, ?, ?, ?)`;
        db.query(insertSql, [id, day, category, name], (err) => {
            if (err) return res.status(500).json({ success: false, message: '저장 에러' });
            res.json({ success: true, message: '신청 완료!', userName: applicantName });
        });
    });
});

// 2. 취소하기
router.post('/cancel', async (req, res) => {
    const { id, pwd, category, day } = req.body;
    const isMaster = TimeManager.checkMasterKey(pwd);

    if (!isMaster) {
        // 2-1. [TimeManager] 취소 가능 시간인지 검증
        const timeCheck = TimeManager.validateCancelTime(day, category);
        if (!timeCheck.valid) return res.json({ success: false, message: timeCheck.msg });

        // 2-2. 본인 확인
        try {
            const user = await checkUserAuth(id, pwd);
            if (!user.valid) return res.json({ success: false, message: user.msg });
        } catch (e) {
            return res.json({ success: false, message: "DB 에러" });
        }
    }

    // 2-3. 삭제
    const deleteSql = `DELETE FROM applications WHERE student_id = ? AND category = ? AND day = ?`;
    db.query(deleteSql, [id, category, day], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'DB 에러' });
        if (result.affectedRows === 0) return res.json({ success: false, message: '신청 내역이 없습니다.' });
        res.json({ success: true, message: '취소 완료' });
    });
});

// 3. 현황 조회 (기존 유지)
router.get('/status', (req, res) => {
    const day = req.query.day || 'WED';
    const sql = `
        SELECT a.category, u.name as user_name, a.guest_name, a.student_id, a.created_at 
        FROM applications a
        JOIN users u ON a.student_id = u.student_id
        WHERE a.day = ? 
        ORDER BY a.created_at ASC
    `;
    db.query(sql, [day], (err, results) => {
        if (err) res.status(500).send('DB Error');
        else res.json(results);
    });
});


// ============================================================
// [SECTION 2] 프론트엔드 UI 지원 API (신규 추가!)
// ============================================================

// 4. [NEW] 타이머 정보 제공 (5개 카테고리 상태 한 번에)
// 프론트엔드는 이 정보를 받아 화면에 그리기만 하면 됨
router.get('/timer', (req, res) => {
    const status = TimeManager.getAllTimerStatus();
    res.json(status);
});

// 5. [NEW] 명단 제목 텍스트 제공 (복사용)
// 예: "1/21 수요일 정기운동"
router.get('/title-text', (req, res) => {
    const day = req.query.day || 'WED';
    const text = TimeManager.getTitleText(day);
    res.json({ text });
});

// 6. [NEW] 현재 시스템 정보 (주차 등)
router.get('/info', (req, res) => {
    const info = TimeManager.getSystemInfo();
    res.json(info);
});


// ============================================================
// [SECTION 3] 관리자 전용 API
// ============================================================

// 7. 관리자 인증 확인
router.post('/admin/verify', (req, res) => {
    const { masterKey } = req.body;
    if (TimeManager.checkMasterKey(masterKey)) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: "비밀번호 불일치" });
    }
});


// 8. [수정] 학기 및 주차 설정
router.post('/admin/semester', (req, res) => {
    const { masterKey, semester, week } = req.body; // [NEW] week 추가
    
    if (!TimeManager.checkMasterKey(masterKey)) {
        return res.json({ success: false, message: "관리자 권한이 없습니다." });
    }

    if (!semester || !week) return res.json({ success: false, message: "정보가 부족합니다." });

    // TimeManager에게 (학기, 주차) 전달
    TimeManager.resetSemester(semester, parseInt(week));
    res.json({ success: true, message: `${semester}학기 ${week}주차로 설정되었습니다.` });
});

// ============================================================
// [Helper] 본인 확인 함수 (DB 조회) - 내부 사용
// ============================================================
function checkUserAuth(id, pwd) {
    return new Promise((resolve, reject) => {
        const sql = `SELECT name FROM users WHERE student_id = ? AND password = ?`;
        db.query(sql, [id, pwd], (err, users) => {
            if (err) return reject(err);
            if (users.length === 0) return resolve({ valid: false, msg: "학번 또는 비밀번호 오류" });
            resolve({ valid: true, name: users[0].name });
        });
    });
}

module.exports = router;