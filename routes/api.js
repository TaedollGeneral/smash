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
const { checkTimeParams } = require('../utils/validator'); // 시간 검증 유틸리티 로드
const fs = require('fs');                     // 파일 읽기용 모듈
const path = require('path');                 // 경로 조작용 도구

// 현재 파일 기준 상위 폴더의 config/config.json 경로 설정
const configPath = path.join(__dirname, '..', 'config', 'config.json');

// ---------------------------------------------------------
// 2. [POST] /api/apply : 신청하기
// ---------------------------------------------------------
router.post('/apply', (req, res) => {
    // 클라이언트가 보낸 데이터 추출 (학번, 비번, 종목, 이름, 요일)
    const { id, pwd, category, name, day } = req.body; 

    // [STEP 1: 시간 검증] 신청 가능한 요일/시간인지 수문장(validator)에게 물어봅니다.
    const timeCheck = checkTimeParams(day, category);
    if (!timeCheck.valid) {
        return res.json({ success: false, message: timeCheck.msg });
    }

    // [STEP 2: 본인 확인] 회원 테이블(users)에서 학번과 비밀번호가 일치하는지 확인합니다.
    const authSql = `SELECT * FROM users WHERE student_id = ? AND password = ?`;
    db.query(authSql, [id, pwd], (err, users) => {
        if (err) return res.status(500).json({ success: false, message: '서버 에러(인증)' });
        if (users.length === 0) {
            return res.json({ success: false, message: '비밀번호가 틀렸거나 없는 학번입니다.' });
        }

        // 인증 성공 시, DB에 등록된 회원의 진짜 이름을 가져옵니다.
        const realName = users[0].name;

        // [STEP 3: 중복 신청 검사] 같은 요일에 동일한 카테고리로 이미 신청했는지 확인합니다.
        const dupSql = `SELECT * FROM applications WHERE student_id = ? AND day = ? AND category = ?`;
        
        db.query(dupSql, [id, day, category], (dupErr, dupRows) => {
            if (dupErr) return res.status(500).json({ success: false, message: '중복 확인 중 에러' });

            // 기존 신청 내역이 이미 존재한다면 중복으로 간주하고 중단합니다.
            if (dupRows.length > 0) {
                const korCategory = (category === 'exercise') ? '운동' : (category === 'guest' ? '게스트' : '레슨');
                return res.json({ success: false, message: `이미 [${day} ${korCategory}] 신청 내역이 있습니다.` });
            }

            // [STEP 4: 최종 저장] 모든 검사를 통과했으므로 신청 내역 테이블(applications)에 저장합니다.
            const insertSql = `INSERT INTO applications (student_id, day, category, guest_name) VALUES (?, ?, ?, ?)`;
            
            db.query(insertSql, [id, day, category, name], (insertErr, result) => {
                if (insertErr) return res.status(500).json({ success: false, message: '저장 에러' });

                // 성공 결과와 함께 사용자 이름, 요일 등 UI 업데이트에 필요한 정보를 보냅니다.
                res.json({ 
                    success: true, 
                    message: '신청이 완료되었습니다!',
                    category: category, 
                    userName: realName, 
                    guestName: name, 
                    day: day
                });
            });
        });
    });
});

// ---------------------------------------------------------
// 3. [POST] /api/cancel : 신청 취소하기
// ---------------------------------------------------------
router.post('/cancel', (req, res) => {
    const { id, pwd, category, day } = req.body;

    // [STEP 1: 시간 검증] 취소가 가능한 시간대인지 먼저 확인합니다.
    const timeCheck = checkTimeParams(day, category);
    if (!timeCheck.valid) {
        return res.json({ success: false, message: timeCheck.msg });
    }

    // [STEP 2: 본인 확인] 본인의 신청 내역을 지우는 것이 맞는지 인증 과정을 거칩니다.
    const authSql = `SELECT * FROM users WHERE student_id = ? AND password = ?`;
    
    db.query(authSql, [id, pwd], (err, users) => {
        if (err) return res.status(500).json({ success: false, message: '서버 에러(인증)' });
        if (users.length === 0) {
            return res.json({ success: false, message: '비밀번호가 틀렸거나 없는 학번입니다.' });
        }

        // [STEP 3: 삭제 진행] 학번, 요일, 종목이 모두 일치하는 행을 찾아 삭제합니다.
        const deleteSql = `DELETE FROM applications WHERE student_id = ? AND category = ? AND day = ?`;

        db.query(deleteSql, [id, category, day], (delErr, result) => {
            if (delErr) return res.status(500).json({ success: false, message: '삭제 중 에러 발생' });

            // 만약 삭제된 행(affectedRows)이 0개라면 신청 내역이 없다는 뜻입니다.
            if (result.affectedRows === 0) {
                return res.json({ success: false, message: '해당 요일에 신청한 내역이 없습니다.' });
            }

            console.log(`🗑️ [취소] 완료: ${id} (${category}, ${day})`);
            res.json({ success: true, message: '취소가 완료되었습니다.' });
        });
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