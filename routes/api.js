/**
 * [FILE: routes/api.js]
 * 역할: 신청, 취소, 조회 등 서비스의 핵심 기능을 담당하는 API 라우터입니다.
 * 주요 기능: 신청자 인증, 중복 검사, DB 기록, 실시간 현황 데이터 제공
 */




// ---------------------------------------------------------
// 1. 외부 모듈 및 설정 로드
// ---------------------------------------------------------
const express = require('express');
const router = express.Router();              // Express의 라우터 시스템 사용
const db = require('../config/db');           // 데이터베이스 연결 객체 로드
const fs = require('fs');                     // 파일 읽기용 모듈
const path = require('path');                 // 경로 조작용 도구

// validator 호출
const { checkTimeParams, checkMasterAuth, checkUserAuth } = require('../utils/validator');

// 현재 파일 기준 상위 폴더의 config/config.json 경로 설정
const configPath = path.join(__dirname, '..', 'config', 'config.json');




// ---------------------------------------------------------
// 2. [POST] /api/apply : 신청하기
// ---------------------------------------------------------
router.post('/apply', async (req, res) => {
    const { id, pwd, category, name, day } = req.body;

    // 1. 마스터키 확인 (맞으면 바로 통과)
    const master = checkMasterAuth(pwd);
    let applicantName = "관리자(대리)";

    if (!master.valid) {
        // 2. 시간 확인 (일반 유저일 때만)
        const time = checkTimeParams(day, category);
        if (!time.valid) return res.json({ success: false, message: time.msg });

        // 3. 본인 확인 (일반 유저일 때만)
        const user = await checkUserAuth(id, pwd);
        if (!user.valid) return res.json({ success: false, message: user.msg });
        
        applicantName = user.name; // 실제 이름 확보
    } else {
        // 만약 토요일 오픈 전 에러 메시지가 있다면 출력
        if (master.msg) return res.json({ success: false, message: master.msg });
    }

    // --- 최종 저장 로직 (마스터든 유저든 여기로 옴) ---
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


// ---------------------------------------------------------
// 3. [POST] /api/cancel : 신청 취소하기
// ---------------------------------------------------------
router.post('/cancel', async (req, res) => {
    const { id, pwd, category, day } = req.body;

    // [STEP 1] 마스터키 확인 (맞으면 통과)
    const master = checkMasterAuth(pwd);
    
    // 마스터키가 아닐 때만 일반 검증 수행
    if (!master.valid) {
        // [STEP 2] 시간 검증 (일반 유저 전용)
        const time = checkTimeParams(day, category);
        if (!time.valid) return res.json({ success: false, message: time.msg });

        // [STEP 3] 본인 확인 (일반 유저 전용)
        const user = await checkUserAuth(id, pwd);
        if (!user.valid) return res.json({ success: false, message: user.msg });
    } else {
        // 마스터키인데 만약 토요일 오픈 전 금지 조건에 걸렸다면 차단
        if (master.msg) return res.json({ success: false, message: master.msg });
    }

    // [STEP 4] 실제 삭제 진행 (마스터키 혹은 본인인증 통과자만 도달)
    const deleteSql = `DELETE FROM applications WHERE student_id = ? AND category = ? AND day = ?`;

    db.query(deleteSql, [id, category, day], (delErr, result) => {
        if (delErr) return res.status(500).json({ success: false, message: '삭제 중 에러 발생' });

        // 영향받은 행(affectedRows)이 0개면 해당 데이터가 없는 것
        if (result.affectedRows === 0) {
            return res.json({ success: false, message: '해당 요일에 신청한 내역이 없습니다.' });
        }

        console.log(`🗑️ [취소 완료] ${master.valid ? '(마스터)' : '(본인)'} ID: ${id} 요일: ${day}`);
        res.json({ success: true, message: '취소가 완료되었습니다.' });
    });
});

// ---------------------------------------------------------
// 4. [GET] /api/status : 신청 현황 조회
// ---------------------------------------------------------
router.get('/status', (req, res) => {
    // 쿼리 스트링으로 전달된 요일(?day=WED)을 받거나 기본값으로 WED를 사용합니다.
    const day = req.query.day || 'WED';

    // 회원 테이블(users)과 조인하여 학번이 아닌 '이름'이 나오도록 쿼리합니다.
    const sql = `
        SELECT a.category, u.name as user_name, a.guest_name, a.student_id, a.created_at 
        FROM applications a
        JOIN users u ON a.student_id = u.student_id
        WHERE a.day = ? 
        ORDER BY a.created_at ASC
    `;

    db.query(sql, [day], (err, results) => {
        if (err) {
            console.error(err);
            res.status(500).send('DB Error');
        } else {
            // 조회된 명단 데이터를 JSON 형태로 프론트엔드에 전달합니다.
            res.json(results);
        }
    });
});

// ---------------------------------------------------------
// 5. [GET] /api/info : 현재 운영 정보(주차) 조회
// ---------------------------------------------------------
router.get('/info', (req, res) => {
    try {
        // config.json 파일을 읽어서 현재가 몇 주차인지 등의 정보를 제공합니다.
        const configData = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configData);
        res.json(config);
    } catch (err) {
        console.error("❌ 설정 파일 읽기 실패:", err);
        res.status(500).json({ error: "Config Error" });
    }
});

// ---------------------------------------------------------
// 6. 라우터 내보내기
// ---------------------------------------------------------
module.exports = router;