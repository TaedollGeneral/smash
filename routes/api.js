const express = require('express');
const router = express.Router();
const db = require('../config/db'); // DB 연결 가져오기
const { checkTimeParams } = require('../utils/validator'); // 시간 검증 가져오기
const fs = require('fs');
const path = require('path');

// 경로 설정 (config.json 읽기용)
const configPath = path.join(__dirname, '..', 'config', 'config.json');




// ==========================================
// [API] 신청하기 (APPLY 요청 처리) : 시간 체크 + 비번 체크 + 중복신청 체크
// ==========================================

router.post('/apply', (req, res) => {
    const { id, pwd, category, name, day } = req.body; 

    // 1. [시간 검증]
    const timeCheck = checkTimeParams(day, category);
    if (!timeCheck.valid) return res.json({ success: false, message: timeCheck.msg });

    // 2. [본인 확인]
    const authSql = `SELECT * FROM users WHERE student_id = ? AND password = ?`;
    db.query(authSql, [id, pwd], (err, users) => {
        if (err) return res.status(500).json({ success: false, message: '서버 에러(인증)' });
        if (users.length === 0) return res.json({ success: false, message: '비밀번호가 틀렸거나 없는 학번입니다.' });

        // 신청자 실명 확보
        const realName = users[0].name;

        // 3. [★중복 검사★] 해당 요일(day)에 같은 카테고리(category)를 이미 신청했는지 확인
        const dupSql = `SELECT * FROM applications WHERE student_id = ? AND day = ? AND category = ?`;
        
        db.query(dupSql, [id, day, category], (dupErr, dupRows) => {
            if (dupErr) return res.status(500).json({ success: false, message: '중복 확인 중 에러' });

            // 이미 데이터가 있다면? -> 중복! 삐- 🙅‍♂️
            if (dupRows.length > 0) {
                // 친절하게 무슨 요일, 무슨 종목인지 알려줌
                const korCategory = (category === 'exercise') ? '운동' : (category === 'guest' ? '게스트' : '레슨');
                return res.json({ success: false, message: `이미 [${day} ${korCategory}] 신청 내역이 있습니다.` });
            }

            // 4. [저장] 중복 아님! 이제 진짜 저장
            const insertSql = `INSERT INTO applications (student_id, day, category, guest_name) VALUES (?, ?, ?, ?)`;
            
            db.query(insertSql, [id, day, category, name], (insertErr, result) => {
                if (insertErr) return res.status(500).json({ success: false, message: '저장 에러' });

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




// ==========================================
// [API] 신청 취소하기 (DELETE 요청 처리)
// ==========================================

router.post('/cancel', (req, res) => {
    // ★ [수정] day(요일) 정보도 같이 받습니다.
    const { id, pwd, category, day } = req.body;

    // [추가] 시간 검증 ⛔
    const timeCheck = checkTimeParams(day, category);
    if (!timeCheck.valid) {
        return res.json({ success: false, message: timeCheck.msg });
    }

    // 1. 본인 확인
    const authSql = `SELECT * FROM users WHERE student_id = ? AND password = ?`;
    
    db.query(authSql, [id, pwd], (err, users) => {
        if (err) return res.status(500).json({ success: false, message: '서버 에러(인증)' });

        if (users.length === 0) {
            return res.json({ success: false, message: '비밀번호가 틀렸거나 없는 학번입니다.' });
        }

        // 2. 삭제 진행 (조건 강화)
        // ★ [수정] 학번, 카테고리 뿐만 아니라 '요일(day)'도 맞아야 지웁니다!
        const deleteSql = `DELETE FROM applications WHERE student_id = ? AND category = ? AND day = ?`;

        db.query(deleteSql, [id, category, day], (delErr, result) => {
            if (delErr) return res.status(500).json({ success: false, message: '삭제 중 에러 발생' });

            if (result.affectedRows === 0) {
                return res.json({ success: false, message: '해당 요일에 신청한 내역이 없습니다.' });
            }

            console.log(`🗑️ 취소 완료: ${id} (${category}, ${day})`);
            res.json({ success: true, message: '취소가 완료되었습니다.' });
        });
    });
});



// ==========================================
// [API] 현황판 데이터 주기 (2초마다 호출해서 명단 가져감)
// ==========================================

router.get('/status', (req, res) => {

    // 1. 프론트엔드가 요청한 요일(?day=WED)을 확인합니다.
    const day = req.query.day || 'WED';

    // 2. 해당 요일(day)에 해당하는 신청자만 DB에서 가져옵니다.
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
            res.json(results); // 가져온 데이터를 그대로 돌려줌
        }
    });
});


// ==========================================
// [API] 현재 주차 정보 알려주기
// ==========================================

router.get('/info', (req, res) => {
    try {
        // 메모장을 읽어서 손님(웹페이지)한테 보여줌
        const configData = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configData);
        res.json(config);
    } catch (err) {
        console.error("설정 파일 읽기 실패:", err);
        res.status(500).json({ error: "Config Error" });
    }
});

module.exports = router;